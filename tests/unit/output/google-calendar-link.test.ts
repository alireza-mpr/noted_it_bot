import { describe, expect, it } from "vitest";
import { googleCalendarLinkOf } from "../../../src/output/google-calendar-link";
import { calendarEventWith } from "./calendar-event-with";

// Returns the link's parameters.
function linkParametersOf(overrides: Parameters<typeof calendarEventWith>[0] = {}): URLSearchParams {
  return new URL(googleCalendarLinkOf(calendarEventWith(overrides), "en")).searchParams;
}

describe("googleCalendarLinkOf", () => {
  it("opens Google Calendar's event template with the title", () => {
    const link = googleCalendarLinkOf(calendarEventWith({ title: "جام جهان‌نما" }), "en");
    expect(link.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(new URL(link).searchParams.get("action")).toBe("TEMPLATE");
    expect(new URL(link).searchParams.get("text")).toBe("جام جهان‌نما");
  });

  it("writes a time in a time zone as UTC times, with the time zone", () => {
    // 20:00 in Melbourne on 23 Sep 2026 (AEST, UTC+10) is 10:00 UTC.
    const linkParameters = linkParametersOf();
    expect(linkParameters.get("dates")).toBe("20260923T100000Z/20260923T110000Z");
    expect(linkParameters.get("ctz")).toBe("Australia/Melbourne");
  });

  it("writes a floating time as local times, with no time zone", () => {
    const linkParameters = linkParametersOf({ timeZone: { kind: "floating" } });
    expect(linkParameters.get("dates")).toBe("20260923T200000/20260923T210000");
    expect(linkParameters.has("ctz")).toBe(false);
  });

  it("writes an all-day event as dates, ending on the next day, with no time zone", () => {
    const linkParameters = linkParametersOf({ time: { kind: "all-day" } });
    expect(linkParameters.get("dates")).toBe("20260923/20260924");
    expect(linkParameters.has("ctz")).toBe(false);
  });

  it("writes the location only when there is one", () => {
    expect(linkParametersOf().has("location")).toBe(false);
    expect(linkParametersOf({ location: "Hall 2" }).get("location")).toBe("Hall 2");
  });

  it("writes the repeat only for a repeating event", () => {
    expect(linkParametersOf().has("recur")).toBe(false);
    const repeat = { pattern: { frequency: "daily", interval: 1 }, end: { kind: "never" } } as const;
    expect(linkParametersOf({ repeat }).get("recur")).toBe("RRULE:FREQ=DAILY");
  });
});
