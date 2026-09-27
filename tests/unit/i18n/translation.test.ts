import { describe, expect, it } from "vitest";
import { BOT_MESSAGES, type BotMessageId } from "../../../src/i18n/bot-message";
import { SUPPORTED_LANGUAGES } from "../../../src/i18n/supported-language";
import { TRANSLATIONS, translate } from "../../../src/i18n/translation";

const BOT_MESSAGE_IDS = Object.keys(BOT_MESSAGES) as BotMessageId[];
const TRANSLATED_LANGUAGES = SUPPORTED_LANGUAGES.filter((language) => language !== "en");

const placeholdersOf = (text: string) => (text.match(/\{+\d+\}+/g) ?? []).sort();
const htmlTagsOf = (text: string) => (text.match(/<\/?[a-zA-Z]+[^>]*>/g) ?? []).sort();
const emojiOf = (text: string) => (text.match(/[\u{1F300}-\u{1FAFF}☀-➿⬀-⯿⌀-⏿]/gu) ?? []).sort();
const commandsOf = (text: string) => (text.match(/\/(?:lang|tz)(?![A-Za-z])/g) ?? []).sort();

describe("translations", () => {
  it("cover exactly the supported languages other than English", () => {
    expect(Object.keys(TRANSLATIONS).sort()).toEqual([...TRANSLATED_LANGUAGES].sort());
  });

  describe.each(TRANSLATED_LANGUAGES)("%s", (language) => {
    const translations = TRANSLATIONS[language];

    it("translates every bot message", () => {
      expect(BOT_MESSAGE_IDS.filter((botMessageId) => !translations[botMessageId]?.trim())).toEqual([]);
    });

    it("has no ids that are not bot messages", () => {
      expect(Object.keys(translations).filter((botMessageId) => !(botMessageId in BOT_MESSAGES))).toEqual([]);
    });

    it("keeps placeholders, HTML tags, emoji and command names", () => {
      for (const botMessageId of BOT_MESSAGE_IDS) {
        const englishText = BOT_MESSAGES[botMessageId];
        const translatedText = translations[botMessageId] ?? "";
        expect(placeholdersOf(translatedText), `placeholders in ${botMessageId}`).toEqual(placeholdersOf(englishText));
        expect(htmlTagsOf(translatedText), `tags in ${botMessageId}`).toEqual(htmlTagsOf(englishText));
        expect(emojiOf(translatedText), `emoji in ${botMessageId}`).toEqual(emojiOf(englishText));
        expect(commandsOf(translatedText), `commands in ${botMessageId}`).toEqual(commandsOf(englishText));
      }
    });

    it("really translates: no text is the same as the English", () => {
      const untranslatedIds = BOT_MESSAGE_IDS.filter(
        (botMessageId) => translations[botMessageId] === BOT_MESSAGES[botMessageId] && botMessageId !== "LINK_LABEL",
      );
      expect(untranslatedIds).toEqual([]);
    });
  });
});

describe("translate", () => {
  it("returns the stored translation", () => {
    expect(translate("NO_TEXT_MESSAGE", "fa")).toBe(TRANSLATIONS.fa.NO_TEXT_MESSAGE);
    expect(translate("START_MESSAGE", "de")).toBe(TRANSLATIONS.de.START_MESSAGE);
  });

  it("returns the English text for English", () => {
    expect(translate("NO_TEXT_MESSAGE", "en")).toBe(BOT_MESSAGES.NO_TEXT_MESSAGE);
  });
});
