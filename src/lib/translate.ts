export interface TranslateEnv {
  I18N: KVNamespace;
  GEMINI_API_KEY: string;
}

const TRANSLATE_MODEL = "gemini-3.8-flash";

async function cacheKey(text: string, lang: string): Promise<string> {
  const data = new TextEncoder().encode(`${lang}:${text}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `i18n:${hex}`;
}

// Translates one of the bot's own fixed UI strings into `lang`, caching the
// result in KV (keyed by a hash of the English text + lang, so editing the
// English wording later automatically invalidates stale cached versions).
// Falls back to the original English text on any cache-miss failure — a
// translation outage should never block a reply. `text` may contain literal
// placeholder tokens like "{0}"; the system instruction tells Gemini to
// preserve them untouched so callers can splice in dynamic content (e.g. a
// link) after translation without re-translating per-event content.
export async function translateText(env: TranslateEnv, text: string, lang: string | undefined): Promise<string> {
  if (!lang || lang === "en") {
    return text;
  }

  const key = await cacheKey(text, lang);
  const cached = await env.I18N.get(key);
  if (cached !== null) {
    return cached;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TRANSLATE_MODEL}:generateContent`,
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
                  "Translate the given text, part of a Telegram bot's UI, into the target language. " +
                  "If it contains a placeholder token like {0}, preserve it exactly as written — do not " +
                  "translate, move, or alter it. Preserve emoji as-is. Reply with only the translated " +
                  "text and nothing else.",
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text: `Target language (IETF BCP47): ${lang}\n\nText:\n${text}` }] }],
          generationConfig: { temperature: 0 },
        }),
      }
    );

    if (!response.ok) {
      console.error("translateText: Gemini returned", response.status, await response.text());
      return text;
    }

    const data = await response.json<{
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    }>();

    const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!translated) {
      console.error("translateText: no text in Gemini response", JSON.stringify(data));
      return text;
    }

    await env.I18N.put(key, translated);
    return translated;
  } catch (err) {
    console.error("translateText: threw", err);
    return text;
  }
}
