export const DEFAULT_LANGUAGE = "en";

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

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const ALIASES: Record<string, SupportedLanguage> = {
  farsi: "fa",
  mandarin: "zh",
  "simplified chinese": "zh",
  castellano: "es",
  "brazilian portuguese": "pt",
};

const SUPPORTED = new Set<string>(SUPPORTED_LANGUAGES);

// A Telegram or stored language tag ("pt-BR", "zh_Hans", "de-DE") reduced to
// one of the supported languages, or null when it isn't one of them.
export function toSupportedLanguage(code: string | null | undefined): SupportedLanguage | null {
  const primary = code?.trim().toLowerCase().split(/[-_]/)[0];
  return primary && SUPPORTED.has(primary) ? (primary as SupportedLanguage) : null;
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function displayName(code: string, inLocale: string): string | undefined {
  try {
    return new Intl.DisplayNames([inLocale], { type: "language" }).of(code);
  } catch {
    return undefined;
  }
}

let namesToLanguage: Map<string, SupportedLanguage> | undefined;

function knownNames(): Map<string, SupportedLanguage> {
  if (!namesToLanguage) {
    namesToLanguage = new Map();
    for (const code of SUPPORTED_LANGUAGES) {
      for (const name of [displayName(code, "en"), displayName(code, code)]) {
        if (name) {
          namesToLanguage.set(normalizeName(name), code);
        }
      }
    }
    for (const [alias, code] of Object.entries(ALIASES)) {
      namesToLanguage.set(normalizeName(alias), code);
    }
  }
  return namesToLanguage;
}

// What the user typed after /lang: a code ("fa", "pt-BR"), the language's
// English name ("Persian") or its own name ("فارسی", "Deutsch"). Only the
// supported languages are recognised, and nothing here calls a model.
export function resolveLanguage(input: string): SupportedLanguage | null {
  const trimmed = input.trim();
  if (/^[A-Za-z]{2,3}([-_][A-Za-z]{2,4})?$/.test(trimmed)) {
    const byCode = toSupportedLanguage(trimmed);
    if (byCode) {
      return byCode;
    }
  }
  return knownNames().get(normalizeName(trimmed)) ?? null;
}

// The language's name in that language ("fa" becomes "فارسی", "de" becomes "Deutsch"),
// via the platform's built-in Intl.DisplayNames: deterministic, free and instant.
// Falls back to the raw code if it's not a recognized BCP47 tag.
export function getLanguageDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function supportedLanguageNames(): string {
  return SUPPORTED_LANGUAGES.map((code) => getLanguageDisplayName(code)).join(", ");
}
