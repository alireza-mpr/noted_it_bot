import { BOT_MESSAGES, type BotMessageId } from "./bot-message";
import type { SupportedLanguage } from "./supported-language";
import ar from "./translations/ar.json";
import de from "./translations/de.json";
import es from "./translations/es.json";
import fa from "./translations/fa.json";
import fr from "./translations/fr.json";
import hi from "./translations/hi.json";
import it from "./translations/it.json";
import ja from "./translations/ja.json";
import ko from "./translations/ko.json";
import nl from "./translations/nl.json";
import pl from "./translations/pl.json";
import pt from "./translations/pt.json";
import ru from "./translations/ru.json";
import tr from "./translations/tr.json";
import zh from "./translations/zh.json";

// Represents the translated bot messages of one language, by id.
export type Translations = Partial<Record<BotMessageId, string>>;

// The translations of every supported language except English. They are
// written ahead of time, so replying never calls a model (ADR-6).
export const TRANSLATIONS: Record<
  Exclude<SupportedLanguage, "en">,
  Translations
> = { ar, de, es, fa, fr, hi, it, ja, ko, nl, pl, pt, ru, tr, zh };

// Returns the bot message in the language, or in English if it has no
// translation.
export function translate(
  botMessageId: BotMessageId,
  language: SupportedLanguage,
): string {
  const englishText = BOT_MESSAGES[botMessageId];
  return language === "en"
    ? englishText
    : (TRANSLATIONS[language][botMessageId] ?? englishText);
}
