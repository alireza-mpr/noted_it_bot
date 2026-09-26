import { describe, expect, it } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  getLanguageDisplayName,
  resolveLanguage,
  supportedLanguageNames,
  toSupportedLanguage,
} from "../../src/translation/language";

describe("toSupportedLanguage", () => {
  it("reduces regional and differently cased tags to a supported language", () => {
    expect(toSupportedLanguage("fa")).toBe("fa");
    expect(toSupportedLanguage("pt-BR")).toBe("pt");
    expect(toSupportedLanguage("zh_Hans")).toBe("zh");
    expect(toSupportedLanguage("EN-us")).toBe("en");
    expect(toSupportedLanguage("de-DE")).toBe("de");
  });

  it("returns null for anything else", () => {
    for (const code of ["uz", "he", "xx", "", "  ", "tlh", "english", undefined, null]) {
      expect(toSupportedLanguage(code as string | undefined), String(code)).toBeNull();
    }
  });
});

describe("resolveLanguage", () => {
  it("accepts codes in any case, with a region", () => {
    expect(resolveLanguage("fa")).toBe("fa");
    expect(resolveLanguage("FA")).toBe("fa");
    expect(resolveLanguage("de-DE")).toBe("de");
    expect(resolveLanguage("pt_BR")).toBe("pt");
  });

  it("accepts the English name, the native name, and a few common aliases", () => {
    expect(resolveLanguage("Persian")).toBe("fa");
    expect(resolveLanguage("  persian ")).toBe("fa");
    expect(resolveLanguage("Farsi")).toBe("fa");
    expect(resolveLanguage("فارسی")).toBe("fa");
    expect(resolveLanguage("فارسي")).toBe("fa");
    expect(resolveLanguage("Deutsch")).toBe("de");
    expect(resolveLanguage("German")).toBe("de");
    expect(resolveLanguage("español")).toBe("es");
    expect(resolveLanguage("Espanol")).toBe("es");
    expect(resolveLanguage("français")).toBe("fr");
    expect(resolveLanguage("Chinese")).toBe("zh");
    expect(resolveLanguage("Mandarin")).toBe("zh");
    expect(resolveLanguage("中文")).toBe("zh");
    expect(resolveLanguage("日本語")).toBe("ja");
    expect(resolveLanguage("한국어")).toBe("ko");
    expect(resolveLanguage("Nederlands")).toBe("nl");
    expect(resolveLanguage("polski")).toBe("pl");
    expect(resolveLanguage("العربية")).toBe("ar");
    expect(resolveLanguage("English")).toBe("en");
  });

  it("recognises every supported language by its own name", () => {
    for (const code of SUPPORTED_LANGUAGES) {
      expect(resolveLanguage(getLanguageDisplayName(code)), code).toBe(code);
    }
  });

  it("rejects unsupported languages, gibberish and injection attempts", () => {
    for (const input of ["Klingon", "xx", "zz", "Swahili", "Hebrew", "", "   ", "'; DROP TABLE user_preference;--", "a".repeat(500)]) {
      expect(resolveLanguage(input), input.slice(0, 30)).toBeNull();
    }
  });
});

describe("supportedLanguageNames", () => {
  it("lists every supported language by its own name", () => {
    const names = supportedLanguageNames();
    for (const code of SUPPORTED_LANGUAGES) {
      expect(names, code).toContain(getLanguageDisplayName(code));
    }
    expect(names).toContain("فارسی");
    expect(names).toContain("Deutsch");
  });
});
