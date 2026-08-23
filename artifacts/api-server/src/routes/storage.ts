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
import {
  db,
  materialsTable,
  pendingUploadCleanupTable,
  pendingUploadsTable,
} from "@workspace/db";
import { MAX_MEDIA_UPLOAD_BYTES } from "../lib/mediaLimits";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Presigned URL TTL in seconds (15 minutes)
const UPLOAD_TTL_SEC = 900;
const PENDING_UPLOAD_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const PENDING_UPLOAD_CLEANUP_BATCH_SIZE = 100;
const PENDING_UPLOAD_CLEANUP_ALERT_THRESHOLD = 3;

const CLEANUP_HEALTH_KEY = "pending_upload_cleanup";
let cleanupFailureAlerted = false;

type CleanupLog = Pick<Console, "warn" | "error">;

async function persistCleanupHealth(
  state: {
    status: "active" | "recovered";
    failureCount: number;
    lastFailureAt: Date | null;
    incidentStartedAt: Date | null;
    lastRecoveredAt: Date | null;
  },
): Promise<void> {
  await db
    .insert(pendingUploadCleanupTable)
    .values({
      key: CLEANUP_HEALTH_KEY,
      ...state,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pendingUploadCleanupTable.key,
      set: {
        status: state.status,
        failureCount: state.failureCount,
        lastFailureAt: state.lastFailureAt,
        incidentStartedAt: state.incidentStartedAt,
        lastRecoveredAt: state.lastRecoveredAt,
        updatedAt: new Date(),
      },
    });
}

async function recordCleanupFailure(
  log: CleanupLog,
  failedCount = 1,
  previous?: PendingUploadCleanupHealth,
): Promise<void> {
  const failureCount = (previous?.failureCount ?? 0) + failedCount;
  const lastFailureAt = new Date();
  try {
    await persistCleanupHealth({
      status: "active",
      failureCount,
      lastFailureAt,
      incidentStartedAt:
        previous?.status === "active" && previous.incidentStartedAt
          ? previous.incidentStartedAt
          : lastFailureAt,
      lastRecoveredAt: previous?.lastRecoveredAt ?? null,
    });
  } catch (error) {
    log.error({ err: error }, "Unable to persist pending upload cleanup state");
  }
  if (
    !cleanupFailureAlerted &&
    failureCount >= PENDING_UPLOAD_CLEANUP_ALERT_THRESHOLD
  ) {
    cleanupFailureAlerted = true;
    log.error(
      {
        event: "pending_upload_cleanup_failure_alert",
        failureCount,
        threshold: PENDING_UPLOAD_CLEANUP_ALERT_THRESHOLD,
      },
      "Repeated abandoned upload cleanup failures",
    );
  }
}

async function recordCleanupSuccess(
  previous?: PendingUploadCleanupHealth,
  log: CleanupLog = console,
): Promise<void> {
  const lastRecoveredAt =
    previous && previous.failureCount > 0 ? new Date() : previous?.lastRecoveredAt ?? null;
  try {
    await persistCleanupHealth({
      status: "recovered",
      failureCount: 0,
      lastFailureAt: previous?.lastFailureAt ?? null,
      incidentStartedAt: null,
      lastRecoveredAt,
    });
  } catch (error) {
    log.error({ err: error }, "Unable to persist pending upload cleanup state");
  }
  cleanupFailureAlerted = false;
}

export type PendingUploadCleanupHealth = {
  status: "active" | "recovered";
  failureCount: number;
  threshold: number;
  lastFailureAt: Date | null;
  lastRecoveredAt: Date | null;
  incidentStartedAt: Date | null;
};

export async function getPendingUploadCleanupHealth(): Promise<PendingUploadCleanupHealth> {
  const [persisted] = await db
    .select()
    .from(pendingUploadCleanupTable)
    .where(eq(pendingUploadCleanupTable.key, CLEANUP_HEALTH_KEY))
    .limit(1);
  const failureCount = persisted?.failureCount ?? 0;
  return {
    status: persisted?.status === "active" && failureCount > 0 ? "active" : "recovered",
    failureCount,
    threshold: PENDING_UPLOAD_CLEANUP_ALERT_THRESHOLD,
    lastFailureAt: persisted?.lastFailureAt ?? null,
    lastRecoveredAt: persisted?.lastRecoveredAt ?? null,
    incidentStartedAt:
      persisted?.status === "active" ? persisted.lastFailureAt ?? null : null,
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
  const previous = await getPendingUploadCleanupHealth();
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
    await recordCleanupFailure(log, failed, previous);
  } else {
    await recordCleanupSuccess(previous, log);
  }
  return cleaned;
}

export function schedulePendingUploadCleanup(
  log: CleanupLog = console,
): NodeJS.Timeout {
  const runCleanup = () => {
    void cleanupExpiredPendingUploads(log).catch((error) => {
      void recordCleanupFailure(log).catch(() => undefined);
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
