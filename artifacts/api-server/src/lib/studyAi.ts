import { openai } from "@workspace/integrations-openai-ai-server";

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

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
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
  const title = cleanShortText(response.choices[0]?.message?.content ?? "", 70);
  return title.length >= 4 ? title : null;
}

export async function generateQuickExplanation(question: string, options: string[]): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
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
  const text = cleanShortText(response.choices[0]?.message?.content ?? "", 700);
  if (text.length < 12) throw new Error("Spiegazione IA non disponibile");
  return text;
}