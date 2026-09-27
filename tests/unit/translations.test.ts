import { beforeAll, describe, expect, it, vi } from "vitest";
import { MESSAGES, type MessageId } from "../../src/legacy/interactiveMessages/messages";
import { SUPPORTED_LANGUAGES } from "../../src/legacy/translation/language";
import { translateStatic } from "../../src/legacy/translation/translate";
import { TRANSLATIONS } from "../../src/legacy/translation/translations";

const IDS = Object.keys(MESSAGES) as MessageId[];
const LANGUAGES = SUPPORTED_LANGUAGES.filter((lang) => lang !== "en");

const placeholders = (s: string) => (s.match(/\{+\d+\}+/g) ?? []).sort();
const htmlTags = (s: string) => (s.match(/<\/?[a-zA-Z]+[^>]*>/g) ?? []).sort();
const emoji = (s: string) => (s.match(/[\u{1F300}-\u{1FAFF}☀-➿⬀-⯿⌀-⏿]/gu) ?? []).sort();
const commands = (s: string) => (s.match(/\/(?:lang|tz)(?![A-Za-z])/g) ?? []).sort();

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

describe("static translations", () => {
  it("covers exactly the supported languages", () => {
    expect(Object.keys(TRANSLATIONS).sort()).toEqual([...LANGUAGES].sort());
  });

  describe.each(LANGUAGES)("%s", (lang) => {
    const table = TRANSLATIONS[lang];

    it("translates every message in the catalog", () => {
      const missing = IDS.filter((id) => !table[id]?.trim());
      expect(missing).toEqual([]);
    });

    it("has no stale entries for message ids that no longer exist", () => {
      const stale = Object.keys(table).filter((id) => !(id in MESSAGES));
      expect(stale).toEqual([]);
    });

    it("keeps placeholders, HTML tags, emoji and command names intact", () => {
      for (const id of IDS) {
        const english = MESSAGES[id];
        const translated = table[id] ?? "";
        expect(placeholders(translated), `placeholders in: ${id}`).toEqual(placeholders(english));
        expect(htmlTags(translated), `tags in: ${id}`).toEqual(htmlTags(english));
        expect(emoji(translated), `emoji in: ${id}`).toEqual(emoji(english));
        expect(commands(translated), `commands in: ${id}`).toEqual(commands(english));
      }
    });

    it("actually translates (nothing is left identical to the English)", () => {
      const untouched = IDS.filter((id) => table[id] === MESSAGES[id] && id !== "LINK_LABEL");
      expect(untouched).toEqual([]);
    });
  });
});

describe("translateStatic", () => {
  it("serves catalog messages from the static files", () => {
    expect(translateStatic("NO_TEXT_MESSAGE", "fa")).toBe(TRANSLATIONS.fa["NO_TEXT_MESSAGE"]);
    expect(translateStatic("START_MESSAGE", "de")).toBe(TRANSLATIONS.de["START_MESSAGE"]);
  });

  it("maps regional and legacy tags to the supported language", () => {
    expect(translateStatic("NO_TEXT_MESSAGE", "pt-BR")).toBe(TRANSLATIONS.pt["NO_TEXT_MESSAGE"]);
    expect(translateStatic("NO_TEXT_MESSAGE", "zh_Hans")).toBe(TRANSLATIONS.zh["NO_TEXT_MESSAGE"]);
  });

  it("returns English for English, no language or an unsupported one", () => {
    for (const lang of ["en", undefined, "xx", "tlh", "he"]) {
      expect(translateStatic("NO_TEXT_MESSAGE", lang)).toBe(MESSAGES.NO_TEXT_MESSAGE);
    }
  });
});
