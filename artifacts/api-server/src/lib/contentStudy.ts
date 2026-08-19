/**
 * contentStudy.ts — Pure, dependency-free content extraction + deterministic
 * study generation for EduAI Test Master.
 *
 * Scope constraints (hard requirements):
 *  - NO external packages / services.
 *  - NO OCR, NO audio/video transcription, NO paid AI.
 *  - Text is extracted only from genuinely textual/document formats we can decode
 *    with the Node standard library (Buffer + zlib). Images/audio/video and any
 *    other binary type are reported `unsupported` with a clear Italian message —
 *    never fabricated from the filename.
 *
 * The whole module is pure and synchronous where possible so it can be unit
 * tested with Node's built-in test runner without a database or network.
 */

import zlib from "node:zlib";

// ─── Limits ────────────────────────────────────────────────────────────────

/** Max bytes we will download / attempt to extract (10 MiB). */
export const MAX_EXTRACT_BYTES = 10 * 1024 * 1024;
/** Max expanded bytes accepted from a compressed DOCX/PDF stream (4 MiB). */
export const MAX_DECOMPRESSED_BYTES = 4 * 1024 * 1024;
/** Max normalized characters persisted to the database. */
export const MAX_TEXT_CHARS = 60_000;

// ─── Status types ────────────────────────────────────────────────────────────

export type ExtractionStatus = "ready" | "unsupported" | "failed" | "pending";

export type ExtractionResult = {
  status: ExtractionStatus;
  /** Normalized extracted text (only when status === "ready"). */
  text: string | null;
  /** Italian, human-readable reason for unsupported/failed. */
  error: string | null;
};

// ─── Content-type classification ──────────────────────────────────────────────

/** Lowercase + strip parameters ("text/plain; charset=utf-8" → "text/plain"). */
export function normalizeContentType(value: string): string {
  return (value.split(";")[0] ?? "").trim().toLowerCase();
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

const TEXTUAL_EXTENSIONS = new Set([
  "txt",
  "text",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "log",
  "rtf",
  "html",
  "htm",
  "xml",
  "yaml",
  "yml",
]);

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ContentClass = "text" | "docx" | "pdf" | "unsupported";

/**
 * Decide how to attempt extraction based on content type + filename.
 * Filename is only used to refine textual/document classification — never to
 * fabricate content.
 */
export function classifyContent(
  contentType: string,
  fileName: string,
): ContentClass {
  const ct = normalizeContentType(contentType);
  const ext = extensionOf(fileName);

  if (ct === "application/pdf" || ext === "pdf") return "pdf";
  if (ct === DOCX_MIME || ext === "docx") return "docx";

  if (
    ct.startsWith("text/") ||
    ct === "application/json" ||
    ct === "application/xml" ||
    ct === "application/csv" ||
    ct === "application/x-ndjson" ||
    ct === "application/rtf" ||
    TEXTUAL_EXTENSIONS.has(ext)
  ) {
    return "text";
  }

  return "unsupported";
}

// ─── Italian messages ─────────────────────────────────────────────────────────

const MSG = {
  unsupportedMedia:
    "Questo tipo di file richiede OCR o trascrizione, non disponibili: puoi conservarlo come archivio ma non è utilizzabile per generare verifiche o flashcard.",
  unsupportedGeneric:
    "Formato non supportato per l'estrazione del testo: il file può essere archiviato ma non usato per verifiche o flashcard.",
  emptyText:
    "Il file non contiene testo leggibile: nessun contenuto è stato estratto.",
  tooLarge:
    "Il file supera la dimensione massima consentita per l'estrazione del testo.",
  decodeFailed:
    "Impossibile decodificare il contenuto testuale del file.",
  docxFailed:
    "Impossibile estrarre il testo dal documento DOCX: il file potrebbe essere danneggiato o protetto.",
  pdfFailed:
    "Impossibile recuperare testo leggibile dal PDF: potrebbe essere scansionato (immagine) e richiedere OCR.",
  expandedTooLarge:
    "Il contenuto compresso supera il limite sicuro di estrazione.",
} as const;

// ─── Text normalization ─────────────────────────────────────────────────────

/**
 * Normalize decoded text: unify newlines, strip control chars, collapse
 * excessive whitespace, and cap to MAX_TEXT_CHARS.
 */
export function normalizeText(raw: string): string {
  let text = raw
    .replace(/\r\n?/g, "\n")
    // strip most control characters except newline/tab
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    // collapse runs of spaces/tabs
    .replace(/[ \t]{2,}/g, " ")
    // collapse 3+ newlines to a paragraph break
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS).trim();
  }
  return text;
}

