import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { EventAnswer, RecurrenceAnswer } from "../../../src/adapters/models/extraction/event-answer-schema";
import type { ModelFailure, ModelRequest, ModelResult } from "../../../src/adapters/models/model-result";
import { GEMINI_MODELS } from "../../../src/adapters/models/providers/model-list";
import {
  createEventFromMessage,
  type EventRequestContext,
} from "../../../src/app/create-event-from-message";
import { QUOTA_RESET_AFTER_MS } from "../../../src/domain/quota/daily-quota-rule";
import type { QuotaUsage } from "../../../src/domain/quota/quota-usage";
import { newUser, type User } from "../../../src/domain/user/user";
import { timeZoneNamed, type IanaTimeZone } from "../../../src/generic/date-time/time-zone";
import type { SupportedLanguage } from "../../../src/domain/user/supported-language";
import { translate } from "../../../src/i18n/translation";
import { axiomEventsOf } from "../adapters/logging/axiom-events-of";
import { modelAnswerOf } from "../adapters/models/model-answer-of";
import { FakeReplier } from "./fake-replier";
import { InMemoryUserRepository } from "./in-memory-user-repository";

const USER_ID = 42;
const DAILY_QUOTA = 5;
const WAIT_MS = (2 * 60 + 5) * 60_000;
const ALICE = { username: "alice", firstName: "Alice", lastName: null, telegramLanguageCode: "en" };
const NO_MODEL: ModelFailure = {
  ok: false,
  kind: "rate-limited",
  limitWindow: null,
  retryAfterSeconds: null,
  httpStatus: null,
  detail: "no model is under its limits",
};

// "Game night, Saturday 26 September, 6 to 9:30pm", as a user forwarded it.
const GAME_NIGHT_MESSAGE =
  "🎲 گیم‌نایت شنبه ۲۶ سپتامبر\n\n در\n Notting Hill Neighbourhood House \n\n🕕 ساعت ۶:۰۰ تا ۹:۳۰ شب";
// The model's answer to it, exactly as a model returned it.
const GAME_NIGHT_ANSWER =
  '{"title":"گیم‌نایت","calendar":"Gregorian","date_kind":"absolute","year":null,"month":9,"day":26,"start_time":"18:00","end_time":"21:30","timezone_hint":null,"location":"Notting Hill Neighbourhood House","recurrence":null,"confidence":1}';

// A 20:00 one-off event on 23 Sep 2030, with no time zone.
function answerWith(overrides: Partial<EventAnswer> = {}): string {
  return JSON.stringify({
    title: "Event",
    calendar: "gregorian",
    date_kind: "absolute",
    year: 2030,
    month: 9,
    day: 23,
    start_time: "20:00",
    end_time: null,
    timezone_hint: null,
    location: null,
    recurrence: null,
    confidence: 0.95,
    ...overrides,
  });
}

// Represents a router that gives a fixed result, after the first try.
class FakeRouter {
  readonly modelRequests: ModelRequest[] = [];

  constructor(private readonly modelResult: ModelResult) {}

  async ask(modelRequest: ModelRequest, beforeFirstTry: () => Promise<void> = async () => {}): Promise<ModelResult> {
    this.modelRequests.push(modelRequest);
    await beforeFirstTry();
    return this.modelResult;
  }
}

interface TestSetup {
  modelResult?: ModelResult;
  // null means the daily quota is off.
  remainingQuota?: number | null;
  isDailyQuotaShown?: boolean;
  language?: SupportedLanguage;
  userTimeZone?: IanaTimeZone | null;
  now?: Date;
}

// Returns the quota usage of a user with this many units left. A user with
// none left can try again WAIT_MS after now.
function quotaUsageWith(remainingQuota: number, now: Date): QuotaUsage {
  return remainingQuota === DAILY_QUOTA
    ? { kind: "unused" }
    : { kind: "used", remainingQuota, lastUsedAt: new Date(now.getTime() + WAIT_MS - QUOTA_RESET_AFTER_MS) };
}

