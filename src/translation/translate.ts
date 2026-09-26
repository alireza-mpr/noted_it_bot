import { MESSAGES, type MessageId } from "../interactiveMessages/messages";
import { toSupportedLanguage } from "./language";
import { TRANSLATIONS } from "./translations";

// The committed translation of a message, or its English text for English or an
// unsupported language. Never calls anything: every reply string is either in the
// catalog or, like the recurrence sentence, built in the reply language to begin with.
export function translateStatic(id: MessageId, lang: string | undefined): string {
  const supported = toSupportedLanguage(lang);
  const english = MESSAGES[id];
  return !supported || supported === "en" ? english : (TRANSLATIONS[supported][id] ?? english);
}
