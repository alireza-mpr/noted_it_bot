import { describe, expect, it } from "vitest";
import { defaultLanguageOf, parseBotEdition } from "../../../../src/domain/bot-edition/bot-edition";

describe("parseBotEdition", () => {
  it("reads the name of an edition", () => {
    expect(parseBotEdition("english")).toBe("english");
    expect(parseBotEdition(" persian ")).toBe("persian");
  });

  it("gives null for anything else, e.g. a language code or nothing", () => {
    for (const botEditionName of ["fa", "Persian", "", "arabic"]) {
      expect(parseBotEdition(botEditionName), botEditionName).toBeNull();
    }
  });
});

describe("defaultLanguageOf", () => {
  it("is English for the English edition, and Persian for the Persian one", () => {
    expect(defaultLanguageOf("english")).toBe("en");
    expect(defaultLanguageOf("persian")).toBe("fa");
  });
});