// Runs one message through the use case, and returns what it sent and used.
async function sendMessage(messageText: string | null, testSetup: TestSetup = {}) {
  const now = testSetup.now ?? new Date("2026-09-28T02:00:00Z");
  const remainingQuota = testSetup.remainingQuota === undefined ? DAILY_QUOTA : testSetup.remainingQuota;
  const storedUser: User = {
    ...newUser(USER_ID, ALICE),
    settings: { language: null, timeZone: testSetup.userTimeZone ?? null },
    quotaUsage: quotaUsageWith(remainingQuota ?? DAILY_QUOTA, now),
    version: 1,
  };
  const fakeRouter = new FakeRouter(testSetup.modelResult ?? { ...modelAnswerOf(GEMINI_MODELS[0]), text: answerWith() });
  const fakeReplier = new FakeReplier();
  const userRepository = new InMemoryUserRepository([storedUser]);
  const eventRequestContext: EventRequestContext = {
    router: fakeRouter,
    userRepository,
    dailyQuota: remainingQuota === null ? { kind: "off" } : { kind: "limited", unitsPerDay: DAILY_QUOTA },
    isDailyQuotaShown: testSetup.isDailyQuotaShown ?? true,
    replier: fakeReplier,
    language: testSetup.language ?? "en",
    now,
  };
  await createEventFromMessage({ user: storedUser, messageText }, eventRequestContext);
  return { fakeRouter, fakeReplier, userRepository, storedQuotaUsage: () => userRepository.storedUsers.get(USER_ID)?.quotaUsage };
}

// Returns the calendar file and caption sent for a model answer.
async function sentCalendarFileOf(answerText: string, testSetup: TestSetup = {}) {
  const { fakeReplier } = await sendMessage("text", {
    modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: answerText },
    ...testSetup,
  });
  expect(fakeReplier.calendarFiles).toHaveLength(1);
  const { calendarFile, htmlCaption } = fakeReplier.calendarFiles[0];
  return { icsContent: calendarFile.content, htmlCaption };
}

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the game night message, forwarded on 27 September 2026", () => {
  const farsiSetup = { language: "fa" as const, now: new Date("2026-09-27T02:00:00Z") };
  const fa = (botMessageId: Parameters<typeof translate>[0]) => translate(botMessageId, "fa");

  it("is 26 Sep 2026, not 2027, at the written floating 18:00, and says it has passed", async () => {
    const { icsContent, htmlCaption } = await sentCalendarFileOf(GAME_NIGHT_ANSWER, farsiSetup);

    // No time zone in the message and none set with /tz: floating 18:00, which
    // a Melbourne calendar shows as 18:00 on the 26th.
    expect(icsContent).toContain("DTSTART:20260926T180000");
    expect(icsContent).toContain("DTEND:20260926T213000");
    expect(htmlCaption).toContain(fa("PAST_EVENT_NOTE"));
    expect(htmlCaption).toContain(fa("TZ_FLOATING_NOTE"));
    expect(htmlCaption).not.toContain("🤔 ");
  });

  it("with the written weekday (SA): the same date, and no wrong weekday note", async () => {
    const withWeekday = GAME_NIGHT_ANSWER.replace('"day":26,', '"day":26,"weekday":"SA",');
    const { icsContent, htmlCaption } = await sentCalendarFileOf(withWeekday, farsiSetup);

    expect(icsContent).toContain("DTSTART:20260926T180000");
    expect(htmlCaption).not.toContain("🤔 ");
  });

  it("a week before, it is a future event with no past date note", async () => {
    const { htmlCaption } = await sentCalendarFileOf(GAME_NIGHT_ANSWER, { ...farsiSetup, now: new Date("2026-09-19T02:00:00Z") });

    expect(htmlCaption).not.toContain(fa("PAST_EVENT_NOTE"));
  });

  it("sends the message itself to the model", async () => {
    const { fakeRouter } = await sendMessage(GAME_NIGHT_MESSAGE, {
      modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: GAME_NIGHT_ANSWER },
    });

    expect(fakeRouter.modelRequests[0].userPrompt).toBe(GAME_NIGHT_MESSAGE);
  });
});

