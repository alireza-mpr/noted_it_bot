import { beforeAll, describe, expect, it, vi } from "vitest";
import { TZ_BUTTON_LABEL, TZ_LINK_MESSAGE, TZ_SET_CONFIRMATION } from "../../src/interactiveMessages/messages";
import { isTzCommand, tzCommandHandler } from "../../src/telegram/commands/tzCommandHandler";
import type { Replier } from "../../src/telegram/replier";
import type { TelegramMessage } from "../../src/telegram/telegramTypes";
import { canonicalTimezone } from "../../src/time/canonicalTimezone";
import { OPEN_TOKEN_TTL_MS, verifyTzToken } from "../../src/web/tzToken";
import { fakeD1 } from "./fakeD1";

const SECRET = "test-secret-value";
const NOW = 1_800_000_000_000;
const ORIGIN = "https://bot.example";

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

describe("canonicalTimezone", () => {
  it("accepts IANA names and normalises their case", () => {
    expect(canonicalTimezone("Australia/Melbourne")).toBe("Australia/Melbourne");
    expect(canonicalTimezone("asia/tehran")).toBe("Asia/Tehran");
    expect(canonicalTimezone("America/Argentina/Buenos_Aires")).not.toBeNull();
    expect(canonicalTimezone("  Europe/Paris ")).toBe("Europe/Paris");
    expect(canonicalTimezone("utc")).toBe("UTC");
  });

  it("rejects places, invented zones and legacy abbreviations", () => {
    for (const bad of ["Melbourne", "Iran", "Mars/Olympus", "EST", "PST8PDT", "Asia/", "/Tehran", "", "Asia/Tehran; DROP"]) {
      expect(canonicalTimezone(bad), bad).toBeNull();
    }
  });
});

describe("isTzCommand", () => {
  it("matches /tz with or without an argument, and the @bot form", () => {
    for (const text of ["/tz", "/tz Melbourne", "/tz   Iran", "/tz@noted_it_bot Paris", "/tz\nTokyo"]) {
      expect(isTzCommand(text), text).toBe(true);
    }
  });

  it("does not match other text or commands", () => {
    for (const text of ["/tzx", "/timezone", "/lang fa", "tz Melbourne", "hello /tz", "", undefined]) {
      expect(isTzCommand(text), String(text)).toBe(false);
    }
  });
});

function setup(text: string, lang = "fa") {
  const d1 = fakeD1();
  const say = vi.fn(async (_template: string, _value?: string) => {});
  const sayWithLink = vi.fn(async (_template: string, _button: string, _url: string) => {});
  const replier = { lang, say, sayWithLink } as unknown as Replier;
  const message = { text, chat: { id: 42 }, from: { id: 42 } } as TelegramMessage;
  const env = { WEBHOOK_SECRET: SECRET, USAGE_DB: d1.db };
  return { d1, say, sayWithLink, replier, message, env };
}

describe("tzCommandHandler", () => {
  it("replies to a bare /tz with a link button whose token opens for one minute for this user and language", async () => {
    const { env, message, replier, sayWithLink, say, d1 } = setup("/tz");
    await tzCommandHandler(env, message, replier, ORIGIN, NOW);

    expect(say).not.toHaveBeenCalled();
    expect(d1.statements).toHaveLength(0);
    expect(sayWithLink).toHaveBeenCalledTimes(1);
    const [template, button, url] = sayWithLink.mock.calls[0];
    expect([template, button]).toEqual([TZ_LINK_MESSAGE, TZ_BUTTON_LABEL]);
    expect(url.startsWith(`${ORIGIN}/tz?token=`)).toBe(true);

    const token = decodeURIComponent(url.slice(`${ORIGIN}/tz?token=`.length));
    expect(await verifyTzToken(SECRET, token, "open", NOW)).toEqual({
      ok: true,
      payload: { uid: 42, lang: "fa", purpose: "open", exp: NOW + OPEN_TOKEN_TTL_MS },
    });
    expect((await verifyTzToken(SECRET, token, "open", NOW + OPEN_TOKEN_TTL_MS + 1)).ok).toBe(false);
  });

  it("sends the link for a city, a country or gibberish too, and never stores or calls a model", async () => {
    for (const text of ["/tz Melbourne", "/tz Iran", "/tz asdf qwer", "/tz 19:54", "/tz Mars/Olympus"]) {
      const { env, message, replier, sayWithLink, d1 } = setup(text);
      await tzCommandHandler(env, message, replier, ORIGIN, NOW);
      expect(sayWithLink, text).toHaveBeenCalledTimes(1);
      expect(d1.statements, text).toHaveLength(0);
    }
  });

  it("applies an exact zone name directly, normalised, and confirms it", async () => {
    for (const text of ["/tz asia/tehran", "/tz@noted_it_bot Asia/Tehran"]) {
      const { env, message, replier, sayWithLink, say, d1 } = setup(text);
      await tzCommandHandler(env, message, replier, ORIGIN, NOW);

      expect(sayWithLink, text).not.toHaveBeenCalled();
      expect(d1.writes(), text).toHaveLength(1);
      expect(d1.writes()[0].args, text).toEqual([42, "Asia/Tehran"]);
      expect(say.mock.calls[0], text).toEqual([TZ_SET_CONFIRMATION, "Asia/Tehran"]);
    }
  });
});
