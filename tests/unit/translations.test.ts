import { beforeAll, describe, expect, it, vi } from "vitest";
import * as messages from "../../src/interactiveMessages/messages";
import type { Router } from "../../src/router/router";
import { SUPPORTED_LANGUAGES } from "../../src/translation/language";
import { translateText } from "../../src/translation/translate";
import { TRANSLATIONS } from "../../src/translation/translations";

const CATALOG: string[] = Object.values(messages).filter((value) => typeof value === "string");
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
      const missing = CATALOG.filter((english) => !table[english]?.trim());
      expect(missing).toEqual([]);
    });

    it("has no stale entries for English text that no longer exists", () => {
      const stale = Object.keys(table).filter((english) => !CATALOG.includes(english));
      expect(stale).toEqual([]);
    });

    it("keeps placeholders, HTML tags, emoji and command names intact", () => {
      for (const english of CATALOG) {
        const translated = table[english];
        expect(placeholders(translated), `placeholders in: ${english.slice(0, 40)}`).toEqual(placeholders(english));
        expect(htmlTags(translated), `tags in: ${english.slice(0, 40)}`).toEqual(htmlTags(english));
        expect(emoji(translated), `emoji in: ${english.slice(0, 40)}`).toEqual(emoji(english));
        expect(commands(translated), `commands in: ${english.slice(0, 40)}`).toEqual(commands(english));
      }
    });

    it("actually translates (nothing is left identical to the English)", () => {
      const untouched = CATALOG.filter((english) => table[english] === english && english !== messages.LINK_LABEL);
      expect(untouched).toEqual([]);
    });
  });
});

function unusedRouter() {
  const generate = vi.fn(async (_request: unknown) => ({ result: "ok", model: "m", text: "should not be used", totalTokens: 1 }));
  return { router: { generate } as unknown as Router, generate };
}

function unusedEnv() {
  const get = vi.fn(async (_key: string) => null);
  const put = vi.fn(async (_key: string, _value: string) => {});
  return { env: { I18N: { get, put } as unknown as KVNamespace }, get, put };
}

describe("translateText", () => {
  it("serves catalog messages from the static files without touching the model or KV", async () => {
    const { router, generate } = unusedRouter();
    const { env, get, put } = unusedEnv();

    expect(await translateText(env, router, messages.NO_TEXT_MESSAGE, "fa")).toBe(TRANSLATIONS.fa[messages.NO_TEXT_MESSAGE]);
    expect(await translateText(env, router, messages.START_MESSAGE, "de")).toBe(TRANSLATIONS.de[messages.START_MESSAGE]);

    expect(generate).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("maps regional and legacy tags to the supported language", async () => {
    const { router } = unusedRouter();
    const { env } = unusedEnv();
    expect(await translateText(env, router, messages.NO_TEXT_MESSAGE, "pt-BR")).toBe(TRANSLATIONS.pt[messages.NO_TEXT_MESSAGE]);
    expect(await translateText(env, router, messages.NO_TEXT_MESSAGE, "zh_Hans")).toBe(TRANSLATIONS.zh[messages.NO_TEXT_MESSAGE]);
  });

  it("returns English for English or no language, with no calls", async () => {
    const { router, generate } = unusedRouter();
    const { env, get } = unusedEnv();
    expect(await translateText(env, router, messages.NO_TEXT_MESSAGE, "en")).toBe(messages.NO_TEXT_MESSAGE);
    expect(await translateText(env, router, messages.NO_TEXT_MESSAGE, undefined)).toBe(messages.NO_TEXT_MESSAGE);
    expect(generate).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("never calls a model for an unsupported language, however many are tried", async () => {
    const { router, generate } = unusedRouter();
    const { env, get, put } = unusedEnv();

    for (const lang of ["xx", "zz", "tlh", "aa", "kl", "uz", "he"]) {
      expect(await translateText(env, router, "Repeats every 2 weeks", lang)).toBe("Repeats every 2 weeks");
      expect(await translateText(env, router, messages.NO_TEXT_MESSAGE, lang)).toBe(messages.NO_TEXT_MESSAGE);
    }

    expect(generate).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("still translates an uncatalogued string, such as a recurrence sentence, in a supported language", async () => {
    const generate = vi.fn(async (_request: unknown) => ({ result: "ok", model: "m", text: "  تکرار می‌شود  ", totalTokens: 1 }));
    const { env, put } = unusedEnv();

    const result = await translateText(env, { generate } as unknown as Router, "Repeats every 2 weeks", "fa");

    expect(result).toBe("تکرار می‌شود");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
  });
});
