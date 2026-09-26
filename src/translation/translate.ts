import translateSystemPrompt from "../prompts/translate_system.txt";
import translateUserPrompt from "../prompts/translate_user.txt";
import type { Router } from "../router/router";
import { describeError, Logger } from "../logging/logger";

const logger = new Logger("translateText");

export interface TranslateEnv {
  I18N: KVNamespace;
}

function buildUserPrompt(lang: string, text: string): string {
  return translateUserPrompt
    .trim()
    .replace("{lang}", () => lang)
    .replace("{text}", () => text);
}

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
export async function translateText(
  env: TranslateEnv,
  router: Router,
  text: string,
  lang: string | undefined,
): Promise<string> {
  if (!lang || lang === "en") {
    return text;
  }

  const key = await cacheKey(text, lang);
  const cached = await env.I18N.get(key);
  if (cached !== null) {
    logger.debug("translation cache hit", { lang });
    return cached;
  }

  try {
    const answer = await router.generate({
      systemPrompt: translateSystemPrompt.trim(),
      userPrompt: buildUserPrompt(lang, text),
      temperature: 0,
    });
    if (answer.result === "failed") {
      logger.error("no model translated", { failure: answer.failure });
      return text;
    }

    const translated = answer.text.trim();
    if (!translated) {
      logger.error("empty translation", { model: answer.model });
      return text;
    }

    await env.I18N.put(key, translated);
    logger.info("translation generated", { lang, model: answer.model });
    return translated;
  } catch (err) {
    logger.error("threw", describeError(err));
    return text;
  }
}
