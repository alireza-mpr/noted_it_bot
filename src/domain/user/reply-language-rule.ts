import { parseLanguageCode, type SupportedLanguage } from "./supported-language";
import type { User } from "./user";

const FALLBACK_LANGUAGE: SupportedLanguage = "en";

// Represents where the reply language comes from: the language the user
// chose with /lang, the language of the user's Telegram app, or English when
// neither is set or supported.
export type ReplyLanguageSource = "user-choice" | "telegram" | "english-fallback";

// Represents the language the bot replies in, and where it comes from.
export interface ReplyLanguage {
  language: SupportedLanguage;
  source: ReplyLanguageSource;
}

// Returns the language the bot replies to the user in. See "The reply
// language" in docs/EDGE_CASES.md.
export function replyLanguageOf(user: User): ReplyLanguage {
  if (user.settings.language !== null) {
    return { language: user.settings.language, source: "user-choice" };
  }
  const telegramLanguage = telegramLanguageOf(user);
  return telegramLanguage === null
    ? { language: FALLBACK_LANGUAGE, source: "english-fallback" }
    : { language: telegramLanguage, source: "telegram" };
}

function telegramLanguageOf(user: User): SupportedLanguage | null {
  const telegramLanguageCode = user.profile?.telegramLanguageCode ?? null;
  return telegramLanguageCode === null ? null : parseLanguageCode(telegramLanguageCode);
}
