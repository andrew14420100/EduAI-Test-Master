/**
 * Regression tests for the pure content-grounded study generator.
 *
 * Run with Node's built-in test runner + native TypeScript type stripping:
 *   node --test src/lib/contentStudy.test.ts
 * No test dependency is added.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { File } from "@google-cloud/storage";

import {
  extractStudyText,
  generateQuestionsWithKey,
  generateFlashcards,
  toPublicQuestions,
  isMeaningfulText,
  MAX_DECOMPRESSED_BYTES,
  type SourceMaterial,
} from "./contentStudy.ts";
import { ocrMediaObject, type OcrRecognizer } from "./mediaTranscription.ts";

const execFile = promisify(nodeExecFile);
const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function objectFileFrom(buffer: Buffer): File {
  return {
    createReadStream: () => Readable.from([buffer]),
  } as unknown as File;
}

// Two clearly different textual contents.
const CONTENT_A = `La fotosintesi clorofilliana è il processo con cui le piante convertono
l'anidride carbonica e l'acqua in glucosio usando la luce solare. La clorofilla
assorbe la luce nelle foglie. Il glucosio prodotto alimenta la crescita della pianta.
L'ossigeno viene rilasciato come sottoprodotto nell'atmosfera terrestre.`;

const CONTENT_B = `Il teorema di Pitagora afferma che in un triangolo rettangolo il quadrato
costruito sull'ipotenusa è uguale alla somma dei quadrati costruiti sui cateti.
Questo teorema fondamentale della geometria euclidea permette di calcolare le distanze.
La dimostrazione classica utilizza aree di quadrati e triangoli congruenti.`;

const sourceA: SourceMaterial = { id: "a", title: "Biologia", text: CONTENT_A };
const sourceB: SourceMaterial = { id: "b", title: "Matematica", text: CONTENT_B };

test("distinct contents produce distinct question prompts/options", () => {
  const qa = generateQuestionsWithKey([sourceA], 3, "seedA");
  const qb = generateQuestionsWithKey([sourceB], 3, "seedB");

  assert.ok(qa.length > 0, "content A should yield questions");
  assert.ok(qb.length > 0, "content B should yield questions");

  const promptsA = new Set(qa.map((q) => q.question));
  const promptsB = qb.map((q) => q.question);
  // No prompt from B should collide with any prompt from A.
  for (const p of promptsB) {
    assert.ok(!promptsA.has(p), `prompt collision across distinct contents: ${p}`);
  }

  // Options differ too (grounded in different key terms).
  const optionsA = qa.flatMap((q) => q.options).join("|");
  const optionsB = qb.flatMap((q) => q.options).join("|");
  assert.notEqual(optionsA, optionsB, "options should differ across contents");
});

test("public questions strip correctIndex", () => {
  const questions = generateQuestionsWithKey([sourceA], 3, "seedA");
  assert.ok(questions.length > 0);
  // Internal questions carry a numeric answer key.
  for (const q of questions) {
    assert.equal(typeof q.correctIndex, "number");
    assert.ok([2, 4].includes(q.options.length));
  }
  const publicQuestions = toPublicQuestions(questions);
  for (const q of publicQuestions) {
    assert.ok(!("correctIndex" in q), "public question must not expose correctIndex");
    assert.ok(Array.isArray(q.options));
  }
});

test("each generated question is deterministic and internally consistent", () => {
  const first = generateQuestionsWithKey([sourceA, sourceB], 4, "same-seed");
  const second = generateQuestionsWithKey([sourceA, sourceB], 4, "same-seed");
  assert.deepEqual(first, second, "generation must be deterministic for a fixed seed");
  for (const q of first) {
    assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length);
  }
});

test("flashcards are content-grounded and separate from answer keys", () => {
  const cards = generateFlashcards([sourceA, sourceB], 2, "seedFC");
  assert.ok(cards.length > 0, "should generate flashcards");
  for (const card of cards) {
    assert.ok(card.front.length > 0);
    assert.ok(card.back.length > 0);
    assert.ok(["Biologia", "Matematica"].includes(card.materialTitle));
    // Backs are grounded in the source sentences (not filename-only).
    assert.ok(!("correctIndex" in card));
  }
});

test("readiness failure: non-meaningful text and unsupported media", () => {
  // Empty / trivial text is not meaningful.
  assert.equal(isMeaningfulText(""), false);
  assert.equal(isMeaningfulText("ciao"), false);
  assert.equal(isMeaningfulText(CONTENT_A), true);

  // Images/audio/video return unsupported (no fabricated content).
  const imageResult = extractStudyText(
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    "image/png",
    "foto.png",
  );
  assert.equal(imageResult.status, "unsupported");
  assert.equal(imageResult.text, null);
  assert.ok(imageResult.error && imageResult.error.length > 0);

  const audioResult = extractStudyText(Buffer.from("id3"), "audio/mpeg", "lezione.mp3");
  assert.equal(audioResult.status, "unsupported");
  assert.equal(audioResult.text, null);

  // A textual file with meaningful content is ready.
  const textResult = extractStudyText(Buffer.from(CONTENT_A, "utf-8"), "text/plain", "note.txt");
  assert.equal(textResult.status, "ready");
  assert.ok(textResult.text && textResult.text.length > 0);

  // A textual file with too little content fails clearly.
  const tinyResult = extractStudyText(Buffer.from("ok", "utf-8"), "text/plain", "tiny.txt");
  assert.equal(tinyResult.status, "failed");
  assert.equal(tinyResult.text, null);
});

test("compressed PDF output is bounded against decompression bombs", () => {
  const expanded = Buffer.alloc(MAX_DECOMPRESSED_BYTES + 1024, 0x41);
  const compressed = zlib.deflateSync(expanded);
  const pdf = Buffer.concat([
    Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n"),
    compressed,
    Buffer.from("\nendstream\nendobj\n%%EOF"),
  ]);

  const result = extractStudyText(pdf, "application/pdf", "bomb.pdf");
  assert.equal(result.status, "failed");
  assert.equal(result.text, null);
  assert.match(result.error ?? "", /limite sicuro/i);
});

test("a readable sample image becomes ready OCR content", async () => {
  const directory = await mkdtemp(`${tmpdir()}/eduai-ocr-test-`);
  const imagePath = `${directory}/sample.png`;
  await writeFile(imagePath, SAMPLE_PNG);
  const recognize: OcrRecognizer = async (image) => {
    assert.ok(image.length > 0, "OCR must receive the image bytes");
    return { text: "La fotosintesi usa la luce per produrre glucosio." };
  };

  try {
    const result = await ocrMediaObject({
      objectFile: objectFileFrom(SAMPLE_PNG),
      contentType: "image/png",
      size: SAMPLE_PNG.length,
      fileName: "appunto.png",
      recognize,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.text, "La fotosintesi usa la luce per produrre glucosio.");
    assert.ok(result.text && isMeaningfulText(result.text));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an unreadable image stays failed and cannot become study content", async () => {
  const recognize: OcrRecognizer = async () => ({ text: "" });
  const result = await ocrMediaObject({
    objectFile: objectFileFrom(SAMPLE_PNG),
    contentType: "image/png",
    size: SAMPLE_PNG.length,
    fileName: "sfocata.png",
    recognize,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.text, null);
  assert.match(result.error ?? "", /testo leggibile/i);
  assert.equal(isMeaningfulText(result.text ?? ""), false);
  assert.equal(generateQuestionsWithKey([], 3, "unreadable").length, 0);
  assert.equal(generateFlashcards([], 3, "unreadable").length, 0);
});

test("a PDF rendered without a text layer uses the OCR fallback", async () => {
  const directory = await mkdtemp(`${tmpdir()}/eduai-pdf-ocr-test-`);
  const imagePath = `${directory}/scan.png`;
  const pdfPath = `${directory}/scan.pdf`;
  await writeFile(imagePath, SAMPLE_PNG);
  await execFile("magick", [imagePath, "-compress", "Zip", pdfPath]);
  const pdf = await import("node:fs/promises").then(({ readFile }) => readFile(pdfPath));
  let pagesSeen = 0;
  const recognize: OcrRecognizer = async (image) => {
    pagesSeen++;
    assert.ok(image.length > 0);
    return { text: "Il teorema di Pitagora collega ipotenusa e cateti." };
  };

  try {
    const result = await ocrMediaObject({
      objectFile: objectFileFrom(pdf),
      contentType: "application/pdf",
      size: pdf.length,
      fileName: "scansione.pdf",
      recognize,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.text, "Il teorema di Pitagora collega ipotenusa e cateti.");
    assert.ok(pagesSeen >= 1, "the PDF must be rendered and sent to OCR");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
