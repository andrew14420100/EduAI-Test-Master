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

export function parseAiJson<T>(content: string): T {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}