/** True if the normalized text carries meaningful study content. */
export function isMeaningfulText(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 40) return false;
  // Require at least a few word-like tokens.
  const words = trimmed.split(/\s+/).filter((w) => /[\p{L}\p{N}]{2,}/u.test(w));
  return words.length >= 8;
}

// ─── UTF-8 textual decode ─────────────────────────────────────────────────────

function decodeUtf8(buf: Buffer): string {
  // Node's TextDecoder with fatal:false replaces invalid sequences with U+FFFD.
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(buf);
}

// ─── DOCX (ZIP) extraction ─────────────────────────────────────────────────────

/**
 * Minimal ZIP reader using the central directory to locate word/document.xml
 * and inflate it. Supports STORE (0) and DEFLATE (8) compression only.
 * Returns the raw document.xml bytes, or null if not found.
 */
function readZipEntry(buf: Buffer, wantName: string): Buffer | null {
  // Locate End Of Central Directory (EOCD) signature 0x06054b50, scanning back.
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  const minEocd = 22;
  for (let i = buf.length - minEocd; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const cdCount = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  const CEN_SIG = 0x02014b50;
  for (let n = 0; n < cdCount; n++) {
    if (cdOffset + 46 > buf.length) return null;
    if (buf.readUInt32LE(cdOffset) !== CEN_SIG) return null;

    const method = buf.readUInt16LE(cdOffset + 10);
    const compSize = buf.readUInt32LE(cdOffset + 20);
    const nameLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localOffset = buf.readUInt32LE(cdOffset + 42);
    const name = buf.toString(
      "utf8",
      cdOffset + 46,
      cdOffset + 46 + nameLen,
    );

    if (name === wantName) {
      // Parse the local file header to compute the data start.
      const LOC_SIG = 0x04034b50;
      if (buf.readUInt32LE(localOffset) !== LOC_SIG) return null;
      const locNameLen = buf.readUInt16LE(localOffset + 26);
      const locExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + locNameLen + locExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);

      if (method === 0) {
        return raw.length <= MAX_DECOMPRESSED_BYTES ? Buffer.from(raw) : null;
      }
      if (method === 8) {
        try {
          return zlib.inflateRawSync(raw, {
            maxOutputLength: MAX_DECOMPRESSED_BYTES,
          });
        } catch {
          return null;
        }
      }
      return null;
    }

    cdOffset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Strip XML tags from a document.xml, preserving paragraph/tab spacing. */
function docxXmlToText(xml: string): string {
  let text = xml
    // paragraph and line-break boundaries → newlines
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:tab\s*\/?>/g, "\t")
    // remove all remaining tags
    .replace(/<[^>]+>/g, "");
  // decode a handful of common XML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return text;
}

function extractDocx(buf: Buffer): ExtractionResult {
  const xmlBuf = readZipEntry(buf, "word/document.xml");
  if (!xmlBuf) {
    return { status: "failed", text: null, error: MSG.docxFailed };
  }
  const xml = decodeUtf8(xmlBuf);
  const normalized = normalizeText(docxXmlToText(xml));
  if (!isMeaningfulText(normalized)) {
    return { status: "failed", text: null, error: MSG.emptyText };
  }
  return { status: "ready", text: normalized, error: null };
}

// ─── PDF best-effort text extraction ────────────────────────────────────────────

/** Decode PDF string escape sequences inside a literal ( ... ) string. */
function decodePdfLiteral(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\") {
      const next = s[i + 1];
      if (next === undefined) break;
      switch (next) {
        case "n":
          out += "\n";
          i++;
          break;
        case "r":
          out += "\r";
          i++;
          break;
        case "t":
          out += "\t";
          i++;
          break;
        case "b":
        case "f":
          i++;
          break;
        case "(":
        case ")":
        case "\\":
          out += next;
          i++;
          break;
        default:
          if (next >= "0" && next <= "7") {
            // up to 3 octal digits
            let oct = next;
            let j = i + 2;
            while (j < s.length && oct.length < 3 && s[j]! >= "0" && s[j]! <= "7") {
              oct += s[j]!;
              j++;
            }
            out += String.fromCharCode(parseInt(oct, 8) & 0xff);
            i = j - 1;
          } else {
            out += next;
            i++;
          }
      }
    } else {
      out += ch;
    }
  }
  return out;
}

