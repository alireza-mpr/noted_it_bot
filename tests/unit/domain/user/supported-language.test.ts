import { describe, expect, it } from "vitest";
import { parseLanguageCode } from "../../../../src/domain/user/supported-language";

describe("parseLanguageCode", () => {
  it("ignores the region, the script and the casing", () => {
    expect(parseLanguageCode("fa")).toBe("fa");
    expect(parseLanguageCode("pt-BR")).toBe("pt");
    expect(parseLanguageCode("zh_Hans")).toBe("zh");
    expect(parseLanguageCode("EN-us")).toBe("en");
    expect(parseLanguageCode("de-DE")).toBe("de");
  });

  it("returns null for a language the bot does not reply in", () => {
    for (const code of ["uz", "he", "xx", "", "  ", "tlh", "english"]) {
      expect(parseLanguageCode(code), code).toBeNull();
    }
  });
});
