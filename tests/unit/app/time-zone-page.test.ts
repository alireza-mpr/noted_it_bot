import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TelegramSendResult } from "../../../src/adapters/telegram/telegram-client";
import {
  OPEN_TOKEN_TTL_MS,
  SAVE_TOKEN_TTL_MS,
  signTimeZoneLinkToken,
  verifyTimeZoneLinkToken,
  type TimeZoneLinkPurpose,
} from "../../../src/adapters/web/time-zone-link-token";
import {
  openTimeZonePage,
  saveTimeZoneFromPage,
  type TimeZonePageContext,
} from "../../../src/app/time-zone-page";
import { newUser } from "../../../src/domain/user/user";
import { BOT_MESSAGES } from "../../../src/i18n/bot-message";
import { TRANSLATIONS } from "../../../src/i18n/translation";
import { axiomEventsOf } from "../adapters/logging/axiom-events-of";
import { InMemoryUserRepository } from "./in-memory-user-repository";

const WEBHOOK_SECRET = "test-secret-value";
const NOW_MS = 1_800_000_000_000;
const USER_ID = 123456789;
const ALICE = { username: "alice", firstName: "Alice", lastName: null, telegramLanguageCode: "fa" };

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Returns what the routes need, with Alice stored, and a Telegram client that
// keeps what it sends. sendMessage can be replaced, e.g. to throw.
function setup(nowMs = NOW_MS, sendMessage?: () => Promise<TelegramSendResult>) {
  const userRepository = new InMemoryUserRepository([{ ...newUser(USER_ID, ALICE), version: 1 }]);
  const sentMessages: { chatId: number; text: string }[] = [];
  const timeZonePageContext: TimeZonePageContext = {
    webhookSecret: WEBHOOK_SECRET,
    userRepository,
    telegramClient: {
      sendMessage:
        sendMessage ??
        (async (chatId: number, text: string) => {
          sentMessages.push({ chatId, text });
          return { ok: true };
        }),
      sendDocument: async () => ({ ok: true }),
    },
    now: new Date(nowMs),
  };
  return { userRepository, sentMessages, timeZonePageContext };
}

// Returns a token for Alice in Persian, valid from NOW_MS for its purpose.
function tokenFor(purpose: TimeZoneLinkPurpose): Promise<string> {
  return signTimeZoneLinkToken(WEBHOOK_SECRET, {
    userId: USER_ID,
    username: "alice",
    firstName: "Alice",
    language: "fa",
    purpose,
    expiresAtMs: NOW_MS + (purpose === "open" ? OPEN_TOKEN_TTL_MS : SAVE_TOKEN_TTL_MS),
  });
}

// Returns a token whose signature was changed.
async function forgedTokenFor(purpose: TimeZoneLinkPurpose): Promise<string> {
  const [payloadText, signatureText] = (await tokenFor(purpose)).split(".");
  return `${payloadText}.${signatureText.slice(0, -2)}AA`;
}

function pageRequestOf(openToken: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://bot.example/tz?token=${encodeURIComponent(openToken)}`, { headers });
}