describe("the event time zone", () => {
  it("uses the message's time zone over the user's, with no note", async () => {
    const { icsContent, htmlCaption } = await sentCalendarFileOf(answerWith({ timezone_hint: "Asia/Tehran" }), {
      userTimeZone: timeZoneNamed("Europe/London"),
    });

    expect(icsContent).toContain("DTSTART;TZID=Asia/Tehran:20300923T200000");
    expect(htmlCaption).not.toContain("🌎");
  });

  it("uses the user's /tz time zone when the message gives none, and says so", async () => {
    const { icsContent, htmlCaption } = await sentCalendarFileOf(answerWith(), { userTimeZone: timeZoneNamed("Europe/London") });

    expect(icsContent).toContain("DTSTART;TZID=Europe/London:20300923T200000");
    expect(htmlCaption).toContain("so I used yours, Europe/London. To change it, send /tz.");
  });

  it("writes floating times when neither gives one, and points to /tz", async () => {
    const { icsContent, htmlCaption } = await sentCalendarFileOf(answerWith());

    expect(icsContent).toContain("DTSTART:20300923T200000");
    expect(icsContent).toContain("DTEND:20300923T210000");
    expect(icsContent).not.toContain("TZID");
    expect(htmlCaption).toContain("so the time is as written, in your calendar's own time zone. To set yours, send /tz.");
  });

  it("ends a floating repeat in local time too", async () => {
    const weeklyUntil: RecurrenceAnswer = {
      frequency: "weekly",
      interval: 1,
      weekdays: ["MO"],
      ordinal: null,
      month_day: null,
      end_kind: "until",
      until_year: 2030,
      until_month: 11,
      until_day: 25,
      count: null,
    };
    const { icsContent } = await sentCalendarFileOf(answerWith({ recurrence: weeklyUntil }));

    expect(icsContent).toContain("UNTIL=20301125T235900");
    expect(icsContent).not.toContain("UNTIL=20301125T235900Z");
  });

  it("says so when the date has already passed, and not for a future date", async () => {
    expect((await sentCalendarFileOf(answerWith({ year: 2020, timezone_hint: "UTC" }))).htmlCaption).toContain(
      "this date has already passed",
    );
    expect((await sentCalendarFileOf(answerWith({ timezone_hint: "UTC" }))).htmlCaption).not.toContain("💡");
  });

  it("says when the written weekday does not match the date", async () => {
    // 20 Jan 2030 is a Sunday.
    const { htmlCaption } = await sentCalendarFileOf(answerWith({ month: 1, day: 20, weekday: "MO", timezone_hint: "UTC" }));

    expect(htmlCaption).toContain("The message says Monday, but Jan 20, 2030 is a Sunday. Check the date.");
  });

  it("adds no time zone note to an all-day event", async () => {
    const { htmlCaption } = await sentCalendarFileOf(answerWith({ start_time: null }));

    expect(htmlCaption).not.toContain("🌎");
  });
});

