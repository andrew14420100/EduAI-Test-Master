import {
  generateFlashcards as generateLocalFlashcards,
  generateQuestionsWithKey,
  type Flashcard,
  type GeneratedQuestion,
  type SourceMaterial,
} from "./contentStudy";
import { aiChat, parseAiJson } from "./aiProvider";

function cleanShortText(value: string, maxLength: number): string {
  return value
    .replace(/[`"'“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

export async function generateMaterialTitle(params: {
  extractedText: string;
}): Promise<string | null> {
  if (!params.extractedText.trim()) return null;

  const response = await aiChat({
    max_completion_tokens: 80,
    messages: [
      {
        role: "system",
        content:
          "Sei un assistente per studenti italiani. Genera esclusivamente un titolo breve, specifico e descrittivo in italiano (massimo 70 caratteri), senza virgolette, punti finali o spiegazioni.",
      },
      {
        role: "user",
        content: `Crea il titolo per questo materiale di studio:\n\n${params.extractedText.slice(0, 6000)}`,
      },
    ],
  });
  const title = cleanShortText(response.content, 70);
  return title.length >= 4 ? title : null;
}

export async function generateQuickExplanation(question: string, options: string[]): Promise<string> {
  const response = await aiChat({
    max_completion_tokens: 220,
    messages: [
      {
        role: "system",
        content:
          "Sei un tutor italiano. Spiega il concetto richiesto in modo molto semplice, in massimo 3 frasi. Non indicare quale risposta del quiz sia corretta e non copiare le opzioni.",
      },
      {
        role: "user",
        content: `Domanda: ${question}\nOpzioni presenti nel quiz: ${options.join(" | ")}`,
      },
    ],
  });
  const text = cleanShortText(response.content, 700);
  if (text.length < 12) throw new Error("Spiegazione IA non disponibile");
  return text;
}

const MAX_QUIZ_CONTEXT_CHARS = 240_000;

type AiQuestionPayload = {
  question?: unknown;
  options?: unknown;
  correctIndex?: unknown;
};

function sourceContext(sources: SourceMaterial[]) {
  let remaining = MAX_QUIZ_CONTEXT_CHARS;
  const blocks: string[] = [];
  for (const source of sources) {
    if (remaining < 600) break;
    const text = source.text.slice(0, remaining);
    blocks.push(`MATERIALE: ${source.title}\n${text}`);
    remaining -= text.length;
  }
  return blocks.join("\n\n---\n\n");
}

function asGeneratedQuestion(value: AiQuestionPayload): GeneratedQuestion | null {
  const question = typeof value.question === "string"
    ? value.question.replace(/\s+/g, " ").trim()
    : "";
  const options = Array.isArray(value.options)
    ? value.options
      .filter((option): option is string => typeof option === "string")
      .map((option) => option.replace(/\s+/g, " ").trim())
      .filter(Boolean)
    : [];
  const correctIndex = value.correctIndex;
  const uniqueOptions = new Set(options.map((option) => option.toLocaleLowerCase("it-IT")));
  if (
    question.length < 24 ||
    question.length > 520 ||
    /_{2,}/.test(question) ||
    options.length < 2 ||
    options.length > 4 ||
    uniqueOptions.size !== options.length ||
    options.some((option) => option.length < 1 || option.length > 220 || /_{2,}/.test(option)) ||
    !Number.isInteger(correctIndex) ||
    (correctIndex as number) < 0 ||
    (correctIndex as number) >= options.length
  ) {
    return null;
  }
  return { question, options, correctIndex: correctIndex as number };
}

/**
 * Produces original, exam-style questions from the material itself. The model is
 * deliberately asked to reason over the source, not to transform individual
 * sentences, so fill-in-the-blank questions and copied phrasing are rejected.
 */
export async function generateExamQuestions(
  sources: SourceMaterial[],
  count: number,
): Promise<GeneratedQuestion[]> {
  const context = sourceContext(sources);
  if (!context.trim()) throw new Error("CONTENUTO_NON_DISPONIBILE");

  const trueFalseCount = Math.max(1, Math.floor(count / 5));
  const applicationCount = Math.max(2, Math.floor(count / 4));
  let response;
  try {
    response = await aiChat({
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Sei un docente italiano molto selettivo che prepara fac-simile per esami reali. " +
          "Devi generare domande nuove, rigorose e risolvibili SOLO usando il contenuto fornito. " +
          "Non usare mai spazi vuoti, trattini bassi, frasi da completare o domande che copiano/incollano il testo. " +
          "Parafrasa, confronta concetti, richiedi deduzioni, nessi causali, applicazioni e riconoscimento di errori. " +
          "I distrattori devono essere plausibili, specifici e pertinenti, ma una sola risposta deve essere corretta. " +
          "Non inventare fatti assenti dai materiali. Rispondi esclusivamente con JSON valido.",
      },
      {
        role: "user",
        content:
          `Crea esattamente ${count} quesiti per un fac-simile impegnativo.\n` +
          `Almeno ${trueFalseCount} devono essere vero/falso con esattamente due opzioni ("Vero", "Falso").\n` +
          `Almeno ${applicationCount} devono verificare collegamenti, confronto o applicazione fra concetti e avere quattro opzioni.\n` +
          "Per tutti gli altri quesiti usa quattro opzioni. Alterna gli argomenti, evita duplicati e non rivelare mai la risposta nella formulazione.\n" +
          'Restituisci soltanto {"questions":[{"question":"...","options":["..."],"correctIndex":0}]}.\n\n' +
          `CONTENUTO DA STUDIARE:\n${context}`,
      },
    ],
    });
  } catch {
    return generateQuestionsWithKey(sources, count, sources.map((source) => source.id).join("|"));
  }

  const raw = response.content;
  if (!raw) throw new Error("RISPOSTA_IA_VUOTA");
  let parsed: { questions?: unknown };
  try {
    parsed = parseAiJson<{ questions?: unknown }>(raw);
  } catch {
    throw new Error("RISPOSTA_IA_NON_VALIDA");
  }
  if (!Array.isArray(parsed.questions)) throw new Error("RISPOSTA_IA_NON_VALIDA");

  const questions = parsed.questions
    .map((item) => asGeneratedQuestion(item as AiQuestionPayload))
    .filter((question): question is GeneratedQuestion => question !== null);
  const uniqueQuestions = new Map<string, GeneratedQuestion>();
  for (const question of questions) {
    uniqueQuestions.set(question.question.toLocaleLowerCase("it-IT"), question);
  }
  const result = [...uniqueQuestions.values()];
  const trueFalse = result.filter((question) => question.options.length === 2).length;
  if (result.length !== count || trueFalse < trueFalseCount) {
    throw new Error("RISPOSTA_IA_INCOMPLETA");
  }
  return result;
}

export async function generateFlashcardsWithAi(
  sources: SourceMaterial[],
  perMaterial: number,
  seedInput: string,
): Promise<Flashcard[]> {
  const context = sourceContext(sources);
  if (!context.trim()) return [];
  try {
    const response = await aiChat({
      max_completion_tokens: Math.max(1200, sources.length * perMaterial * 100),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Sei un tutor italiano. Crea flashcard chiare e utili usando esclusivamente i materiali forniti. " +
            "Non inventare informazioni. Rispondi solo JSON valido.",
        },
        {
          role: "user",
          content:
            `Crea esattamente ${sources.length * perMaterial} flashcard, distribuite tra i materiali.\n` +
            'Formato: {"flashcards":[{"front":"domanda o concetto","back":"spiegazione","materialTitle":"titolo"}]}.\n' +
            context,
        },
      ],
    });
    const parsed = parseAiJson<{ flashcards?: unknown }>(response.content);
    const cards = Array.isArray(parsed.flashcards)
      ? parsed.flashcards.filter((card): card is Flashcard => {
        if (!card || typeof card !== "object") return false;
        const value = card as Record<string, unknown>;
        return typeof value.front === "string" && value.front.trim().length >= 8
          && typeof value.back === "string" && value.back.trim().length >= 12
          && typeof value.materialTitle === "string" && value.materialTitle.trim().length > 0;
      }).slice(0, sources.length * perMaterial)
      : [];
    if (cards.length >= Math.min(2, sources.length * perMaterial)) return cards;
  } catch {
    // The deterministic generator is the unlimited, no-key fallback.
  }
  return generateLocalFlashcards(sources, perMaterial, seedInput);
}