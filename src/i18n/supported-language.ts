// The languages the bot replies in, as ISO 639-1 codes.
export const SUPPORTED_LANGUAGES = [
  "en",
  "fa",
  "ar",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ru",
  "tr",
  "zh",
  "ja",
  "ko",
  "hi",
  "nl",
  "pl",
] as const;

// Represents a language the bot replies in, e.g. "fa".
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Returns the supported language of a language code, or null if the bot does
// not reply in it. A region or script is ignored, e.g. "pt-BR" gives "pt" and
// "zh_Hans" gives "zh".
export function parseLanguageCode(code: string): SupportedLanguage | null {
  const primaryCode = code.trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(primaryCode)
    ? (primaryCode as SupportedLanguage)
    : null;
}
