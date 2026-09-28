import {
  parseLanguageCode,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "../domain/user/supported-language";

// Matches a language code, with or without a region or script, e.g. "fa",
// "pt-BR" or "zh_Hans".
const LANGUAGE_CODE = /^[A-Za-z]{2,3}([-_][A-Za-z]{2,4})?$/;

// Other names that users type for a language, e.g. "Farsi" for Persian.
const OTHER_LANGUAGE_NAMES: Readonly<Record<string, SupportedLanguage>> = {
  farsi: "fa",
  mandarin: "zh",
  "simplified chinese": "zh",
  castellano: "es",
  "brazilian portuguese": "pt",
};

// Accents and Arabic short vowels, after NFD splits them from their letters.
const ACCENT_MARKS = /[̀-ًͯ-ٰٟ]/g;

const LANGUAGE_OF_NAME: ReadonlyMap<string, SupportedLanguage> = languageOfNameMap();

// Returns the language's name in its own language, e.g. "فارسی" for "fa" and
// "Deutsch" for "de".
export function languageNameOf(language: SupportedLanguage): string {
  return new Intl.DisplayNames([language], { type: "language" }).of(language) ?? language;
}

// Returns the supported language that the text names, or null if the bot does
// not reply in it. The text can be a code (e.g. "fa", "pt-BR"), the English
// name (e.g. "Persian"), the language's own name (e.g. "فارسی") or another
// common name (e.g. "Farsi"). No model is called.
export function parseLanguageName(languageText: string): SupportedLanguage | null {
  const trimmedText = languageText.trim();
  const languageOfCode = LANGUAGE_CODE.test(trimmedText) ? parseLanguageCode(trimmedText) : null;
  return languageOfCode ?? LANGUAGE_OF_NAME.get(comparableNameOf(trimmedText)) ?? null;
}

// Returns every name the bot knows, in its comparable form, with its language:
// the English name, the language's own name, and the other names.
function languageOfNameMap(): Map<string, SupportedLanguage> {
  const languageOfName = new Map<string, SupportedLanguage>();
  for (const language of SUPPORTED_LANGUAGES) {
    const englishName = new Intl.DisplayNames(["en"], { type: "language" }).of(language);
    for (const languageName of [englishName, languageNameOf(language)]) {
      if (languageName !== undefined) {
        languageOfName.set(comparableNameOf(languageName), language);
      }
    }
  }
  for (const [otherName, language] of Object.entries(OTHER_LANGUAGE_NAMES)) {
    languageOfName.set(comparableNameOf(otherName), language);
  }
  return languageOfName;
}

// Returns the name in the form that names are compared in: no accents, lower
// case, one space between words, e.g. "Español" gives "espanol".
function comparableNameOf(languageName: string): string {
  return (
    languageName
      .normalize("NFD")
      .replace(ACCENT_MARKS, "")
      // Persian typed on an Arabic keyboard has the Arabic "ي" and "ك".
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}
