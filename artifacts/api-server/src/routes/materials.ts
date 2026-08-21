import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, and, gt, inArray, lte, sql } from "drizzle-orm";
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
import { ocrMediaObject, transcribeMediaObject } from "../lib/mediaTranscription";
import { MAX_MEDIA_UPLOAD_BYTES } from "../lib/mediaLimits";
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

function importedFileTitle(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return (withoutExtension || "File importato").slice(0, 100);
}

async function analyzeStoredMaterial(params: {
  materialId: string;
  ownerId: string;
  objectPath: string;
  contentType: string;
  fileName: string;
  size: number | null;
  log: Pick<Request["log"], "warn" | "error">;
}) {
  const { materialId, objectPath, contentType, fileName, size, log } = params;
  try {
    await db
      .update(materialsTable)
      .set({ extractionStatus: "processing", extractionError: null })
      .where(eq(materialsTable.id, materialId));

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    let extraction: ExtractionResult;
    if (contentType.startsWith("audio/") || contentType.startsWith("video/")) {
      extraction = await transcribeMediaObject({ objectFile, contentType, size });
    } else {
      const textExtraction = await extractFromObject(objectFile, contentType, fileName);
      const lowerType = contentType.split(";")[0]?.toLowerCase() ?? "";
      const isImage = lowerType.startsWith("image/")
        || /\.(jpe?g|png|heic|webp|gif|bmp|tiff?)$/i.test(fileName);
      const isPdf = lowerType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
      // A PDF may contain no text layer at all. In that case, retry the same
      // source through OCR instead of making it archive-only.
      extraction = (isImage || (isPdf && textExtraction.status !== "ready"))
        ? await ocrMediaObject({ objectFile, contentType, size, fileName })
        : textExtraction;
    }

    let title: string | undefined;
    if (extraction.status === "ready" && extraction.text) {
      try {
        title = await generateMaterialTitle({ extractedText: extraction.text }) ?? undefined;
      } catch (error) {
        log.warn({ err: error, materialId }, "Titolo IA non disponibile: mantengo il nome del file");
      }
    }

    await db
      .update(materialsTable)
      .set({
        ...(title ? { title } : {}),
        extractedText: extraction.text,
        extractionStatus: extraction.status,
        extractionError: extraction.error,
      })
      .where(eq(materialsTable.id, materialId));
  } catch (error) {
    log.error({ err: error, materialId }, "Analisi del materiale non riuscita");
    await db
      .update(materialsTable)
      .set({
        extractedText: null,
        extractionStatus: "failed",
        extractionError: "L'analisi del contenuto si è interrotta. Puoi riprovare.",
      })
      .where(eq(materialsTable.id, materialId))
      .catch((updateError) =>
        log.error({ err: updateError, materialId }, "Impossibile salvare l'errore di analisi"),
      );
  }
}

type AnalysisQueueItem = Parameters<typeof analyzeStoredMaterial>[0];
type QueueResult = "queued" | "duplicate" | "full";

const MAX_ANALYSIS_CONCURRENCY = 2;
const MAX_ANALYSIS_QUEUE = 20;
const MAX_ANALYSIS_WORK_PER_USER = 5;
const analysisQueue: AnalysisQueueItem[] = [];
const queuedAnalysisIds = new Set<string>();
const activeAnalysisIds = new Set<string>();
const recoveryLog = {
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
} as unknown as Pick<Request["log"], "warn" | "error">;

function analysisWorkForOwner(ownerId: string) {
  return analysisQueue.filter((item) => item.ownerId === ownerId).length
    + [...activeAnalysisIds].filter((id) => id.startsWith(`${ownerId}:`)).length;
}

async function pumpAnalysisQueue() {
  while (activeAnalysisIds.size < MAX_ANALYSIS_CONCURRENCY && analysisQueue.length > 0) {
    const item = analysisQueue.shift()!;
    queuedAnalysisIds.delete(item.materialId);
    const activeKey = `${item.ownerId}:${item.materialId}`;
    activeAnalysisIds.add(activeKey);
    void analyzeStoredMaterial(item).finally(() => {
      activeAnalysisIds.delete(activeKey);
      void pumpAnalysisQueue();
    });
  }
}

function queueMaterialAnalysis(params: AnalysisQueueItem): QueueResult {
  if (queuedAnalysisIds.has(params.materialId) || [...activeAnalysisIds].some((id) => id.endsWith(`:${params.materialId}`))) {
    return "duplicate";
  }
  if (
    analysisQueue.length >= MAX_ANALYSIS_QUEUE
    || analysisWorkForOwner(params.ownerId) >= MAX_ANALYSIS_WORK_PER_USER
  ) {
    return "full";
  }
  queuedAnalysisIds.add(params.materialId);
  analysisQueue.push(params);
  void pumpAnalysisQueue();
  return "queued";
}