/** Extract text tokens from a decoded PDF content stream. */
function extractTextFromContentStream(content: string): string {
  const parts: string[] = [];

  // Literal strings: ( ... ) possibly with escaped parens.
  const literalRe = /\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)/g;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(content)) !== null) {
    const inner = m[0].slice(1, -1);
    const decoded = decodePdfLiteral(inner);
    if (decoded.trim().length > 0) parts.push(decoded);
  }

  // Hex strings: < ... > (pairs of hex digits).
  const hexRe = /<([0-9A-Fa-f\s]+)>/g;
  while ((m = hexRe.exec(content)) !== null) {
    const hex = m[1]!.replace(/\s+/g, "");
    if (hex.length < 2 || hex.length % 2 !== 0) continue;
    let s = "";
    for (let i = 0; i < hex.length; i += 2) {
      s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    if (s.trim().length > 0) parts.push(s);
  }

  return parts.join(" ");
}

function extractPdf(buf: Buffer): ExtractionResult {
  const collected: string[] = [];
  let remainingOutputBytes = MAX_DECOMPRESSED_BYTES;

  // Iterate over every `stream ... endstream` segment, inflating FlateDecode
  // ones and reading plain ones best-effort.
  const streamMarker = Buffer.from("stream");
  const endMarker = Buffer.from("endstream");

  let searchFrom = 0;
  while (searchFrom < buf.length && remainingOutputBytes > 0) {
    const sIdx = buf.indexOf(streamMarker, searchFrom);
    if (sIdx < 0) break;
    // Data begins after the 'stream' keyword and the following EOL.
    let dataStart = sIdx + streamMarker.length;
    if (buf[dataStart] === 0x0d) dataStart++; // CR
    if (buf[dataStart] === 0x0a) dataStart++; // LF
    const eIdx = buf.indexOf(endMarker, dataStart);
    if (eIdx < 0) break;
    const chunk = buf.subarray(dataStart, eIdx);
    searchFrom = eIdx + endMarker.length;

    // Peek the dictionary preceding this stream to detect FlateDecode.
    const dictStart = Math.max(0, sIdx - 400);
    const dict = buf.toString("latin1", dictStart, sIdx);
    const isFlate = /\/FlateDecode/.test(dict);

    let decodedBuffer: Buffer | null = null;
    if (isFlate) {
      try {
        decodedBuffer = zlib.inflateSync(chunk, {
          maxOutputLength: remainingOutputBytes,
        });
      } catch (inflateError) {
        if (
          inflateError instanceof RangeError ||
          (typeof inflateError === "object" &&
            inflateError !== null &&
            (inflateError as { code?: string }).code ===
              "ERR_BUFFER_TOO_LARGE")
        ) {
          return {
            status: "failed",
            text: null,
            error: MSG.expandedTooLarge,
          };
        }
        try {
          decodedBuffer = zlib.inflateRawSync(chunk, {
            maxOutputLength: remainingOutputBytes,
          });
        } catch (inflateRawError) {
          if (
            inflateRawError instanceof RangeError ||
            (typeof inflateRawError === "object" &&
              inflateRawError !== null &&
              (inflateRawError as { code?: string }).code ===
                "ERR_BUFFER_TOO_LARGE")
          ) {
            return {
              status: "failed",
              text: null,
              error: MSG.expandedTooLarge,
            };
          }
          decodedBuffer = null;
        }
      }
    } else {
      decodedBuffer =
        chunk.length <= remainingOutputBytes
          ? Buffer.from(chunk)
          : Buffer.from(chunk.subarray(0, remainingOutputBytes));
    }

    if (decodedBuffer) {
      remainingOutputBytes -= decodedBuffer.length;
      const decoded = decodedBuffer.toString("latin1");
      const text = extractTextFromContentStream(decoded);
      if (text.trim().length > 0) collected.push(text);
    }
  }

  // Also try literal/hex strings from the raw (uncompressed) document body.
  if (collected.length === 0) {
    const rawText = extractTextFromContentStream(
      buf.subarray(0, MAX_DECOMPRESSED_BYTES).toString("latin1"),
    );
    if (rawText.trim().length > 0) collected.push(rawText);
  }

  const normalized = normalizeText(collected.join("\n"));
  if (!isMeaningfulText(normalized)) {
    return { status: "failed", text: null, error: MSG.pdfFailed };
  }
  return { status: "ready", text: normalized, error: null };
}

// ─── Public extraction entrypoint ────────────────────────────────────────────

/**
 * Extract normalized study text from a downloaded object buffer.
 * Pure and synchronous — no I/O. Never throws; always returns a result.
 */
