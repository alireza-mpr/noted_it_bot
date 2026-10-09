import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RecurrenceAnswer } from "../../../src/adapters/models/extraction/event-answer-schema";
import type { ModelFailure } from "../../../src/adapters/models/model-result";
import { GEMINI_MODELS } from "../../../src/adapters/models/providers/model-list";
import { createEventFromMessage } from "../../../src/app/create-event-from-message";
import { newUser } from "../../../src/domain/user/user";
import { timeZoneNamed } from "../../../src/generic/date-time/time-zone";
import { translate } from "../../../src/i18n/translation";
import { axiomEventsOf } from "../adapters/logging/axiom-events-of";
import { modelAnswerOf } from "../adapters/models/model-answer-of";
import { FakeReplier } from "./fake-replier";
import { FakeRouter } from "./fake-router";
import { InMemoryUserRepository } from "./in-memory-user-repository";
import { ALICE, answerWith, sendMessage, sentCalendarFileOf, USER_ID } from "./send-message";

const NO_MODEL: ModelFailure = {
  ok: false,
  kind: "rate-limited",
  limitWindow: null,
  retryAfterSeconds: null,
  httpStatus: null,
  detail: "no model is under its limits",
};

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the event time zone", () => {
  it("uses the message's time zone over the user's, with no note", async () => {
    const { icsContent, htmlCaption } = await sentCalendarFileOf(answerWith({ timezone_hint: "Australia/Melbourne" }), {
      userTimeZone: timeZoneNamed("Europe/London"),
    });

    expect(icsContent).toContain("DTSTART;TZID=Australia/Melbourne:20300923T200000");
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

  it("logs a used-up quota as a user activity", async () => {
    const logEvents = await axiomEventsOf(() => sendMessage("text", { remainingQuota: 0 }));

    expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual(["user_activity.quota_used_up"]);
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

  it("asks for the time zone when a relative date has none, e.g. tonight", async () => {
    const tonightAnswer = answerWith({
      date_kind: "relative",
      calendar: null,
      year: null,
      month: null,
      day: null,
      relative_date: { days_from_today: 0, weekday: null, which_week: null },
    });
    const withNoTimeZone = await sendMessage("text", {
      isDailyQuotaShown: false,
      modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: tonightAnswer },
    });
    expect(withNoTimeZone.fakeReplier.texts.at(-1)).toBe(translate("TIME_ZONE_NEEDED_MESSAGE", "en"));
    expect(withNoTimeZone.fakeReplier.calendarFiles).toHaveLength(0);

    const { icsContent } = await sentCalendarFileOf(tonightAnswer, { userTimeZone: timeZoneNamed("Europe/London") });
    // 02:00 UTC on 28 Sep is 03:00 on 28 Sep in London.
    expect(icsContent).toContain("DTSTART;TZID=Europe/London:20260928T200000");
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

  it.each([
    // The model reads the event, but the message gives neither a date nor a time.
    ["a draft with no date and no time", { date_kind: "none" as const, start_time: null }, "no_event", "no date"],
    // e.g. "lunch at 1", from a user with no /tz.
    ["a time with no date and no time zone", { date_kind: "none" as const }, "time_zone_needed", "a time with no date and no time zone"],
    // The model finds a relative date the bot does not read, e.g. "this weekend".
    ["a relative date the bot does not read", { date_kind: "relative" as const }, "no_event", "a relative date the bot does not read yet"],
    [
      "a relative date with no time zone",
      { date_kind: "relative" as const, relative_date: { days_from_today: 0, weekday: null, which_week: null } },
      "time_zone_needed",
      "a relative date with no time zone",
    ],
  ])("logs why there is no event: %s", async (_caseName, answerOverrides, expectedOutcome, expectedProblem) => {
    const noDateAnswer = answerWith({ calendar: null, year: null, month: null, day: null, ...answerOverrides });
    const logEvents = await axiomEventsOf(() =>
      sendMessage("text", { modelResult: { ...modelAnswerOf(GEMINI_MODELS[0]), text: noDateAnswer } }),
    );

    expect(logEvents.find((logEvent) => logEvent.eventName === "user_activity.event_requested")).toMatchObject({
      "user_activity.outcome": expectedOutcome,
      "user_activity.problem": expectedProblem,
    });
  });

  it("logs no problem when the event is created", async () => {
    const logEvents = await axiomEventsOf(() => sendMessage("text"));

    const eventRequestedLogEvent = logEvents.find((logEvent) => logEvent.eventName === "user_activity.event_requested");
    expect(eventRequestedLogEvent).toMatchObject({ "user_activity.outcome": "created" });
    expect(eventRequestedLogEvent).not.toHaveProperty(["user_activity.problem"]);
  });
});