describe("createEventFromMessage", () => {
  it("tells the user before the model is tried, then sends the file with the quota line", async () => {
    const { fakeReplier } = await sendMessage("text");

    expect(fakeReplier.texts).toEqual([translate("EXTRACTING_EVENT_MESSAGE", "en")]);
    expect(fakeReplier.calendarFiles[0].htmlCaption).toContain("4");
  });

  it("answers a message with no text, without using quota or a model", async () => {
    const { fakeReplier, fakeRouter, userRepository } = await sendMessage(null, { remainingQuota: 0 });

    expect(fakeReplier.texts).toEqual([translate("NO_TEXT_MESSAGE", "en")]);
    expect(fakeRouter.modelRequests).toEqual([]);
    expect(userRepository.saveCount).toBe(0);
  });

  it("refuses a used-up user with no read and no write", async () => {
    const { userRepository } = await sendMessage("text", { remainingQuota: 0 });

    expect([userRepository.loadCount, userRepository.saveCount]).toEqual([0, 0]);
  });

  it("says when the daily quota is used up, with the wait time in the reply language", async () => {
    const { fakeReplier, fakeRouter } = await sendMessage("text", { remainingQuota: 0, language: "fa" });

    expect(fakeRouter.modelRequests).toEqual([]);
    expect(fakeReplier.texts).toHaveLength(1);
    expect(fakeReplier.texts[0]).toMatch(/۲ ساعت.*۵ دقیقه/);
    expect(fakeReplier.texts[0]).not.toMatch(/[0-9]/);
  });

  it("gives the quota unit back when no model answers", async () => {
    const { fakeReplier, userRepository, storedQuotaUsage } = await sendMessage("text", { modelResult: NO_MODEL });

    expect(fakeReplier.texts).toContain(translate("NO_AVAILABLE_MODEL_MESSAGE", "en"));
    expect(storedQuotaUsage()).toEqual({ kind: "unused" });
    // The consume and the refund: two writes, and no read.
    expect([userRepository.loadCount, userRepository.saveCount]).toEqual([0, 2]);
  });

  it("gives the quota unit back when the model's answer is not usable", async () => {
    const { storedQuotaUsage } = await sendMessage("text", {
      modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: "Sure!" },
    });

    expect(storedQuotaUsage()).toEqual({ kind: "unused" });
  });

  it("keeps the quota unit when the answer gives no event, and adds the quota line", async () => {
    const { fakeReplier, storedQuotaUsage } = await sendMessage("text", {
      modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: answerWith({ date_kind: "relative", calendar: null, year: null, month: null, day: null }) },
    });

    expect(fakeReplier.texts.at(-1)).toBe(
      `${translate("NO_CALENDAR_EVENT_MESSAGE", "en")}\n\n${translate("USER_DAILY_QUOTA_REMAINING", "en").replace("{0}", "4")}`,
    );
    expect(storedQuotaUsage()).toMatchObject({ kind: "used", remainingQuota: 4 });
  });

  it("adds no quota line when the daily quota is off", async () => {
    const { fakeReplier } = await sendMessage("text", { remainingQuota: null });

    expect(fakeReplier.calendarFiles[0].htmlCaption).not.toContain("🔢");
  });

  it("adds no quota line when the daily quota is hidden, but still uses a unit", async () => {
    const { fakeReplier, storedQuotaUsage } = await sendMessage("text", { isDailyQuotaShown: false });

    expect(fakeReplier.calendarFiles[0].htmlCaption).not.toContain("🔢");
    expect(storedQuotaUsage()).toMatchObject({ kind: "used", remainingQuota: 4 });
  });

  it("adds no quota line to a reply with no event when the daily quota is hidden", async () => {
    const { fakeReplier } = await sendMessage("text", {
      isDailyQuotaShown: false,
      modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: answerWith({ date_kind: "relative", calendar: null, year: null, month: null, day: null }) },
    });

    expect(fakeReplier.texts.at(-1)).toBe(translate("NO_CALENDAR_EVENT_MESSAGE", "en"));
  });

  it("still says when the daily quota is used up, even when it is hidden", async () => {
    const { fakeReplier } = await sendMessage("text", { remainingQuota: 0, isDailyQuotaShown: false });

    expect(fakeReplier.texts[0]).toMatch(/^🙅/);
  });

  it("goes on when the notice cannot be sent", async () => {
    const fakeReplier = new FakeReplier();
    let noticeTries = 0;
    fakeReplier.sendText = async () => {
      noticeTries++;
      throw new Error("network down");
    };

    const now = new Date("2026-09-28T02:00:00Z");
    await createEventFromMessage(
      { user: newUser(USER_ID, ALICE), messageText: "text" },
      {
        router: new FakeRouter({ ...modelAnswerOf(GEMINI_MODELS[0]), text: answerWith() }),
        userRepository: new InMemoryUserRepository(),
        dailyQuota: { kind: "off" },
        isDailyQuotaShown: true,
        replier: fakeReplier,
        language: "en",
        now,
      },
    );

    expect(noticeTries).toBe(1);
    expect(fakeReplier.calendarFiles).toHaveLength(1);
  });

  it("logs the outcome as a user activity, and the quota steps", async () => {
    const logEvents = await axiomEventsOf(() => sendMessage("text", { modelResult: NO_MODEL }));

    expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual(
      expect.arrayContaining(["quota.consumed", "user_activity.event_requested", "quota.refunded"]),
    );
    expect(logEvents.find((logEvent) => logEvent.eventName === "user_activity.event_requested")).toMatchObject({
      "user_activity.outcome": "no_model",
    });
  });
});