export function extractStudyText(
  buf: Buffer,
  contentType: string,
  fileName: string,
): ExtractionResult {
  if (buf.length > MAX_EXTRACT_BYTES) {
    return { status: "failed", text: null, error: MSG.tooLarge };
  }

  const cls = classifyContent(contentType, fileName);
  const ct = normalizeContentType(contentType);

  try {
    switch (cls) {
      case "text": {
        const decoded = decodeUtf8(buf);
        const normalized = normalizeText(decoded);
        if (!isMeaningfulText(normalized)) {
          return { status: "failed", text: null, error: MSG.emptyText };
        }
        return { status: "ready", text: normalized, error: null };
      }
      case "docx":
        return extractDocx(buf);
      case "pdf":
        return extractPdf(buf);
      case "unsupported":
      default: {
        const media =
          ct.startsWith("image/") ||
          ct.startsWith("audio/") ||
          ct.startsWith("video/");
        return {
          status: "unsupported",
          text: null,
          error: media ? MSG.unsupportedMedia : MSG.unsupportedGeneric,
        };
      }
    }
  } catch {
    return { status: "failed", text: null, error: MSG.decodeFailed };
  }
}

// ─── Public readiness message for list responses ────────────────────────────────

/**
 * A safe, non-content Italian readiness indicator to expose in list responses.
 * Never leaks the extracted text itself.
 */
export function readinessMessage(
  status: ExtractionStatus,
  error: string | null,
): string {
  switch (status) {
    case "ready":
      return "Pronto per lo studio: puoi generare verifiche e flashcard.";
    case "unsupported":
      return (
        error ??
        "Solo archiviazione: questo file richiede OCR o trascrizione, non disponibili."
      );
    case "failed":
      return error ?? "Estrazione del testo non riuscita.";
    case "pending":
    default:
      return "Estrazione del contenuto in corso…";
  }
}

// ─── Deterministic study generation (shared quiz + flashcards) ────────────────

export type SourceMaterial = {
  id: string;
  title: string;
  /** Normalized extracted text (must be meaningful for ready materials). */
  text: string;
};

export type GeneratedQuestion = {
  question: string;
  options: string[]; // exactly 4
  correctIndex: number;
};

export type PublicQuestion = {
  question: string;
  options: string[];
};

export type Flashcard = {
  front: string;
  back: string;
  materialTitle: string;
};

// Deterministic PRNG (LCG) — identical to the client seed algorithm.
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function strHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function deterministicShuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

/** Split extracted text into clean, study-worthy sentences. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => {
      const words = s.split(/\s+/).filter(Boolean);
      return words.length >= 6 && words.length <= 60 && s.length >= 30;
    });
}

const STOPWORDS = new Set([
  "il","lo","la","i","gli","le","un","uno","una","di","del","della","dello","dei",
  "degli","delle","a","al","allo","alla","ai","agli","alle","da","dal","in","nel",
  "nella","con","su","sul","per","tra","fra","e","ed","o","oppure","ma","che","chi",
  "cui","non","si","sono","è","era","come","più","meno","anche","questo","questa",
  "quello","quella","dei","the","of","and","to","in","a","is","are","was","for",
  "on","with","as","by","an","be","this","that","it","or","from","at",
]);

/** Extract salient key terms (longer, non-stopword tokens) from a sentence. */
export function keyTermsOf(sentence: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of sentence.split(/[^\p{L}\p{N}]+/u)) {
    const word = raw.trim();
    if (word.length < 4) continue;
    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    terms.push(word);
  }
  return terms;
}

/**
 * Build a fill-in-the-blank MCQ from a sentence by blanking a salient key term.
 * Distractors are drawn from the pool of other terms across all materials.
 * Returns null if the sentence yields no usable key term.
 */
