import { describe, expect, it } from "vitest";
import type { DateOnly } from "../../../../src/generic/date-time/date-only";
import type { LocalDateTime } from "../../../../src/generic/date-time/time-zone";
import type { EventTime } from "../../../../src/domain/calendar-event/event-time";
import { firstDateOf } from "../../../../src/domain/calendar-event/first-date-rule";
import type { RepeatPattern } from "../../../../src/domain/calendar-event/repeat";

// Monday 21 September 2026, 12:00.
const MON_SEP_21_2026: DateOnly = { year: 2026, month: 9, day: 21 };
const MON_NOON: LocalDateTime = { date: MON_SEP_21_2026, time: { hour: 12, minute: 0 } };
const AT_7_30_PM: EventTime = { kind: "timed", start: { hour: 19, minute: 30 }, end: { hour: 20, minute: 30 } };
const WEEKLY_ON_THURSDAY: RepeatPattern = { frequency: "weekly", interval: 1, weekdays: ["TH"] };

describe("firstDateOf, with a start date", () => {
  it("finds the next matching weekday", () => {
    expect(firstDateOf(MON_SEP_21_2026, WEEKLY_ON_THURSDAY, AT_7_30_PM, MON_NOON)).toEqual({ year: 2026, month: 9, day: 24 });
  });

  it("keeps the start date when a weekly pattern has no weekdays", () => {
    const pattern: RepeatPattern = { frequency: "weekly", interval: 1, weekdays: [] };
    expect(firstDateOf(MON_SEP_21_2026, pattern, AT_7_30_PM, MON_NOON)).toEqual(MON_SEP_21_2026);
  });

  it("finds the first Friday of the next matching month", () => {
    // 5 Dec 2026 is a Saturday, so the first Friday on or after it is 1 Jan 2027.
    const pattern: RepeatPattern = {
      frequency: "monthly",
      interval: 1,
      dayOfMonth: { kind: "weekday-of-month", week: 1, weekdays: ["FR"] },
    };
    expect(firstDateOf({ year: 2026, month: 12, day: 5 }, pattern, AT_7_30_PM, MON_NOON)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it("finds the last Friday of the month", () => {
    const pattern: RepeatPattern = {
      frequency: "monthly",
      interval: 1,
      dayOfMonth: { kind: "weekday-of-month", week: "last", weekdays: ["FR"] },
    };
    expect(firstDateOf({ year: 2026, month: 10, day: 1 }, pattern, AT_7_30_PM, MON_NOON)).toEqual({ year: 2026, month: 10, day: 30 });
  });

  it("finds a fixed day of the month", () => {
    const pattern: RepeatPattern = { frequency: "monthly", interval: 1, dayOfMonth: { kind: "fixed-day", day: 15 } };
    expect(firstDateOf(MON_SEP_21_2026, pattern, AT_7_30_PM, MON_NOON)).toEqual({ year: 2026, month: 10, day: 15 });
  });

  it("returns null when no day matches", () => {
    const pattern: RepeatPattern = { frequency: "monthly", interval: 1, dayOfMonth: { kind: "fixed-day", day: 32 } };
    expect(firstDateOf(MON_SEP_21_2026, pattern, AT_7_30_PM, MON_NOON)).toBeNull();
  });
});

describe("firstDateOf, with no start date", () => {
  const everyDay: RepeatPattern = { frequency: "daily", interval: 1 };

  it("is today if the event has not started yet", () => {
    expect(firstDateOf(null, everyDay, AT_7_30_PM, MON_NOON)).toEqual(MON_SEP_21_2026);
  });

  it("is tomorrow if today's event has already started", () => {
    const at8Pm: LocalDateTime = { date: MON_SEP_21_2026, time: { hour: 20, minute: 0 } };
    expect(firstDateOf(null, everyDay, AT_7_30_PM, at8Pm)).toEqual({ year: 2026, month: 9, day: 22 });
  });

  it("is today for an all-day event", () => {
    const lateEvening: LocalDateTime = { date: MON_SEP_21_2026, time: { hour: 23, minute: 0 } };
    expect(firstDateOf(null, everyDay, { kind: "all-day" }, lateEvening)).toEqual(MON_SEP_21_2026);
  });
});
