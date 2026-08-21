/**
 * Deterministic document/media fixture checks.
 *
 * These tests intentionally use local fixture files and replace fetch before
 * entering the transcription pipeline. They therefore exercise parsing,
 * chunk preparation and provider fallback without storage or real credentials.
 *
 * Run with:
 *   pnpm exec tsx --test artifacts/api-server/src/lib/e2e-fixtures.test.ts
 */

import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractStudyText } from "./contentStudy.ts";
import { transcribeMediaObject } from "./mediaTranscription.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../../../../e2e/fixtures");
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const originalFetch = globalThis.fetch;
const originalGroqKey = process.env.GROQ_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;

function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqKey;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
}

function fixtureObject(filePath: string) {
  return {
    createReadStream: () => createReadStream(filePath),
  } as never;
}

test("PDF fixture reaches ready and preserves extracted study text", async () => {
  const result = extractStudyText(
    await readFile(join(fixtures, "study-fixture.pdf")),
    "application/pdf",
    "study-fixture.pdf",
  );

  assert.equal(result.status, "ready");
  assert.equal(result.error, null);
  assert.match(result.text ?? "", /fotosintesi/i);
  assert.match(result.text ?? "", /clorofilla/i);
});

test("DOCX fixture reaches ready and preserves extracted study text", async () => {
  const result = extractStudyText(
    await readFile(join(fixtures, "study-fixture.docx")),
    DOCX_MIME,
    "study-fixture.docx",
  );

  assert.equal(result.status, "ready");
  assert.equal(result.error, null);
  assert.match(result.text ?? "", /teorema di Pitagora/i);
  assert.match(result.text ?? "", /triangoli rettangoli/i);
});

test("audio fixture prepares a chunk and rotates from Groq to Gemini", async () => {
  process.env.GROQ_API_KEY = "fixture-groq-key";
  process.env.GEMINI_API_KEY = "fixture-gemini-key";
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("api.groq.com")) {
      return new Response("fixture provider unavailable", { status: 503 });
    }
    return new Response(
      JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: "La memoria migliora quando lo studente collega i concetti e li ripassa.",
            }],
          },
        }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const audioPath = join(fixtures, "transcription-fixture.wav");
    const result = await transcribeMediaObject({
      objectFile: fixtureObject(audioPath),
      contentType: "audio/wav",
      size: (await readFile(audioPath)).byteLength,
    });

    assert.deepEqual(result, {
      status: "ready",
      text: "La memoria migliora quando lo studente collega i concetti e li ripassa.",
      error: null,
    });
    assert.equal(calls.length, 2, "one prepared chunk should try both providers");
    assert.match(calls[0]!, /api\.groq\.com/);
    assert.match(calls[1]!, /generativelanguage\.googleapis\.com/);
  } finally {
    restoreEnvironment();
  }
});

test("audio fixture returns an explicit failure when every provider fails", async () => {
  process.env.GROQ_API_KEY = "fixture-groq-key";
  process.env.GEMINI_API_KEY = "fixture-gemini-key";
  globalThis.fetch = (async () =>
    new Response("fixture provider unavailable", { status: 503 })) as typeof fetch;

  try {
    const audioPath = join(fixtures, "transcription-fixture.wav");
    const result = await transcribeMediaObject({
      objectFile: fixtureObject(audioPath),
      contentType: "audio/wav",
      size: (await readFile(audioPath)).byteLength,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.text, null);
    assert.match(result.error ?? "", /trascrizione non è riuscita/i);
  } finally {
    restoreEnvironment();
  }
});