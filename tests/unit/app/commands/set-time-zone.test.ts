import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { OPEN_TOKEN_TTL_MS, verifyTimeZoneLinkToken } from "../../../../src/adapters/web/time-zone-link-token";
import { setTimeZone } from "../../../../src/app/commands/set-time-zone";
import { newUser, type User } from "../../../../src/domain/user/user";
import { TRANSLATIONS } from "../../../../src/i18n/translation";
import { axiomEventsOf } from "../../adapters/logging/axiom-events-of";
import { FakeReplier } from "../fake-replier";
import { InMemoryUserRepository } from "../in-memory-user-repository";

const WEBHOOK_SECRET = "test-secret-value";
const NOW = new Date(1_800_000_000_000);
const WORKER_ORIGIN = "https://bot.example";
const USER_ID = 42;
const ALICE = { username: "alice", firstName: "Alice", lastName: "Smith", telegramLanguageCode: "fa" };

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function storedAlice(): User {
  return { ...newUser(USER_ID, ALICE), version: 1 };
}

// Runs /tz for Alice, whose reply language is Persian. Returns the replies,
// the time zone stored after the command, the saves, and the log events.
async function sendTimeZoneCommand(timeZoneText: string | null) {
  const userRepository = new InMemoryUserRepository([storedAlice()]);
  const fakeReplier = new FakeReplier();
  const logEvents = await axiomEventsOf(() =>
    setTimeZone(storedAlice(), timeZoneText, {
      userRepository,
      replier: fakeReplier,
      language: "fa",
      webhookSecret: WEBHOOK_SECRET,
      workerOrigin: WORKER_ORIGIN,
      now: NOW,
    }),
  );
  return {
    fakeReplier,
    storedTimeZone: userRepository.storedUsers.get(USER_ID)?.settings.timeZone,
    saveCount: userRepository.saveCount,
    logEvents,
  };
}

describe("setTimeZone", () => {
  it("replies to a bare /tz with a link button whose token opens for one minute, for this user and language", async () => {
    const { fakeReplier, saveCount, logEvents } = await sendTimeZoneCommand(null);

    expect(fakeReplier.texts).toEqual([TRANSLATIONS.fa.TZ_LINK_MESSAGE]);
    expect(fakeReplier.linkButtons).toHaveLength(1);
    const { label, url } = fakeReplier.linkButtons[0];
    expect(label).toBe(TRANSLATIONS.fa.TZ_BUTTON_LABEL);
    expect(url.startsWith(`${WORKER_ORIGIN}/tz?token=`)).toBe(true);
    const openToken = url.slice(`${WORKER_ORIGIN}/tz?token=`.length);
    expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, openToken, "open", NOW.getTime())).toEqual({
      ok: true,
      payload: {
        userId: USER_ID,
        username: "alice",
        firstName: "Alice",
        language: "fa",
        purpose: "open",
        expiresAtMs: NOW.getTime() + OPEN_TOKEN_TTL_MS,
      },
    });
    expect(saveCount).toBe(0);
    expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual(["user_activity.time_zone_link_sent"]);
  });

  it("sends the link for a city, a country or nonsense too, and saves nothing", async () => {
    for (const timeZoneText of ["Melbourne", "Iran", "asdf qwer", "19:54", "Mars/Olympus"]) {
      const { fakeReplier, saveCount } = await sendTimeZoneCommand(timeZoneText);

      expect(fakeReplier.linkButtons, timeZoneText).toHaveLength(1);
      expect(saveCount, timeZoneText).toBe(0);
    }
  });

  it("saves an exact time zone name in its standard spelling, and confirms it", async () => {
    const { fakeReplier, storedTimeZone, logEvents } = await sendTimeZoneCommand("asia/tehran");

    expect(storedTimeZone).toBe("Asia/Tehran");
    expect(fakeReplier.linkButtons).toEqual([]);
    expect(fakeReplier.texts).toEqual([TRANSLATIONS.fa.TZ_SET_CONFIRMATION?.replace("{0}", "Asia/Tehran")]);
    expect(logEvents.find((logEvent) => logEvent.eventName === "user_activity.time_zone_set")).toMatchObject({
      "user_activity.time_zone": "Asia/Tehran",
      "user_activity.via": "command",
    });
  });
});
