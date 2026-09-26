import type { Router } from "../router/router";
import { describeError, Logger } from "../logging/logger";

const logger = new Logger("resolveLanguageCode");

export const DEFAULT_LANGUAGE = "en";
const BCP47_LIKE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

const LANGUAGE_SYSTEM_PROMPT =
  "The user is naming a language, possibly informally and in any language. Reply with only " +
  "its IETF BCP 47 code (e.g. 'fa', 'de', 'pt-BR'). If you cannot confidently identify a real " +
  "language, reply with exactly: UNKNOWN";

// Resolves free-text (a language name, in any language — e.g. "Persian",
// "فارسی", "farsi") or an already-valid code (e.g. "fa", "de-DE") into a
// BCP47-ish code. Returns null if it can't be confidently resolved, so the
// caller can tell the user rather than silently guessing.
export async function resolveLanguageCode(router: Router, input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (BCP47_LIKE.test(trimmed)) {
    return trimmed.length <= 3 ? trimmed.toLowerCase() : trimmed;
  }

  try {
    const answer = await router.generate({
      systemPrompt: LANGUAGE_SYSTEM_PROMPT,
      userPrompt: trimmed,
      temperature: 0,
    });
    if (answer.result === "failed") {
      logger.error("no model answered", { failure: answer.failure });
      return null;
    }

    const code = answer.text.trim();
    if (!code || code === "UNKNOWN" || !BCP47_LIKE.test(code)) {
      return null;
    }
    return code;
  } catch (err) {
    logger.error("threw", describeError(err));
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
