import { describe, expect, it } from "vitest";
import { buildCalendarEvent } from "../../src/extractedEvents/calendarEvent";
import type { ExtractedEvent, Recurrence } from "../../src/extractedEvents/extractedEvent";
import { recurrenceProblem } from "../../src/extractedEvents/eventPlan";

// Monday 21 Sep 2026, 12:00 Melbourne.
const NOW = new Date("2026-09-21T02:00:00Z");
const UID = "test-uid";

function rec(overrides: Partial<Recurrence> = {}): Recurrence {
  return {
    frequency: "weekly",
    interval: 1,
    weekdays: ["TH"],
    ordinal: null,
    month_day: null,
    end_kind: "never",
    until_year: null,
    until_month: null,
    until_day: null,
    count: null,
    ...overrides,
  };
}

// A weekly Thursday 19:30 pattern with no stated date, the shape a null calendar goes with.
function event(overrides: Partial<ExtractedEvent> = {}): ExtractedEvent {
  return {
    title: "Shahnameh reading",
    calendar: null,
    date_kind: "weekday",
    year: null,
    month: null,
    day: null,
    start_time: "19:30",
    end_time: null,
    timezone_hint: "Australia/Melbourne",
    location: null,
    recurrence: rec(),
    confidence: 0.95,
    ...overrides,
  };
}

const build = (e: ExtractedEvent) => buildCalendarEvent(e, UID, "en", NOW);

describe("buildCalendarEvent with a null calendar", () => {
  it("builds a weekday pattern exactly as it does for Gregorian: there is no date to convert", () => {
    const withNull = build(event({ calendar: null }));
    expect(withNull).not.toBeNull();
    expect(withNull).toEqual(build(event({ calendar: "gregorian" })));
  });

  it("still builds the same for a pattern in Persian text, since the language says nothing about the calendar", () => {
    expect(build(event({ calendar: null, title: "جلسه شاهنامه خوانی" }))).not.toBeNull();
  });

  it("returns null for a relative date or no date, as before", () => {
    expect(build(event({ date_kind: "relative", recurrence: null }))).toBeNull();
    expect(build(event({ date_kind: "none", recurrence: null }))).toBeNull();
  });

  it("declines an explicit date that arrives with no calendar rather than guessing Gregorian", () => {
    const dated = { date_kind: "absolute" as const, year: null, month: 9, day: 27, recurrence: null };
    expect(build(event({ ...dated, calendar: "gregorian" }))).not.toBeNull();
    expect(build(event({ ...dated, calendar: null }))).toBeNull();
  });

  it("declines a repeat whose end date has no calendar, but builds it when the calendar is given", () => {
    const until = rec({ end_kind: "until", until_year: null, until_month: 11, until_day: 29 });
    expect(build(event({ calendar: "gregorian", recurrence: until }))).not.toBeNull();
    expect(build(event({ calendar: null, recurrence: until }))).toBeNull();
  });

  it("still converts a Solar Hijri date when the calendar is named", () => {
    const dated = { date_kind: "absolute" as const, year: 1405, month: 7, day: 5, recurrence: null };
    const built = build(event({ ...dated, calendar: "Solar Hijri" }));
    expect(built).not.toBeNull();
  });
});

describe("recurrenceProblem with a null calendar", () => {
  it("is null for a valid weekday pattern", () => {
    expect(recurrenceProblem(event(), NOW)).toBeNull();
  });

  it("still validates a weekday pattern: it declines the same cases it declines for Gregorian", () => {
    const bad: Partial<ExtractedEvent>[] = [
      { confidence: 0.5 },
      { recurrence: rec({ weekdays: null }) },
      { recurrence: rec({ interval: 0 }) },
    ];
    for (const overrides of bad) {
      const forNull = recurrenceProblem(event({ ...overrides, calendar: null }), NOW);
      const forGregorian = recurrenceProblem(event({ ...overrides, calendar: "gregorian" }), NOW);
      expect(forNull, JSON.stringify(overrides)).not.toBeNull();
      expect(forNull).toBe(forGregorian);
    }
  });

  it("validates a repeat in any named calendar, once its dates are converted", () => {
    expect(recurrenceProblem(event({ calendar: "persian", confidence: 0.1 }), NOW)).toBe("low confidence (0.1)");
  });
});
