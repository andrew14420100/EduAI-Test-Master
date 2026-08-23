import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { lte } from "drizzle-orm";
import { ObjectPermission } from "../lib/objectAcl";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { db, pendingUploadsTable } from "@workspace/db";
import { MAX_MEDIA_UPLOAD_BYTES } from "../lib/mediaLimits";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Presigned URL TTL in seconds (15 minutes)
const UPLOAD_TTL_SEC = 900;
const PENDING_UPLOAD_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Remove upload bookkeeping that can no longer be finalized.
 *
 * The expiry predicate is part of the DELETE itself, rather than a
 * select-then-delete sequence, so an upload that is still active at cleanup
 * time cannot be removed.
 */
export async function cleanupExpiredPendingUploads(): Promise<number> {
  const result = await db
    .delete(pendingUploadsTable)
    .where(lte(pendingUploadsTable.expiresAt, new Date()));
  return result.rowCount ?? 0;
}

export function schedulePendingUploadCleanup(
  log: Pick<Console, "error"> = console,
): NodeJS.Timeout {
  const runCleanup = () => {
    void cleanupExpiredPendingUploads().catch((error) => {
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
