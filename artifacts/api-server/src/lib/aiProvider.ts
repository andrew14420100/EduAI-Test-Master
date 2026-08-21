type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AiChatOptions = {
  messages: ChatMessage[];
  max_completion_tokens?: number;
  response_format?: { type: "json_object" };
};

type OpenAiCompatibleResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

function configured(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function timeoutSignal() {
  return AbortSignal.timeout(45_000);
}

async function groqChat(options: AiChatOptions, apiKey: string): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    signal: timeoutSignal(),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: configured("GROQ_MODEL") ?? DEFAULT_GROQ_MODEL,
      messages: options.messages,
      max_tokens: options.max_completion_tokens ?? 4096,
      ...(options.response_format ? { response_format: options.response_format } : {}),
    }),
  });
  if (!response.ok) throw new Error(`GROQ_${response.status}`);
  const body = await response.json() as OpenAiCompatibleResponse;
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("GROQ_EMPTY_RESPONSE");
  return content;
}

async function geminiChat(options: AiChatOptions, apiKey: string): Promise<string> {
  const system = options.messages.find((message) => message.role === "system")?.content;
  const contents = options.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  const response = await fetch(
    `${GEMINI_URL}/${configured("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      signal: timeoutSignal(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: options.max_completion_tokens ?? 4096,
          ...(options.response_format ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`GEMINI_${response.status}`);
  const body = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!content) throw new Error("GEMINI_EMPTY_RESPONSE");
  return content;
}

/**
 * Uses only user-configured free-tier providers. Replit's AI integration is
 * deliberately not part of this chain. Callers must provide a local fallback.
 */
export async function aiChat(options: AiChatOptions): Promise<{ content: string; provider: "groq" | "gemini" }> {
  const providers: Array<() => Promise<{ content: string; provider: "groq" | "gemini" }>> = [];
  const groqKey = configured("GROQ_API_KEY");
  const geminiKey = configured("GEMINI_API_KEY");
  if (groqKey) providers.push(async () => ({ content: await groqChat(options, groqKey), provider: "groq" }));
  if (geminiKey) providers.push(async () => ({ content: await geminiChat(options, geminiKey), provider: "gemini" }));

  let lastError: unknown = new Error("AI_NO_FREE_PROVIDER_CONFIGURED");
  for (const provider of providers) {
    try {
      return await provider();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function aiTranscribe(
  audio: Buffer,
  filename = "audio.m4a",
): Promise<{ text: string; provider: "groq" | "gemini" }> {
  const groqKey = configured("GROQ_API_KEY");
  if (groqKey) {
    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)]), filename);
      form.append("model", configured("GROQ_TRANSCRIPTION_MODEL") ?? "whisper-large-v3-turbo");
      form.append("language", "it");
      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        signal: AbortSignal.timeout(10 * 60_000),
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
      });
      if (!response.ok) throw new Error(`GROQ_TRANSCRIPTION_${response.status}`);
      const body = await response.json() as { text?: string };
      if (body.text?.trim()) return { text: body.text.trim(), provider: "groq" };
    } catch {
      // Continue to Gemini when Groq is rate-limited or unavailable.
    }
  }

  const geminiKey = configured("GEMINI_API_KEY");
  if (geminiKey) {
    try {
      const response = await fetch(
        `${GEMINI_URL}/${configured("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          signal: AbortSignal.timeout(10 * 60_000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: "Trascrivi integralmente questo audio in italiano. Restituisci solo il testo trascritto." },
                { inlineData: { mimeType: "audio/m4a", data: audio.toString("base64") } },
              ],
            }],
          }),
        },
      );
      if (!response.ok) throw new Error(`GEMINI_TRANSCRIPTION_${response.status}`);
      const body = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
      if (text) return { text, provider: "gemini" };
    } catch {
      // Both free transcription providers may be unavailable; expose one
      // stable error to the material-analysis route instead of a provider-
      // specific HTTP or network error.
    }
  }
  throw new Error("AI_NO_FREE_TRANSCRIPTION_PROVIDER");
}

/** Read visible text from an image without filling in illegible content. */
export async function aiOcr(
  image: Buffer,
  mimeType: string,
): Promise<{ text: string; provider: "gemini" }> {
  const geminiKey = configured("GEMINI_API_KEY");
  if (!geminiKey) throw new Error("AI_NO_VISION_PROVIDER");
  const response = await fetch(
    `${GEMINI_URL}/${configured("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            {
              text: "Trascrivi solo il testo chiaramente visibile nell'immagine, mantenendo l'ordine di lettura. Non inventare, completare o interpretare parole illeggibili. Se non c'è testo leggibile, restituisci una stringa vuota. Restituisci solo il testo trascritto.",
            },
            { inlineData: { mimeType, data: image.toString("base64") } },
          ],
        }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    },
  );
  if (!response.ok) throw new Error(`GEMINI_OCR_${response.status}`);
  const body = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  return { text, provider: "gemini" };
}

export function parseAiJson<T>(content: string): T {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}