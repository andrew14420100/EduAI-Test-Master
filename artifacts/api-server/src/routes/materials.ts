import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, and, gt, lte, sql } from "drizzle-orm";
import {
  db,
  materialsTable,
  pendingUploadsTable,
  studyGroupsTable,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { setObjectAclPolicy } from "../lib/objectAcl";
import {
  extractStudyText,
  classifyContent,
  readinessMessage,
  MAX_EXTRACT_BYTES,
  type ExtractionResult,
} from "../lib/contentStudy";
import { generateMaterialTitle } from "../lib/studyAi";
import type { File } from "@google-cloud/storage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * Download up to MAX_EXTRACT_BYTES from a storage object and extract study text.
 * Never throws: any download/extraction problem is captured as a `failed`
 * result so the material import is not lost.
 */
async function extractFromObject(
  objectFile: File,
  contentType: string,
  fileName: string,
): Promise<ExtractionResult> {
  // Unsupported media stay importable as archive-only items. Do not download
  // large image/audio/video objects merely to discover that OCR/transcription
  // is unavailable.
  if (classifyContent(contentType, fileName) === "unsupported") {
    return extractStudyText(Buffer.alloc(0), contentType, fileName);
  }

  try {
    const chunks: Buffer[] = [];
    let total = 0;
    const stream = objectFile.createReadStream();
    for await (const chunk of stream) {
      const buf = chunk as Buffer;
      total += buf.length;
      if (total > MAX_EXTRACT_BYTES) {
        stream.destroy();
        return {
          status: "failed",
          text: null,
          error:
            "Il file supera la dimensione massima consentita per l'estrazione del testo.",
        };
      }
      chunks.push(buf);
    }
    return extractStudyText(Buffer.concat(chunks), contentType, fileName);
  } catch {
    return {
      status: "failed",
      text: null,
      error:
        "Impossibile leggere il contenuto del file per l'estrazione del testo.",
    };
  }
}

/**
 * Shape a material row for list/detail responses WITHOUT leaking extractedText.
 * Exposes extractionStatus and a safe Italian readiness message.
 */
function toPublicMaterial(m: {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  contentType: string;
  objectPath: string;
  size: number | null;
  groupId: string | null;
  extractionStatus: string;
  extractionError: string | null;
  createdAt: Date;
}) {
  const status = m.extractionStatus as
    | "ready"
    | "unsupported"
    | "failed"
    | "pending";
  return {
    id: m.id,
    ownerId: m.ownerId,
    title: m.title,
    description: m.description,
    contentType: m.contentType,
    objectPath: m.objectPath,
    size: m.size,
    groupId: m.groupId,
    extractionStatus: status,
    extractionMessage: readinessMessage(status, m.extractionError),
    isStudyReady: status === "ready",
    createdAt: m.createdAt,
  };
}

/** Sentinel thrown inside the finalize transaction when the pending row was already consumed. */
class PendingAlreadyConsumedError extends Error {
  constructor() {
    super("Pending upload already consumed");
    this.name = "PendingAlreadyConsumedError";
  }
}

/** Detect a PostgreSQL unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

/**
 * GET /materials — list materials owned by current user
 */
router.get("/materials", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  try {
    const mats = await db
      .select()
      .from(materialsTable)
      .where(eq(materialsTable.ownerId, userId));
    // Never expose extractedText itself; only status + safe readiness message.
    res.json(mats.map(toPublicMaterial));
  } catch (err) {
    req.log.error({ err }, "Errore lista materiali");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

/**
 * Normalize a content type for comparison: lowercase and strip parameters
 * (e.g. "Text/Plain; charset=UTF-8" → "text/plain").
 */
function normalizeContentType(value: string): string {
  return value.split(";")[0]!.trim().toLowerCase();
}

/**
 * POST /materials — finalize material metadata after successful upload.
 *
 * Security lifecycle:
 * 1. Require an unexpired pending_uploads row for objectPath owned by current user.
 * 2. Require request body size/contentType to match the pending row exactly.
 * 3. Verify the object now exists in storage.
 * 4. Verify actual stored byte size and (normalized) content type match the pending row.
 * 5. If groupId provided, verify it is owned by the current user.
 * 6. Set private ACL on the object.
 * 7. Atomically consume the pending row and insert the material in one transaction
 *    (unique objectPath prevents duplicate materials from concurrent finalize).
 */
router.post("/materials", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
    const { contentType, objectPath, description, size, groupId } =
    req.body as {
      contentType?: string;
      objectPath?: string;
      description?: string;
      size?: number;
      groupId?: string;
    };

    if (!contentType || !objectPath) {
    res
      .status(400)
        .json({ error: "contentType e objectPath sono obbligatori" });
    return;
  }

  try {
    const now = new Date();

    // 1. Find a pending upload row for this objectPath that belongs to the user
    const [pending] = await db
      .select()
      .from(pendingUploadsTable)
      .where(eq(pendingUploadsTable.objectPath, objectPath));

    if (!pending) {
      res.status(404).json({ error: "Upload in sospeso non trovato. Richiedi un nuovo URL di upload." });
      return;
    }
    if (pending.ownerId !== userId) {
      res.status(403).json({ error: "Non puoi rivendicare un file di un altro utente." });
      return;
    }
    if (pending.expiresAt < now) {
      // Clean up expired row
      await db
        .delete(pendingUploadsTable)
        .where(eq(pendingUploadsTable.objectPath, objectPath));
      res.status(400).json({ error: "L'URL di upload è scaduto. Richiedi un nuovo URL e ricarica il file." });
      return;
    }

    // 2. Request body must match the pending row that was recorded at request time.
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      res.status(400).json({ error: "size deve essere un numero positivo." });
      return;
    }
    if (size !== pending.size) {
      res.status(400).json({ error: "La dimensione dichiarata non corrisponde alla richiesta di upload." });
      return;
    }
    if (normalizeContentType(contentType) !== normalizeContentType(pending.contentType)) {
      res.status(400).json({ error: "Il tipo di contenuto dichiarato non corrisponde alla richiesta di upload." });
      return;
    }

    // 3. Verify the object now exists in storage
    let objectFile;
    try {
      objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(400).json({ error: "Il file non è ancora stato caricato nel percorso indicato." });
        return;
      }
      throw err;
    }

    // 4. Verify the ACTUAL stored object metadata matches what was expected.
    const [metadata] = await objectFile.getMetadata();
    const actualSize = Number(metadata.size ?? NaN);
    if (!Number.isFinite(actualSize) || actualSize !== pending.size) {
      res.status(400).json({
        error: "La dimensione del file caricato non corrisponde a quella prevista.",
      });
      return;
    }
    const actualContentType = normalizeContentType(
      (metadata.contentType as string | undefined) ?? "",
    );
    if (actualContentType !== normalizeContentType(pending.contentType)) {
      res.status(400).json({
        error: "Il tipo di contenuto del file caricato non corrisponde a quello previsto.",
      });
      return;
    }

    // 5. If groupId provided, verify it is owned by the current user
    if (groupId) {
      const [group] = await db
        .select()
        .from(studyGroupsTable)
        .where(eq(studyGroupsTable.id, groupId));
      if (!group) {
        res.status(400).json({ error: "Gruppo non trovato." });
        return;
      }
      if (group.ownerId !== userId) {
        res.status(403).json({ error: "Non puoi aggiungere materiali a un gruppo altrui." });
        return;
      }
    }

    // 6. Set private ACL on the uploaded object (object is confirmed to exist)
    await setObjectAclPolicy(objectFile, {
      owner: userId,
      visibility: "private",
    });

    // 6b. Download + extract study text (best effort). Any failure is captured
    //     as a failed/unsupported status — the imported material is NEVER lost.
    const extraction = await extractFromObject(
      objectFile,
      contentType,
      pending.name,
    );
    if (extraction.status === "failed") {
      req.log.warn(
        { objectPath, reason: extraction.error },
        "Estrazione testo materiale non riuscita",
      );
    }
    let generatedTitle = "Materiale di studio importato";
    try {
      generatedTitle = await generateMaterialTitle({
        extractedText: extraction.text,
        contentType,
      });
    } catch (error) {
      req.log.warn({ err: error }, "Titolo IA non disponibile: uso titolo sicuro di importazione");
      generatedTitle = contentType.startsWith("image/")
        ? "Immagine di studio importata"
        : contentType.startsWith("audio/")
          ? "Registrazione di studio importata"
          : contentType.startsWith("video/")
            ? "Video di studio importato"
            : "Materiale di studio importato";
    }

    // 7. Atomically consume the pending row and insert the material.
    //    Deleting the pending row inside the transaction with a RETURNING guard
    //    ensures a concurrent finalize cannot also proceed; the unique constraint
    //    on objectPath is the final backstop against duplicate materials.
    let material;
    try {
      material = await db.transaction(async (tx) => {
        const consumed = await tx
          .delete(pendingUploadsTable)
          .where(
            and(
              eq(pendingUploadsTable.objectPath, objectPath),
              eq(pendingUploadsTable.ownerId, userId),
              gt(pendingUploadsTable.expiresAt, sql`now()`),
            ),
          )
          .returning();

        if (consumed.length === 0) {
          // Another concurrent finalize already consumed this pending row.
          throw new PendingAlreadyConsumedError();
        }

        const [inserted] = await tx
          .insert(materialsTable)
          .values({
            id: randomUUID(),
            ownerId: userId,
            title: generatedTitle,
            description: description ?? null,
            contentType,
            objectPath,
            size,
            groupId: groupId ?? null,
            extractedText: extraction.text,
            extractionStatus: extraction.status,
            extractionError: extraction.error,
          })
          .returning();

        return inserted;
      });
    } catch (txErr) {
      if (txErr instanceof PendingAlreadyConsumedError) {
        const [remainingPending] = await db
          .select()
          .from(pendingUploadsTable)
          .where(
            and(
              eq(pendingUploadsTable.objectPath, objectPath),
              eq(pendingUploadsTable.ownerId, userId),
            ),
          );
        if (remainingPending && remainingPending.expiresAt <= new Date()) {
          await db
            .delete(pendingUploadsTable)
            .where(
              and(
                eq(pendingUploadsTable.objectPath, objectPath),
                eq(pendingUploadsTable.ownerId, userId),
                lte(pendingUploadsTable.expiresAt, sql`now()`),
              ),
            );
          res.status(400).json({
            error:
              "L'upload è scaduto durante la finalizzazione. Richiedi un nuovo URL e ricarica il file.",
          });
          return;
        }
        res.status(409).json({ error: "Questo upload è già stato finalizzato." });
        return;
      }
      // Unique violation on objectPath (concurrent duplicate) → 409
      if (isUniqueViolation(txErr)) {
        res.status(409).json({ error: "Questo file è già stato aggiunto ai materiali." });
        return;
      }
      throw txErr;
    }

    res.status(201).json(toPublicMaterial(material!));
  } catch (err) {
    req.log.error({ err }, "Errore creazione materiale");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

/**
 * DELETE /materials/:materialId — delete a material (owner only)
 * Also deletes the underlying private object from storage.
 */
router.delete(
  "/materials/:materialId",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const materialId = req.params.materialId as string;

    try {
      const [existing] = await db
        .select()
        .from(materialsTable)
        .where(eq(materialsTable.id, materialId));

      if (!existing) {
        res.status(404).json({ error: "Materiale non trovato" });
        return;
      }
      if (existing.ownerId !== userId) {
        res.status(403).json({ error: "Accesso negato" });
        return;
      }

      // Delete DB record first (ownership already verified)
      await db
        .delete(materialsTable)
        .where(
          and(
            eq(materialsTable.id, materialId),
            eq(materialsTable.ownerId, userId),
          ),
        );

      // Then attempt to delete the underlying storage object (best-effort)
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(existing.objectPath);
        await objectFile.delete();
      } catch (storageErr) {
        // Log but don't fail the request — DB record is already gone
        req.log.warn({ err: storageErr }, "Impossibile eliminare oggetto dallo storage");
      }

      res.status(204).end();
    } catch (err) {
      req.log.error({ err }, "Errore eliminazione materiale");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

export default router;
