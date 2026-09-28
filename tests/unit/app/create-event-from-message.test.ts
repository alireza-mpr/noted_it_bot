import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { EventAnswer, RecurrenceAnswer } from "../../../src/adapters/models/extraction/event-answer-schema";
import type { ModelFailure, ModelRequest, ModelResult } from "../../../src/adapters/models/model-result";
import { GEMINI_MODELS } from "../../../src/adapters/models/providers/model-list";
import type { Replier } from "../../../src/adapters/telegram/replier";
import type { LinkButton } from "../../../src/adapters/telegram/telegram-client";
import {
  createEventFromMessage,
  type EventRequestContext,
} from "../../../src/app/create-event-from-message";
import type { QuotaReservation, QuotaResult, UsageStore } from "../../../src/domain/quota/usage-store";
import { UserQuotaPolicy } from "../../../src/domain/quota/user-quota-policy";
import { timeZoneNamed, type IanaTimeZone } from "../../../src/generic/date-time/time-zone";
import type { SupportedLanguage } from "../../../src/domain/user/supported-language";
import { translate } from "../../../src/i18n/translation";
import type { CalendarFile } from "../../../src/output/calendar-file";
import { axiomEventsOf } from "../adapters/logging/axiom-events-of";
import { modelAnswerOf } from "../adapters/models/model-answer-of";

const USER_ID = 42;
const WAIT_MS = (2 * 60 + 5) * 60_000;
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

// Represents a replier that keeps what it sends.
class FakeReplier implements Replier {
  readonly texts: string[] = [];
  readonly calendarFiles: { calendarFile: CalendarFile; htmlCaption: string }[] = [];

  async sendText(text: string): Promise<void> {
    this.texts.push(text);
  }

  async sendTextWithLinkButton(text: string, _linkButton: LinkButton): Promise<void> {
    this.texts.push(text);
  }

  async sendCalendarFile(calendarFile: CalendarFile, htmlCaption: string): Promise<void> {
    this.calendarFiles.push({ calendarFile, htmlCaption });
  }
}

// Represents a usage store in memory, with a number of units left.
class FakeUsageStore implements UsageStore {
  readonly refundedReservations: QuotaReservation[] = [];

  constructor(private remainingQuota: number) {}

  async tryConsume(userId: number, dailyQuota: number, now: Date): Promise<QuotaResult> {
    if (this.remainingQuota <= 0) {
      return { ok: false, retryAt: new Date(now.getTime() + WAIT_MS) };
    }
    this.remainingQuota -= 1;
    return {
      ok: true,
      remaining: this.remainingQuota,
      reservation: {
        userId,
        dailyQuota,
        consumedAt: now,
        previousRemainingQuota: this.remainingQuota + 1,
        previousLastUsedAt: new Date(0),
      },
    };
  }

  async refund(quotaReservation: QuotaReservation): Promise<void> {
    this.refundedReservations.push(quotaReservation);
    this.remainingQuota += 1;
  }
}

interface TestSetup {
  modelResult?: ModelResult;
  remainingQuota?: number | null;
  language?: SupportedLanguage;
  userTimeZone?: IanaTimeZone | null;
  now?: Date;
}

// Runs one message through the use case, and returns what it sent and used.
async function sendMessage(messageText: string | null, testSetup: TestSetup = {}) {
  const fakeRouter = new FakeRouter(testSetup.modelResult ?? { ...modelAnswerOf(GEMINI_MODELS[0]), text: answerWith() });
  const fakeReplier = new FakeReplier();
  const remainingQuota = testSetup.remainingQuota === undefined ? 5 : testSetup.remainingQuota;
  const fakeUsageStore = new FakeUsageStore(remainingQuota ?? 0);
  const eventRequestContext: EventRequestContext = {
    router: fakeRouter,
    userQuotaPolicy: remainingQuota === null ? null : new UserQuotaPolicy(fakeUsageStore, 5),
    replier: fakeReplier,
    language: testSetup.language ?? "en",
    userTimeZone: testSetup.userTimeZone ?? null,
    now: testSetup.now ?? new Date("2026-09-28T02:00:00Z"),
  };
  await createEventFromMessage({ userId: USER_ID, messageText }, eventRequestContext);
  return { fakeRouter, fakeReplier, fakeUsageStore };
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
    const { fakeReplier, fakeRouter, fakeUsageStore } = await sendMessage(null, { remainingQuota: 0 });

    expect(fakeReplier.texts).toEqual([translate("NO_TEXT_MESSAGE", "en")]);
    expect(fakeRouter.modelRequests).toEqual([]);
    expect(fakeUsageStore.refundedReservations).toEqual([]);
  });

  it("says when the daily quota is used up, with the wait time in the reply language", async () => {
    const { fakeReplier, fakeRouter } = await sendMessage("text", { remainingQuota: 0, language: "fa" });

    expect(fakeRouter.modelRequests).toEqual([]);
    expect(fakeReplier.texts).toHaveLength(1);
    expect(fakeReplier.texts[0]).toMatch(/۲ ساعت.*۵ دقیقه/);
    expect(fakeReplier.texts[0]).not.toMatch(/[0-9]/);
  });

  it("gives the quota unit back when no model answers", async () => {
    const { fakeReplier, fakeUsageStore } = await sendMessage("text", { modelResult: NO_MODEL });

    expect(fakeReplier.texts).toContain(translate("NO_AVAILABLE_MODEL_MESSAGE", "en"));
    expect(fakeUsageStore.refundedReservations).toHaveLength(1);
  });

  it("gives the quota unit back when the model's answer is not usable", async () => {
    const { fakeUsageStore } = await sendMessage("text", {
      modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: "Sure!" },
    });

    expect(fakeUsageStore.refundedReservations).toHaveLength(1);
  });

  it("keeps the quota unit when the answer gives no event, and adds the quota line", async () => {
    const { fakeReplier, fakeUsageStore } = await sendMessage("text", {
      modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: answerWith({ date_kind: "relative", calendar: null, year: null, month: null, day: null }) },
    });

    expect(fakeReplier.texts.at(-1)).toBe(
      `${translate("NO_CALENDAR_EVENT_MESSAGE", "en")}\n\n${translate("USER_DAILY_QUOTA_REMAINING", "en").replace("{0}", "4")}`,
    );
    expect(fakeUsageStore.refundedReservations).toEqual([]);
  });

  it("adds no quota line when the daily quota is off", async () => {
    const { fakeReplier } = await sendMessage("text", { remainingQuota: null });

    expect(fakeReplier.calendarFiles[0].htmlCaption).not.toContain("🔢");
  });

  it("goes on when the notice cannot be sent", async () => {
    const fakeReplier = new FakeReplier();
    let noticeTries = 0;
    fakeReplier.sendText = async () => {
      noticeTries++;
      throw new Error("network down");
    };

    await createEventFromMessage(
      { userId: USER_ID, messageText: "text" },
      {
        router: new FakeRouter({ ...modelAnswerOf(GEMINI_MODELS[0]), text: answerWith() }),
        userQuotaPolicy: null,
        replier: fakeReplier,
        language: "en",
        userTimeZone: null,
        now: new Date("2026-09-28T02:00:00Z"),
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
