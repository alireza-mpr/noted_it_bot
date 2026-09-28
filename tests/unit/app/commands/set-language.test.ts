import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../../../src/app/commands/set-language";
import type { SupportedLanguage } from "../../../../src/domain/user/supported-language";
import { newUser, type User } from "../../../../src/domain/user/user";
import { BOT_MESSAGES } from "../../../../src/i18n/bot-message";
import { TRANSLATIONS } from "../../../../src/i18n/translation";
import { axiomEventsOf } from "../../adapters/logging/axiom-events-of";
import { FakeReplier } from "../fake-replier";
import { InMemoryUserRepository } from "../in-memory-user-repository";

const USER_ID = 42;
// Alice's Telegram app is in German.
const ALICE = { username: "alice", firstName: "Alice", lastName: null, telegramLanguageCode: "de" };

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Returns Alice as stored, with the language she chose.
function storedAliceWith(chosenLanguage: SupportedLanguage | null): User {
  const alice = newUser(USER_ID, ALICE);
  return { ...alice, settings: { ...alice.settings, language: chosenLanguage }, version: 1 };
}

// Runs /lang for Alice, who chose the language before. Returns the replies,
// the language she has chosen after the command, the saves, and the log events.
async function sendLanguageCommand(languageText: string | null, chosenLanguage: SupportedLanguage | null = null) {
  const userRepository = new InMemoryUserRepository([storedAliceWith(chosenLanguage)]);
  const fakeReplier = new FakeReplier();
  const logEvents = await axiomEventsOf(() =>
    setLanguage(storedAliceWith(chosenLanguage), languageText, {
      userRepository,
      replier: fakeReplier,
      language: chosenLanguage ?? "de",
    }),
  );
  return {
    replyTexts: fakeReplier.texts,
    storedLanguage: userRepository.storedUsers.get(USER_ID)?.settings.language,
    saveCount: userRepository.saveCount,
    logEvents,
  };
}

describe("setLanguage", () => {
  it("shows the reply language by its own name, and on a new line how to change it", async () => {
    const { replyTexts, saveCount } = await sendLanguageCommand(null, "en");

    expect(replyTexts).toEqual([`🌎 I reply in English.\n${BOT_MESSAGES.LANG_CHANGE_HINT}`]);
    expect(saveCount).toBe(0);
  });

  it("shows the reply language in the reply language", async () => {
    const { replyTexts } = await sendLanguageCommand(null, "fa");

    expect(replyTexts).toEqual([`🌎 به زبان فارسی پاسخ می‌دهم.\n${TRANSLATIONS.fa.LANG_CHANGE_HINT}`]);
  });

  it("saves the chosen language, and confirms in it", async () => {
    const { replyTexts, storedLanguage, logEvents } = await sendLanguageCommand("Persian");

    expect(storedLanguage).toBe("fa");
    expect(replyTexts).toEqual(["باشه — از این به بعد به زبان فارسی پاسخ می‌دهم."]);
    expect(logEvents.find((logEvent) => logEvent.eventName === "user_activity.language_set")).toMatchObject({
      "user_activity.language": "fa",
    });
  });

  it("goes back to the Telegram language with auto, and confirms in it", async () => {
    const { replyTexts, storedLanguage, logEvents } = await sendLanguageCommand(" AUTO ", "fa");

    expect(storedLanguage).toBeNull();
    expect(replyTexts).toEqual([TRANSLATIONS.de.LANG_RESET_CONFIRMATION]);
    expect(logEvents.map((logEvent) => logEvent.eventName)).toContain("user_activity.language_reset");
  });

  it("lists the supported languages by their own names for a language it does not support", async () => {
    const { replyTexts, saveCount, logEvents } = await sendLanguageCommand("Klingon", "en");

    expect(replyTexts).toHaveLength(1);
    expect(replyTexts[0]).toMatch(/^I can't reply in that language yet\. I can reply in: English, فارسی, /);
    expect(replyTexts[0]).toContain("Deutsch");
    expect(saveCount).toBe(0);
    expect(logEvents.find((logEvent) => logEvent.eventName === "language_command.not_supported")).toMatchObject({
      "language_command.language_text": "Klingon",
    });
  });
});
