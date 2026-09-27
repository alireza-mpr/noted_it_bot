import { MESSAGES, type MessageId } from "../interactiveMessages/messages";
import { toSupportedLanguage } from "./language";
import { TRANSLATIONS } from "./translations";

// Returns the stored translation of a message. For English, or a language we
// do not support, returns the English text. It never calls a model: every
// reply text is in the catalog. (The repeat sentence is not a reply text: it
// is part of the event, and always in English.)
export function translateStatic(id: MessageId, lang: string | undefined): string {
  const supported = toSupportedLanguage(lang);
  const english = MESSAGES[id];
  return !supported || supported === "en" ? english : (TRANSLATIONS[supported][id] ?? english);
}
