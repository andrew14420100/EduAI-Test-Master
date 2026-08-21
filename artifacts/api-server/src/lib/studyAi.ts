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

  try {
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
  } catch {
    const fallback = params.extractedText
      .split(/\n+/)
      .map((line) => cleanShortText(line, 70))
      .find((line) => line.length >= 4);
    return fallback || "Materiale di studio";
  }
}

export async function generateQuickExplanation(question: string, options: string[]): Promise<string> {
  try {
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
    if (text.length >= 12) return text;
  } catch {
    // Use the offline explanation below.
  }
  return "Individua il concetto principale della domanda, rileggi la parte del materiale che lo definisce e confronta con attenzione le opzioni.";
}

const MAX_QUIZ_CONTEXT_CHARS = 480_000;

type AiQuestionPayload = {
  question?: unknown;
  options?: unknown;
  correctIndex?: unknown;
  sourceTitle?: unknown;
  evidence?: unknown;
  difficulty?: unknown;
  questionType?: unknown;
};

function sourceContext(sources: SourceMaterial[]) {
  const perSourceBudget = Math.max(
    4_000,
    Math.floor(MAX_QUIZ_CONTEXT_CHARS / Math.max(sources.length, 1)),
  );
  const blocks: string[] = [];
  for (const source of sources) {
    const text = source.text.trim();
    const selected = text.length <= perSourceBudget
      ? text
      : [
        text.slice(0, Math.floor(perSourceBudget * 0.45)),
        text.slice(
          Math.floor(text.length / 2) - Math.floor(perSourceBudget * 0.1),
          Math.floor(text.length / 2) + Math.floor(perSourceBudget * 0.1),
        ),
        text.slice(-Math.floor(perSourceBudget * 0.25)),
      ].join("\n[...sezione centrale omessa per limite contesto...]\n");
    if (!selected.trim()) continue;
    blocks.push(`MATERIALE: ${source.title}\n${selected}`);
  }
  return blocks.join("\n\n---\n\n");
}

function normalizedForMatch(value: string): string {
  return value
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function asGeneratedQuestion(
  value: AiQuestionPayload,
  sources: SourceMaterial[],
): GeneratedQuestion | null {
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
  const sourceTitle = typeof value.sourceTitle === "string"
    ? value.sourceTitle.replace(/\s+/g, " ").trim()
    : "";
  const evidence = typeof value.evidence === "string"
    ? value.evidence.replace(/\s+/g, " ").trim()
    : "";
  const difficulty = value.difficulty === "base"
    || value.difficulty === "medio"
    || value.difficulty === "avanzato"
    ? value.difficulty
    : null;
  const questionType = value.questionType === "scelta_multipla"
    || value.questionType === "completamento"
    || value.questionType === "vero_falso"
    ? value.questionType
    : null;
  const source = sources.find(
    (candidate) => candidate.title.toLocaleLowerCase("it-IT") === sourceTitle.toLocaleLowerCase("it-IT"),
  );
  const evidenceMatchesSource = source
    ? normalizedForMatch(source.text).includes(normalizedForMatch(evidence))
    : false;
  const uniqueOptions = new Set(options.map((option) => option.toLocaleLowerCase("it-IT")));
  if (
    question.length < 24 ||
    question.length > 520 ||
    (questionType !== "completamento" && /_{2,}/.test(question)) ||
    options.length < 2 ||
    options.length > 4 ||
    uniqueOptions.size !== options.length ||
    options.some((option) => option.length < 1 || option.length > 220 || /_{2,}/.test(option)) ||
    !Number.isInteger(correctIndex) ||
    (correctIndex as number) < 0 ||
    (correctIndex as number) >= options.length ||
    !source ||
    evidence.length < 24 ||
    evidence.length > 520 ||
    !evidenceMatchesSource ||
    !difficulty ||
    !questionType ||
    (questionType === "vero_falso" && (options.length !== 2 || options.some((option) => !["Vero", "Falso"].includes(option)))) ||
    (questionType === "completamento" && !/_{2,}/.test(question)) ||
    (questionType === "scelta_multipla" && options.length !== 4)
  ) {
    return null;
  }
  return {
    question,
    options,
    correctIndex: correctIndex as number,
    sourceTitle,
    evidence,
    difficulty,
    questionType,
  };
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
  const completionCount = Math.max(1, Math.floor(count / 5));
  const fallback = () => {
    const local = generateQuestionsWithKey(
      sources,
      count,
      sources.map((source) => source.id).join("|"),
    );
    if (local.length < count) throw new Error("CONTENUTO_INSUFFICIENTE");
    return local;
  };
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
           "Non copiare/incollare intere domande dal testo. Puoi alternare tre formati: scelta multipla, completamento di una frase " +
           "con uno spazio vuoto realmente ricavato dal testo, oppure vero/falso. " +
          "Parafrasa, confronta concetti, richiedi deduzioni, nessi causali, applicazioni e riconoscimento di errori. " +
           "I distrattori devono essere plausibili, specifici e pertinenti, ma una sola risposta deve essere corretta. " +
           "Non inventare fatti assenti dai materiali. Per ogni domanda indica il titolo esatto della fonte, " +
           "un estratto letterale di almeno 24 caratteri che dimostri la risposta e la difficoltà: base, medio o avanzato. " +
           "La difficoltà deve dipendere dalla complessità del contenuto: base per definizioni, medio per relazioni/applicazioni, " +
           "avanzato per analisi, confronto, calcolo o deduzioni. Rispondi esclusivamente con JSON valido.",
      },
      {
        role: "user",
        content:
          `Crea esattamente ${count} quesiti per un fac-simile impegnativo.\n` +
           `Inserisci almeno ${trueFalseCount} vero/falso con esattamente due opzioni ("Vero", "Falso") e almeno ${completionCount} completamenti con "______".\n` +
          `Almeno ${applicationCount} devono verificare collegamenti, confronto o applicazione fra concetti e avere quattro opzioni.\n` +
          "Per tutti gli altri quesiti usa quattro opzioni. Alterna gli argomenti, evita duplicati e non rivelare mai la risposta nella formulazione.\n" +
           'Per ogni elemento indica questionType ("scelta_multipla"|"completamento"|"vero_falso"). Restituisci soltanto {"questions":[{"question":"...","options":["..."],"correctIndex":0,"sourceTitle":"...","evidence":"...","difficulty":"base|medio|avanzato","questionType":"..."}]}.\n\n' +
          `CONTENUTO DA STUDIARE:\n${context}`,
      },
    ],
    });
  } catch {
    return fallback();
  }

  const raw = response.content;
  if (!raw) throw new Error("RISPOSTA_IA_VUOTA");
  let parsed: { questions?: unknown };
  try {
    parsed = parseAiJson<{ questions?: unknown }>(raw);
  } catch {
    return fallback();
  }
  if (!Array.isArray(parsed.questions)) return fallback();

  const questions = parsed.questions
    .map((item) => asGeneratedQuestion(item as AiQuestionPayload, sources))
    .filter((question): question is GeneratedQuestion => question !== null);
  const uniqueQuestions = new Map<string, GeneratedQuestion>();
  for (const question of questions) {
    uniqueQuestions.set(question.question.toLocaleLowerCase("it-IT"), question);
  }
  const result = [...uniqueQuestions.values()];
  const trueFalse = result.filter((question) => question.questionType === "vero_falso").length;
  const completions = result.filter((question) => question.questionType === "completamento").length;
  if (result.length !== count || trueFalse < trueFalseCount || completions < completionCount) {
    return fallback();
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