async function markAnalysisQueueFull(
  materialId: string,
  log: Pick<Request["log"], "warn" | "error">,
) {
  await db
    .update(materialsTable)
    .set({
      extractionStatus: "failed",
      extractionError: "La coda di analisi è momentaneamente piena. Puoi riprovare tra poco.",
    })
    .where(eq(materialsTable.id, materialId))
    .catch((error) => log.error({ err: error, materialId }, "Impossibile salvare coda piena"));
}

async function recoverPendingAnalyses() {
  try {
    const pending = await db
      .select()
      .from(materialsTable)
      .where(inArray(materialsTable.extractionStatus, ["pending", "processing"]));
    for (const material of pending) {
      const result = queueMaterialAnalysis({
        materialId: material.id,
        ownerId: material.ownerId,
        objectPath: material.objectPath,
        contentType: material.contentType,
        fileName: material.title,
        size: material.size,
        log: recoveryLog,
      });
      if (result === "full") {
        await db
          .update(materialsTable)
          .set({
            extractionStatus: "failed",
            extractionError: "L'analisi è stata interrotta dal riavvio. Puoi riprovare.",
          })
          .where(eq(materialsTable.id, material.id));
      }
    }
  } catch (error) {
    console.error("Impossibile recuperare le analisi in sospeso", error);
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
    | "pending"
    | "processing";
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
            title: importedFileTitle(pending.name),
            description: description ?? null,
            contentType,
            objectPath,
            size,
            groupId: groupId ?? null,
            extractedText: null,
            extractionStatus: "pending",
            extractionError: null,
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

    const initialQueueResult = queueMaterialAnalysis({
      materialId: material!.id,
      ownerId: userId,
      objectPath,
      contentType,
      fileName: pending.name,
      size: material!.size,
      log: req.log,
    });
    if (initialQueueResult === "full") {
      await markAnalysisQueueFull(material!.id, req.log);
    }
    res.status(201).json(toPublicMaterial(material!));
  } catch (err) {
    req.log.error({ err }, "Errore creazione materiale");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

router.post(
  "/materials/:materialId/retry-analysis",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const materialId = req.params.materialId as string;
    try {
      const [material] = await db
        .select()
        .from(materialsTable)
        .where(and(eq(materialsTable.id, materialId), eq(materialsTable.ownerId, userId)));
      if (!material) {
        res.status(404).json({ error: "Materiale non trovato." });
        return;
      }
      const active = [...activeAnalysisIds].some((id) => id.endsWith(`:${materialId}`));
      const queued = queuedAnalysisIds.has(materialId);
      if (active || queued) {
        res.status(409).json({ error: "L'analisi del materiale è già in corso." });
        return;
      }
      if (material.contentType.startsWith("image/")) {
        res.status(400).json({
          error: "Le immagini richiedono OCR, che non è disponibile: il materiale resta archiviato in sicurezza.",
        });
        return;
      }
      if (
        (material.contentType.startsWith("audio/") || material.contentType.startsWith("video/")) &&
        material.size !== null &&
        material.size > MAX_MEDIA_UPLOAD_BYTES
      ) {
        res.status(400).json({ error: "Il file supera il limite previsto per riprovare l'analisi." });
        return;
      }

      const [updated] = await db
        .update(materialsTable)
        .set({ extractionStatus: "pending", extractionError: null })
        .where(and(eq(materialsTable.id, materialId), eq(materialsTable.ownerId, userId)))
        .returning();
      const queueResult = queueMaterialAnalysis({
        materialId: updated!.id,
        ownerId: userId,
        objectPath: updated!.objectPath,
        contentType: updated!.contentType,
        fileName: updated!.title,
        size: updated!.size,
        log: req.log,
      });
      if (queueResult === "full") {
        await markAnalysisQueueFull(updated!.id, req.log);
        res.status(429).json({ error: "La coda di analisi è piena. Riprova tra poco." });
        return;
      }
      res.json(toPublicMaterial(updated!));
    } catch (err) {
      req.log.error({ err, materialId }, "Impossibile riavviare l'analisi del materiale");
      res.status(500).json({ error: "Impossibile riavviare l'analisi. Riprova più tardi." });
    }
  },
);

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

void recoverPendingAnalyses();
