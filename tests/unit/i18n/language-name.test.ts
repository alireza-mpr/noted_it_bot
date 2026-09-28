import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGES } from "../../../src/domain/user/supported-language";
import { languageNameOf, parseLanguageName } from "../../../src/i18n/language-name";

describe("languageNameOf", () => {
  it("gives the language's name in its own language", () => {
    expect(languageNameOf("fa")).toBe("فارسی");
    expect(languageNameOf("de")).toBe("Deutsch");
    expect(languageNameOf("en")).toBe("English");
  });
});

describe("parseLanguageName", () => {
  it("accepts codes in any case, with a region", () => {
    expect(parseLanguageName("fa")).toBe("fa");
    expect(parseLanguageName("FA")).toBe("fa");
    expect(parseLanguageName("de-DE")).toBe("de");
    expect(parseLanguageName("pt_BR")).toBe("pt");
  });

  it("accepts the English name, the language's own name, and a few other names", () => {
    expect(parseLanguageName("Persian")).toBe("fa");
    expect(parseLanguageName("  persian ")).toBe("fa");
    expect(parseLanguageName("Farsi")).toBe("fa");
    expect(parseLanguageName("فارسی")).toBe("fa");
    expect(parseLanguageName("فارسي")).toBe("fa");
    expect(parseLanguageName("Deutsch")).toBe("de");
    expect(parseLanguageName("German")).toBe("de");
    expect(parseLanguageName("español")).toBe("es");
    expect(parseLanguageName("Espanol")).toBe("es");
    expect(parseLanguageName("français")).toBe("fr");
    expect(parseLanguageName("Chinese")).toBe("zh");
    expect(parseLanguageName("Mandarin")).toBe("zh");
    expect(parseLanguageName("中文")).toBe("zh");
    expect(parseLanguageName("日本語")).toBe("ja");
    expect(parseLanguageName("한국어")).toBe("ko");
    expect(parseLanguageName("Nederlands")).toBe("nl");
    expect(parseLanguageName("polski")).toBe("pl");
    expect(parseLanguageName("العربية")).toBe("ar");
    expect(parseLanguageName("English")).toBe("en");
  });

  it("accepts every supported language by its own name", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(parseLanguageName(languageNameOf(language)), language).toBe(language);
    }
  });

  it("refuses unsupported languages, nonsense and injection attempts", () => {
    for (const languageText of [
      "Klingon",
      "xx",
      "zz",
      "Swahili",
      "Hebrew",
      "",
      "   ",
      "'; DROP TABLE users;--",
      "a".repeat(500),
    ]) {
      expect(parseLanguageName(languageText), languageText.slice(0, 30)).toBeNull();
    }
  });
});