function saveRequestOf(body: unknown): Request {
  return new Request("https://bot.example/tz/save", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("openTimeZonePage", () => {
  it("serves the page for a valid link, with a new save token for the same user", async () => {
    const { timeZonePageContext } = setup();
    const openToken = await tokenFor("open");

    const response = await openTimeZonePage(pageRequestOf(openToken), timeZonePageContext);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const pageConfig = JSON.parse(html.match(/<script type="application\/json" id="cfg">(.*?)<\/script>/s)?.[1] ?? "");
    expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, pageConfig.token, "save", NOW_MS)).toEqual({
      ok: true,
      payload: {
        userId: USER_ID,
        username: "alice",
        firstName: "Alice",
        language: "fa",
        purpose: "save",
        expiresAtMs: NOW_MS + SAVE_TOKEN_TTL_MS,
      },
    });
    expect(html).toContain('<html lang="fa" dir="rtl">');
    expect(html).not.toContain(openToken);
  });

  it("logs the opened page with the user from the token", async () => {
    const { timeZonePageContext } = setup();
    const openToken = await tokenFor("open");

    const logEvents = await axiomEventsOf(() => openTimeZonePage(pageRequestOf(openToken), timeZonePageContext));

    expect(logEvents).toEqual([
      expect.objectContaining({
        eventName: "user_activity.time_zone_page_opened",
        "user.id": USER_ID,
        "user.name": "alice",
        "user.full_name": "Alice",
      }),
    ]);
  });

  it("refuses expired, forged, missing and wrong-purpose links with a 403 page, and touches no user", async () => {
    const tokenCases: [string, string, number][] = [
      ["expired", await tokenFor("open"), NOW_MS + OPEN_TOKEN_TTL_MS + 1],
      ["forged", await forgedTokenFor("open"), NOW_MS],
      ["missing", "", NOW_MS],
      ["nonsense", "not-a-token", NOW_MS],
      ["a save token", await tokenFor("save"), NOW_MS],
    ];
    for (const [caseName, openToken, nowMs] of tokenCases) {
      const { userRepository, timeZonePageContext } = setup(nowMs);

      const response = await openTimeZonePage(pageRequestOf(openToken), timeZonePageContext);

      expect(response.status, caseName).toBe(403);
      expect(await response.text(), caseName).toContain(BOT_MESSAGES.PAGE_EXPIRED);
      expect([userRepository.loadCount, userRepository.saveCount], caseName).toEqual([0, 0]);
    }
  });

  it("logs why a link is refused", async () => {
    const { timeZonePageContext } = setup(NOW_MS);
    const forgedToken = await forgedTokenFor("open");

    const logEvents = await axiomEventsOf(() => openTimeZonePage(pageRequestOf(forgedToken), timeZonePageContext));

    expect(logEvents).toEqual([
      expect.objectContaining({
        eventName: "time_zone_page.token_refused",
        "time_zone_page.token_purpose": "open",
        "time_zone_page.refusal_reason": "bad_signature",
      }),
    ]);
  });

  it("shows the expired message in the browser's language", async () => {
    const { timeZonePageContext } = setup();

    const response = await openTimeZonePage(
      pageRequestOf("bad", { "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8" }),
      timeZonePageContext,
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain(TRANSLATIONS.fa.PAGE_EXPIRED);
  });
});

describe("saveTimeZoneFromPage", () => {
  it("saves a valid time zone for the user in the token, confirms it in Telegram, and returns it", async () => {
    const { userRepository, sentMessages, timeZonePageContext } = setup();
    const saveToken = await tokenFor("save");

    const logEvents = await axiomEventsOf(async () => {
      const response = await saveTimeZoneFromPage(
        saveRequestOf({ token: saveToken, timezone: "asia/tehran" }),
        timeZonePageContext,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, timezone: "Asia/Tehran" });
    });

    expect(userRepository.storedUsers.get(USER_ID)?.settings.timeZone).toBe("Asia/Tehran");
    expect(sentMessages).toEqual([
      { chatId: USER_ID, text: TRANSLATIONS.fa.TZ_SET_CONFIRMATION?.replace("{0}", "Asia/Tehran") },
    ]);
    expect(logEvents.find((logEvent) => logEvent.eventName === "user_activity.time_zone_set")).toMatchObject({
      "user.id": USER_ID,
      "user_activity.time_zone": "Asia/Tehran",
      "user_activity.via": "page",
    });
  });

  it("takes the user only from the token, never from the body", async () => {
    const { userRepository, timeZonePageContext } = setup();
    const saveToken = await tokenFor("save");

    await saveTimeZoneFromPage(
      saveRequestOf({ token: saveToken, timezone: "Europe/Paris", uid: 999, userId: 999 }),
      timeZonePageContext,
    );

    expect(userRepository.storedUsers.get(USER_ID)?.settings.timeZone).toBe("Europe/Paris");
    expect(userRepository.storedUsers.has(999)).toBe(false);
  });

  it("refuses time zones that are not allowed or not real, and saves and sends nothing", async () => {
    const saveToken = await tokenFor("save");
    for (const timeZoneName of ["Mars/Olympus", "Iran", "Melbourne", "EST", "", "'; DROP TABLE users;--", "A/".repeat(50)]) {
      const { userRepository, sentMessages, timeZonePageContext } = setup();

      const response = await saveTimeZoneFromPage(
        saveRequestOf({ token: saveToken, timezone: timeZoneName }),
        timeZonePageContext,
      );

      expect(response.status, timeZoneName).toBe(400);
      expect(await response.json(), timeZoneName).toEqual({ ok: false, error: "invalid_timezone" });
      expect(userRepository.saveCount, timeZoneName).toBe(0);
      expect(sentMessages, timeZoneName).toEqual([]);
    }
  });

  it("refuses an open token, an expired token and a forged token with 403, and saves and sends nothing", async () => {
    const tokenCases: [string, string, number][] = [
      ["an open token", await tokenFor("open"), NOW_MS],
      ["an expired save token", await tokenFor("save"), NOW_MS + SAVE_TOKEN_TTL_MS + 1],
      ["a forged token", await forgedTokenFor("save"), NOW_MS],
    ];
    for (const [caseName, saveToken, nowMs] of tokenCases) {
      const { userRepository, sentMessages, timeZonePageContext } = setup(nowMs);

      const response = await saveTimeZoneFromPage(
        saveRequestOf({ token: saveToken, timezone: "Asia/Tehran" }),
        timeZonePageContext,
      );

      expect(response.status, caseName).toBe(403);
      expect(await response.json(), caseName).toEqual({ ok: false, error: "expired" });
      expect(userRepository.saveCount, caseName).toBe(0);
      expect(sentMessages, caseName).toEqual([]);
    }
  });

  it("can save for the whole ten minutes, though the link that opened the page expired after one", async () => {
    const { userRepository, timeZonePageContext } = setup(NOW_MS + SAVE_TOKEN_TTL_MS);
    const saveToken = await tokenFor("save");

    const response = await saveTimeZoneFromPage(
      saveRequestOf({ token: saveToken, timezone: "Asia/Tehran" }),
      timeZonePageContext,
    );

    expect(response.status).toBe(200);
    expect(userRepository.saveCount).toBe(1);
  });

  it("refuses bad bodies, and touches no user", async () => {
    const saveToken = await tokenFor("save");
    const bodyCases: [unknown, number][] = [
      ["not json", 400],
      ["null", 400],
      [{ token: saveToken }, 400],
      [{ timezone: "Asia/Tehran" }, 400],
      [{ token: 5, timezone: "Asia/Tehran" }, 400],
      [{ token: saveToken, timezone: ["Asia/Tehran"] }, 400],
      [{ token: saveToken, timezone: "x".repeat(5000) }, 413],
    ];
    for (const [body, httpStatus] of bodyCases) {
      const { userRepository, timeZonePageContext } = setup();

      const response = await saveTimeZoneFromPage(saveRequestOf(body), timeZonePageContext);

      expect(response.status, JSON.stringify(body).slice(0, 40)).toBe(httpStatus);
      expect([userRepository.loadCount, userRepository.saveCount]).toEqual([0, 0]);
    }
  });

  it("refuses a user who is not stored", async () => {
    const { userRepository, timeZonePageContext } = setup();
    userRepository.storedUsers.clear();
    const saveToken = await tokenFor("save");

    const response = await saveTimeZoneFromPage(
      saveRequestOf({ token: saveToken, timezone: "Asia/Tehran" }),
      timeZonePageContext,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "unknown_user" });
    expect(userRepository.saveCount).toBe(0);
  });

  it("still saves when the Telegram confirmation cannot be sent", async () => {
    const { userRepository, timeZonePageContext } = setup(NOW_MS, async () => {
      throw new Error("telegram down");
    });
    const saveToken = await tokenFor("save");

    const response = await saveTimeZoneFromPage(
      saveRequestOf({ token: saveToken, timezone: "Asia/Tehran" }),
      timeZonePageContext,
    );

    expect(response.status).toBe(200);
    expect(userRepository.storedUsers.get(USER_ID)?.settings.timeZone).toBe("Asia/Tehran");
  });
});
