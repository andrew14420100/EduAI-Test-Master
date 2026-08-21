import assert from "node:assert/strict";
import { test } from "node:test";
import { aiTranscribe } from "./aiProvider.ts";

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

test("transcription rotates from Groq to Gemini after a provider failure", async () => {
  process.env.GROQ_API_KEY = "test-groq";
  process.env.GEMINI_API_KEY = "test-gemini";
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("api.groq.com")) {
      return new Response("rate limited", { status: 429 });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Trascrizione autentica della lezione." }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await aiTranscribe(Buffer.from("audio"));
    assert.deepEqual(result, {
      text: "Trascrizione autentica della lezione.",
      provider: "gemini",
    });
    assert.equal(calls.length, 2);
    assert.match(calls[0]!, /api\.groq\.com/);
    assert.match(calls[1]!, /generativelanguage\.googleapis\.com/);
  } finally {
    restoreEnvironment();
  }
});

test("transcription reports an explicit error when no provider is usable", async () => {
  process.env.GROQ_API_KEY = "test-groq";
  process.env.GEMINI_API_KEY = "test-gemini";
  globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;

  try {
    await assert.rejects(
      () => aiTranscribe(Buffer.from("audio")),
      (error: unknown) =>
        error instanceof Error && error.message === "AI_NO_FREE_TRANSCRIPTION_PROVIDER",
    );
  } finally {
    restoreEnvironment();
  }
});