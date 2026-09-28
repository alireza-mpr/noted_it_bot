import {
  defaultLanguageOf,
  type BotEdition,
} from "../bot-edition/bot-edition";
import {
  parseLanguageCode,
  type SupportedLanguage,
} from "./supported-language";
import type { User } from "./user";

// The editions that reply in the language of the user's Telegram app. The
// Persian edition does not: many Persian speakers have their app in English.
const EDITIONS_THAT_FOLLOW_TELEGRAM: ReadonlySet<BotEdition> = new Set([
  "english",
]);

// Represents where the reply language comes from: the language the user
// chose with /lang, the language of the user's Telegram app, or the
// edition's default language.
export type ReplyLanguageSource = "user-choice" | "telegram" | "edition-default";

// Represents the language the bot replies in, and where it comes from.
export interface ReplyLanguage {
  language: SupportedLanguage;
  source: ReplyLanguageSource;
}

// Returns the language the bot replies to the user in. See "The reply
// language" in docs/EDGE_CASES.md.
export function replyLanguageOf(
  user: User,
  botEdition: BotEdition,
): ReplyLanguage {
  if (user.settings.language !== null) {
    return { language: user.settings.language, source: "user-choice" };
  }
  const telegramLanguage = EDITIONS_THAT_FOLLOW_TELEGRAM.has(botEdition)
    ? telegramLanguageOf(user)
    : null;
  return telegramLanguage === null
    ? { language: defaultLanguageOf(botEdition), source: "edition-default" }
    : { language: telegramLanguage, source: "telegram" };
}

function telegramLanguageOf(user: User): SupportedLanguage | null {
  const telegramLanguageCode = user.profile?.telegramLanguageCode ?? null;
  return telegramLanguageCode === null
    ? null
    : parseLanguageCode(telegramLanguageCode);
}
