import translateSystemPrompt from "../prompts/translate_system.txt";
import translateUserPrompt from "../prompts/translate_user.txt";
import type { Router } from "../router/router";
import { describeError, Logger } from "../logging/logger";
import { toSupportedLanguage } from "./language";
import { TRANSLATIONS } from "./translations";

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

// The committed translation of a fixed message, or the English text when there is none
// (English, an unsupported language, or a string that isn't in the catalog). Never calls anything.
export function translateStatic(text: string, lang: string | undefined): string {
  const supported = toSupportedLanguage(lang);
  return !supported || supported === "en" ? text : (TRANSLATIONS[supported][text] ?? text);
}

// Translates a reply string into `lang`. Every fixed message is looked up in
// the committed translation files (src/translation/translations), which never
// calls a model. Only a string that isn't in them, such as the generated
// recurrence sentences, goes to a model, cached in KV (keyed by a hash of the
// English text + lang). That path is reached only for the supported languages,
// and only through messages that already cost a quota unit. Falls back to the
// original English text on any failure — a translation outage should never
// block a reply. `text` may contain literal placeholder tokens like "{0}"; the
// system instruction tells the model to preserve them untouched so callers can
// splice in dynamic content (e.g. a link) after translation.
export async function translateText(
  env: TranslateEnv,
  router: Router,
  text: string,
  lang: string | undefined,
): Promise<string> {
  const supported = toSupportedLanguage(lang);
  if (!supported || supported === "en") {
    return text;
  }

  const fixed = TRANSLATIONS[supported][text];
  if (fixed !== undefined) {
    return fixed;
  }

  lang = supported;
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
