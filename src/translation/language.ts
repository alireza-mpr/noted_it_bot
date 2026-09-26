export interface LanguageEnv {
  GEMINI_API_KEY: string;
}

export const DEFAULT_LANGUAGE = "en";
const LANGUAGE_MODEL = "gemini-3.1-flash-lite";
const BCP47_LIKE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

// Resolves free-text (a language name, in any language — e.g. "Persian",
// "فارسی", "farsi") or an already-valid code (e.g. "fa", "de-DE") into a
// BCP47-ish code. Returns null if it can't be confidently resolved, so the
// caller can tell the user rather than silently guessing.
export async function resolveLanguageCode(env: LanguageEnv, input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (BCP47_LIKE.test(trimmed)) {
    return trimmed.length <= 3 ? trimmed.toLowerCase() : trimmed;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${LANGUAGE_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  "The user is naming a language, possibly informally and in any language. Reply with only " +
                  "its IETF BCP 47 code (e.g. 'fa', 'de', 'pt-BR'). If you cannot confidently identify a real " +
                  "language, reply with exactly: UNKNOWN",
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text: trimmed }] }],
          generationConfig: { temperature: 0 },
        }),
      }
    );

    if (!response.ok) {
      console.error("resolveLanguageCode: Gemini returned", response.status, await response.text());
      return null;
    }

    const data = await response.json<{
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    }>();

    const code = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!code || code === "UNKNOWN" || !BCP47_LIKE.test(code)) {
      return null;
    }
    return code;
  } catch (err) {
    console.error("resolveLanguageCode: threw", err);
    return null;
  }
}

// The autonym — a language's own name for itself (e.g. "fa" -> "فارسی",
// "de" -> "Deutsch") — via the platform's built-in Intl.DisplayNames rather
// than a Gemini call: deterministic, free, and instant. Falls back to the
// raw code if it's not a recognized BCP47 tag.
export function getLanguageDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
