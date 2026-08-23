import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { and, eq, lte } from "drizzle-orm";
import { ObjectPermission } from "../lib/objectAcl";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { db, materialsTable, pendingUploadsTable } from "@workspace/db";
import { MAX_MEDIA_UPLOAD_BYTES } from "../lib/mediaLimits";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Presigned URL TTL in seconds (15 minutes)
const UPLOAD_TTL_SEC = 900;
const PENDING_UPLOAD_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const PENDING_UPLOAD_CLEANUP_BATCH_SIZE = 100;
const PENDING_UPLOAD_CLEANUP_ALERT_THRESHOLD = 3;

let cleanupFailureCount = 0;
let cleanupFailureAlerted = false;
let cleanupLastFailureAt: Date | null = null;
let cleanupLastRecoveredAt: Date | null = null;

type CleanupLog = Pick<Console, "warn" | "error">;

function recordCleanupFailure(log: CleanupLog, failedCount = 1): void {
  cleanupFailureCount += failedCount;
  cleanupLastFailureAt = new Date();
  if (
    !cleanupFailureAlerted &&
    cleanupFailureCount >= PENDING_UPLOAD_CLEANUP_ALERT_THRESHOLD
  ) {
    cleanupFailureAlerted = true;
    log.error(
      {
        event: "pending_upload_cleanup_failure_alert",
        failureCount: cleanupFailureCount,
        threshold: PENDING_UPLOAD_CLEANUP_ALERT_THRESHOLD,
      },
      "Repeated abandoned upload cleanup failures",
    );
  }
}

function recordCleanupSuccess(): void {
  if (cleanupFailureCount > 0) {
    cleanupLastRecoveredAt = new Date();
  }
  cleanupFailureCount = 0;
  cleanupFailureAlerted = false;
}

export type PendingUploadCleanupHealth = {
  status: "active" | "recovered";
  failureCount: number;
  threshold: number;
  lastFailureAt: Date | null;
  lastRecoveredAt: Date | null;
};

export function getPendingUploadCleanupHealth(): PendingUploadCleanupHealth {
  return {
    status: cleanupFailureCount > 0 ? "active" : "recovered",
    failureCount: cleanupFailureCount,
    threshold: PENDING_UPLOAD_CLEANUP_ALERT_THRESHOLD,
    lastFailureAt: cleanupLastFailureAt,
    lastRecoveredAt: cleanupLastRecoveredAt,
  };
}

/**
 * Remove upload bookkeeping that can no longer be finalized.
 *
 * The expiry predicate is part of the per-row DELETE itself, rather than a
 * broad select-then-delete sequence, so an upload that is still active at
 * cleanup time cannot be removed.
 */
export async function cleanupExpiredPendingUploads(
  log: CleanupLog = console,
): Promise<number> {
  const expired = await db
    .select()
    .from(pendingUploadsTable)
    .where(lte(pendingUploadsTable.expiresAt, new Date()))
    .limit(PENDING_UPLOAD_CLEANUP_BATCH_SIZE);

  let cleaned = 0;
  let failed = 0;
  for (const pending of expired) {
    // A finalized material is the source of truth. Never delete its object,
    // even if a stale pending row remains for any reason.
    const [material] = await db
      .select({ objectPath: materialsTable.objectPath })
      .from(materialsTable)
      .where(eq(materialsTable.objectPath, pending.objectPath))
      .limit(1);

    if (!material) {
      try {
        // Delete the object first. If storage is unavailable, retain the row
        // so the next bounded pass can retry rather than losing its path.
        await objectStorageService.deleteObjectEntity(pending.objectPath);
      } catch (error) {
        log.warn({ err: error, objectPath: pending.objectPath }, "Impossibile eliminare upload abbandonato");
        failed += 1;
        continue;
      }
    }

    // Keep the expiry guard in the DELETE so a row that became active again
    // cannot be removed by a stale cleanup candidate.
    const result = await db
      .delete(pendingUploadsTable)
      .where(
        and(
          eq(pendingUploadsTable.objectPath, pending.objectPath),
          lte(pendingUploadsTable.expiresAt, new Date()),
        ),
      );
    cleaned += result.rowCount ?? 0;
  }
  if (failed > 0) {
    recordCleanupFailure(log, failed);
  } else {
    recordCleanupSuccess();
  }
  return cleaned;
}

export function schedulePendingUploadCleanup(
  log: CleanupLog = console,
): NodeJS.Timeout {
  const runCleanup = () => {
    void cleanupExpiredPendingUploads(log).catch((error) => {
      recordCleanupFailure(log);
      log.error("Pending upload cleanup failed", error);
    });
  };

  runCleanup();
  const interval = setInterval(runCleanup, PENDING_UPLOAD_CLEANUP_INTERVAL_MS);
  interval.unref();
  return interval;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * Requires Clerk auth.
 * NEVER sets ACL before the object exists.
 * Inserts a pending_uploads row for lifecycle verification in POST /materials.
 */
router.post(
  "/storage/uploads/request-url",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Campi mancanti o non validi" });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      if (
        (contentType.toLowerCase().startsWith("audio/") ||
          contentType.toLowerCase().startsWith("video/")) &&
        size > MAX_MEDIA_UPLOAD_BYTES
      ) {
        res.status(400).json({
          error: "Audio e video possono essere analizzati fino a 250 MB.",
        });
        return;
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL(contentType);
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      // Insert pending row BEFORE returning the URL (object does not exist yet)
      const expiresAt = new Date(Date.now() + UPLOAD_TTL_SEC * 1000);
      await db.insert(pendingUploadsTable).values({
        objectPath,
        ownerId: userId,
        name,
        contentType,
        size,
        expiresAt,
      }).onConflictDoUpdate({
        target: pendingUploadsTable.objectPath,
        set: {
          ownerId: userId,
          name,
          contentType,
          size,
          expiresAt,
          createdAt: new Date(),
        },
      });

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Errore generazione URL upload");
      res.status(500).json({ error: "Impossibile generare URL di upload" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS — no auth required.
 */
router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File non trovato" });
        return;
      }

      const response = await objectStorageService.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as unknown as import("node:stream/web").ReadableStream,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, "Errore serving oggetto pubblico");
      res.status(500).json({ error: "Impossibile servire il file" });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * Requires Clerk auth + owner check via ACL.
 */
router.get(
  "/storage/objects/*path",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile =
        await objectStorageService.getObjectEntityFile(objectPath);

      const canAccess = await objectStorageService.canAccessObjectEntity({
        userId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        res.status(403).json({ error: "Accesso negato" });
        return;
      }

      const response = await objectStorageService.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as unknown as import("node:stream/web").ReadableStream,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log.warn({ err: error }, "Oggetto non trovato");
        res.status(404).json({ error: "Oggetto non trovato" });
        return;
      }
      req.log.error({ err: error }, "Errore serving oggetto privato");
      res.status(500).json({ error: "Impossibile servire il file" });
    }
  },
);

export default router;
