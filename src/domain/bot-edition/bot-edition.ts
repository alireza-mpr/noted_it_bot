import type { SupportedLanguage } from "../user/supported-language";

const BOT_EDITIONS: readonly BotEdition[] = ["english", "persian"];
const DEFAULT_LANGUAGES: Record<BotEdition, SupportedLanguage> = {
  english: "en",
  persian: "fa",
};

// Represents an edition of the bot: one Telegram bot, run by its own Worker,
// for the users of one language, e.g. "persian" for @noted_it_fa_bot. See
// ADR-10 in ARCHITECTURE_DECISIONS_REGISTRY.md.
export type BotEdition = "english" | "persian";

// Returns the edition that a Worker's configuration names, or null if it is
// not one, e.g. "persian".
export function parseBotEdition(botEditionName: string): BotEdition | null {
  return (
    BOT_EDITIONS.find((botEdition) => botEdition === botEditionName.trim()) ??
    null
  );
}

// Returns the language the edition replies in when the user chose none.
export function defaultLanguageOf(botEdition: BotEdition): SupportedLanguage {
  return DEFAULT_LANGUAGES[botEdition];
}
