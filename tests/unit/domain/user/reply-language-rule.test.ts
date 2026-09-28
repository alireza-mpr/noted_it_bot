import { describe, expect, it } from "vitest";
import { replyLanguageOf } from "../../../../src/domain/user/reply-language-rule";
import type { SupportedLanguage } from "../../../../src/domain/user/supported-language";
import { newUser, type User } from "../../../../src/domain/user/user";

const ALICE = { username: "alice", firstName: "Alice", lastName: null, telegramLanguageCode: "pt-BR" };

// Returns Alice, with the language she chose and the language of her
// Telegram app.
function aliceWith(chosenLanguage: SupportedLanguage | null, telegramLanguageCode: string | null): User {
  const alice = newUser(42, { ...ALICE, telegramLanguageCode });
  return { ...alice, settings: { ...alice.settings, language: chosenLanguage } };
}

describe("replyLanguageOf, in the English edition", () => {
  it("uses the language the user chose, over the Telegram language", () => {
    expect(replyLanguageOf(aliceWith("fa", "de"), "english")).toEqual({ language: "fa", source: "user-choice" });
  });

  it("uses the Telegram language when the user chose none, without its region", () => {
    expect(replyLanguageOf(aliceWith(null, "pt-BR"), "english")).toEqual({ language: "pt", source: "telegram" });
  });

  it("falls back to English when the Telegram language is not supported", () => {
    expect(replyLanguageOf(aliceWith(null, "uz"), "english")).toEqual({ language: "en", source: "edition-default" });
  });

  it("falls back to English when Telegram sends no language, or the user has no profile yet", () => {
    expect(replyLanguageOf(aliceWith(null, null), "english")).toEqual({ language: "en", source: "edition-default" });
    expect(replyLanguageOf({ ...aliceWith(null, "fa"), profile: null }, "english")).toEqual({
      language: "en",
      source: "edition-default",
    });
  });
});

describe("replyLanguageOf, in the Persian edition", () => {
  it("uses the language the user chose", () => {
    expect(replyLanguageOf(aliceWith("de", "en"), "persian")).toEqual({ language: "de", source: "user-choice" });
  });

  it("replies in Persian when the user chose none, even with the Telegram app in another language", () => {
    expect(replyLanguageOf(aliceWith(null, "en"), "persian")).toEqual({ language: "fa", source: "edition-default" });
    expect(replyLanguageOf(aliceWith(null, null), "persian")).toEqual({ language: "fa", source: "edition-default" });
  });
});
