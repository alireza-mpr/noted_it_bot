import { describe, expect, it } from "vitest";
import { buildCalendarEvent } from "../../src/legacy/extractedEvents/calendarEvent";
import type { ExtractedEvent } from "../../src/legacy/extractedEvents/extractedEvent";

const NOW = new Date("2026-09-21T02:00:00Z");

// A one-off event at 20:00 in the given calendar's own date.
function eventOn(
  calendar: string,
  year: number,
  month: number,
  day: number,
): ExtractedEvent {
  return {
    title: "Event",
    calendar,
    date_kind: "absolute",
    year,
    month,
    day,
    start_time: "20:00",
    end_time: null,
    timezone_hint: "Australia/Melbourne",
    location: null,
    recurrence: null,
    confidence: 0.95,
  };
}

function startOf(event: ExtractedEvent): string | null {
  const built = buildCalendarEvent(event, "uid@test", "en", NOW);
  return built?.icsContent.match(/DTSTART;TZID=[^:]+:(\d{8})T/)?.[1] ?? null;
}

describe("dates in another calendar are converted by the library", () => {
  it.each([
    // Nowruz (1 Farvardin), 1 Mehr, and the last day of a leap Esfand.
    ["persian", 1403, 12, 30, "20250320"],
    ["persian", 1405, 1, 1, "20260321"],
    ["persian", 1405, 7, 1, "20260923"],
    // Rosh Hashanah 5786.
    ["hebrew", 5786, 1, 1, "20250923"],
    ["gregorian", 2026, 9, 23, "20260923"],
  ])("%s %i-%i-%i is %s", (calendar, year, month, day, expected) => {
    expect(startOf(eventOn(calendar, year, month, day))).toBe(expected);
  });

  it.each([
    ["Gregorian", 2026, 9, 23],
    [" PERSIAN ", 1405, 7, 1],
    ["Jalali", 1405, 7, 1],
    ["Solar Hijri", 1405, 7, 1],
    ["Hebrew", 5786, 1, 1],
  ])("accepts the name %j whatever its casing", (calendar, year, month, day) => {
    expect(startOf(eventOn(calendar, year, month, day))).toBe(
      calendar === "Hebrew" ? "20250923" : "20260923",
    );
  });

  it("declines a name it doesn't recognise, such as plain Hijri", () => {
    expect(startOf(eventOn("Hijri", 1447, 1, 1))).toBeNull();
  });

  it("declines a day that doesn't exist (1404 is a common year)", () => {
    expect(startOf(eventOn("persian", 1404, 12, 30))).toBeNull();
  });

  it("declines a calendar the library doesn't know", () => {
    expect(startOf(eventOn("unknown", 1405, 7, 1))).toBeNull();
  });
});
