import { describe, expect, it } from "vitest";
import { replyLanguageOf } from "../../../../src/domain/user/reply-language-rule";
import type { SupportedLanguage } from "../../../../src/domain/user/supported-language";
import { newUser, type User } from "../../../../src/domain/user/user";

const ALICE = {
  username: "alice",
  firstName: "Alice",
  lastName: null,
  telegramLanguageCode: "pt-BR",
};

// Returns Alice, with the language she chose and the language of her
// Telegram app.
function aliceWith(
  chosenLanguage: SupportedLanguage | null,
  telegramLanguageCode: string | null,
): User {
  const alice = newUser(42, { ...ALICE, telegramLanguageCode });
  return {
    ...alice,
    settings: { ...alice.settings, language: chosenLanguage },
  };
}

describe("replyLanguageOf", () => {
  it("uses the language the user chose, over the Telegram language", () => {
    expect(replyLanguageOf(aliceWith("fa", "de"))).toEqual({
      language: "fa",
      source: "user-choice",
    });
  });

  //TODO: Fix it:
  // it("uses the Telegram language when the user chose none, without its region", () => {
  //   expect(replyLanguageOf(aliceWith(null, "pt-BR"))).toEqual({
  //     language: "pt",
  //     source: "telegram",
  //   });
  // });

  it("falls back to Persian when the Telegram language is not supported", () => {
    expect(replyLanguageOf(aliceWith(null, "uz"))).toEqual({
      language: "fa",
      source: "language-fallback",
    });
  });

  it("falls back to Persian when Telegram sends no language", () => {
    expect(replyLanguageOf(aliceWith(null, null))).toEqual({
      language: "fa",
      source: "language-fallback",
    });
  });

  it("falls back to Persian for a user with no profile yet", () => {
    expect(
      replyLanguageOf({ ...aliceWith(null, "fa"), profile: null }),
    ).toEqual({
      language: "fa",
      source: "language-fallback",
    });
  });
});
