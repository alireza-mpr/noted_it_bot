import { describe, expect, it } from "vitest";
import { buildCalendarEvent } from "../../src/extractedEvents/calendarEvent";
import type { ExtractedEvent } from "../../src/extractedEvents/extractedEvent";
import { ianaZone } from "../../src/time/timezone";

describe("ianaZone", () => {
  it("canonicalises an alias or a differently cased name", () => {
    expect(ianaZone("Iran")).toBe("Asia/Tehran");
    expect(ianaZone("asia/tehran")).toBe("Asia/Tehran");
  });

  it("returns null for a name that isn't a timezone", () => {
    expect(ianaZone("Iran Standard Time")).toBeNull();
  });
});

describe("timezone in the built event", () => {
  const event = (timezone_hint: string): ExtractedEvent => ({
    title: "Event",
    calendar: "gregorian",
    date_kind: "absolute",
    year: 2026,
    month: 9,
    day: 23,
    start_time: "20:00",
    end_time: null,
    timezone_hint,
    location: null,
    recurrence: null,
    confidence: 0.95,
  });
  const NOW = new Date("2026-09-21T02:00:00Z");

  it("writes the canonical name into the .ics and the link", () => {
    const built = buildCalendarEvent(event("Iran"), "uid@test", "en", NOW);

    expect(built!.icsContent).toContain(
      "DTSTART;TZID=Asia/Tehran:20260923T200000",
    );
    expect(new URL(built!.googleCalendarUrl).searchParams.get("ctz")).toBe(
      "Asia/Tehran",
    );
  });

  it("declines an unrecognised timezone instead of guessing one", () => {
    expect(
      buildCalendarEvent(event("Iran Standard Time"), "uid@test", "en", NOW),
    ).toBeNull();
  });
});