function buildQuestionFromSentence(
  sentence: string,
  materialTitle: string,
  termPool: string[],
  rng: () => number,
): GeneratedQuestion | null {
  const terms = keyTermsOf(sentence);
  if (terms.length === 0) return null;

  // Pick the longest term as the answer (most salient / specific).
  const answer = [...terms].sort((a, b) => b.length - a.length)[0]!;

  // Build the blanked prompt (case-insensitive, first occurrence).
  const re = new RegExp(
    answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  );
  const blanked = sentence.replace(re, "______");
  if (!blanked.includes("______")) return null;

  // Gather distractors from the pool that differ from the answer.
  const answerLower = answer.toLowerCase();
  const candidates = termPool.filter(
    (t) => t.toLowerCase() !== answerLower && t.length >= 4,
  );
  const uniqueCandidates: string[] = [];
  const seen = new Set<string>([answerLower]);
  for (const t of deterministicShuffle(candidates, rng)) {
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    uniqueCandidates.push(t);
    if (uniqueCandidates.length >= 3) break;
  }

  // Pad with deterministic generic distractors if the pool is too small.
  const fallback = [
    "Nessuna delle precedenti",
    "Un concetto non correlato",
    "Un termine assente nel testo",
  ];
  let fi = 0;
  while (uniqueCandidates.length < 3 && fi < fallback.length) {
    const f = fallback[fi++]!;
    if (!seen.has(f.toLowerCase())) {
      uniqueCandidates.push(f);
      seen.add(f.toLowerCase());
    }
  }
  if (uniqueCandidates.length < 3) return null;

  const options = deterministicShuffle([answer, ...uniqueCandidates.slice(0, 3)], rng);
  const correctIndex = options.indexOf(answer);
  if (correctIndex < 0) return null;

  return {
    question: `In "${materialTitle}", completa: ${blanked}`,
    options,
    correctIndex,
  };
}

/**
 * Generate `count` deterministic, content-grounded MCQs with answer keys,
 * rotating across every provided source material. Distinct source contents
 * yield distinct questions (they are grounded in the actual sentences).
 */
export function generateQuestionsWithKey(
  sources: SourceMaterial[],
  count: number,
  seedInput: string,
): GeneratedQuestion[] {
  const seed = strHash(seedInput);
  const rng = seededRandom(seed);

  // Precompute per-material sentences (deterministically ordered) and a global
  // term pool for distractors.
  const perMaterial = sources.map((m) => ({
    title: m.title,
    sentences: splitSentences(m.text),
  }));
  const termPool: string[] = [];
  for (const m of sources) {
    for (const s of splitSentences(m.text)) {
      for (const t of keyTermsOf(s)) termPool.push(t);
    }
  }

  const questions: GeneratedQuestion[] = [];
  const usedPrompts = new Set<string>();
  const cursors = perMaterial.map(() => 0);

  // Rotate across materials until we hit `count` or exhaust all sentences.
  let progressed = true;
  while (questions.length < count && progressed) {
    progressed = false;
    for (let mi = 0; mi < perMaterial.length && questions.length < count; mi++) {
      const mat = perMaterial[mi]!;
      while (cursors[mi]! < mat.sentences.length) {
        const sentence = mat.sentences[cursors[mi]!]!;
        cursors[mi]!++;
        progressed = true;
        const q = buildQuestionFromSentence(sentence, mat.title, termPool, rng);
        if (q && !usedPrompts.has(q.question)) {
          usedPrompts.add(q.question);
          questions.push(q);
          break; // move to next material (rotation)
        }
      }
    }
  }

  return questions;
}

/** Strip answer keys for the public/client-facing payload. */
export function toPublicQuestions(
  questions: GeneratedQuestion[],
): PublicQuestion[] {
  return questions.map(({ question, options }) => ({ question, options }));
}

/**
 * Generate content-grounded flashcards. Generated SEPARATELY from quiz answer
 * keys: fronts ask about a key term, backs quote the grounding sentence.
 */
export function generateFlashcards(
  sources: SourceMaterial[],
  perMaterial: number,
  seedInput: string,
): Flashcard[] {
  const seed = strHash(seedInput + "|flashcards");
  const rng = seededRandom(seed);
  const cards: Flashcard[] = [];

  for (const m of sources) {
    const sentences = deterministicShuffle(splitSentences(m.text), rng);
    let made = 0;
    const seenTerms = new Set<string>();
    for (const sentence of sentences) {
      if (made >= perMaterial) break;
      const terms = keyTermsOf(sentence);
      if (terms.length === 0) continue;
      const term = [...terms].sort((a, b) => b.length - a.length)[0]!;
      const lower = term.toLowerCase();
      if (seenTerms.has(lower)) continue;
      seenTerms.add(lower);
      cards.push({
        front: `Che cosa si intende con "${term}" in "${m.title}"?`,
        back: sentence,
        materialTitle: m.title,
      });
      made++;
    }
    // If a material has no usable sentence at all, add one grounded summary card
    // using its first meaningful line rather than a filename-only fallback.
    if (made === 0) {
      const firstLine = m.text.split("\n").map((l) => l.trim()).find((l) => l.length >= 30);
      if (firstLine) {
        cards.push({
          front: `Ripassa il concetto chiave di "${m.title}"`,
          back: firstLine,
          materialTitle: m.title,
        });
      }
    }
  }

  return cards;
}
