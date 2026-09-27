import ar from "./ar.json";
import de from "./de.json";
import es from "./es.json";
import fa from "./fa.json";
import fr from "./fr.json";
import hi from "./hi.json";
import it from "./it.json";
import ja from "./ja.json";
import ko from "./ko.json";
import nl from "./nl.json";
import pl from "./pl.json";
import pt from "./pt.json";
import ru from "./ru.json";
import tr from "./tr.json";
import zh from "./zh.json";
import type { MessageId } from "../../interactiveMessages/messages";
import type { SupportedLanguage } from "../language";

// Keyed by message id. tests/unit/translations.test.ts checks that every id is
// there.
export const TRANSLATIONS: Record<Exclude<SupportedLanguage, "en">, Partial<Record<MessageId, string>>> = {
  ar,
  de,
  es,
  fa,
  fr,
  hi,
  it,
  ja,
  ko,
  nl,
  pl,
  pt,
  ru,
  tr,
  zh,
};
