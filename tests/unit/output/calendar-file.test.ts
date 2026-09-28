import { describe, expect, it } from "vitest";
import { calendarFileOf } from "../../../src/output/calendar-file";
import { calendarEventWith } from "./calendar-event-with";

const NOW = new Date("2026-09-21T02:00:00Z");

// Returns the lines of the calendar file, unfolded.
function icsLinesOf(overrides: Parameters<typeof calendarEventWith>[0] = {}): string[] {
  return calendarFileOf(calendarEventWith(overrides), "en", NOW).content.replace(/\r\n /g, "").split("\r\n");
}

describe("calendarFileOf", () => {
  it("is event.ics, with CRLF line ends", () => {
    const calendarFile = calendarFileOf(calendarEventWith(), "en", NOW);
    expect(calendarFile.fileName).toBe("event.ics");
    expect(calendarFile.content.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(calendarFile.content.endsWith("END:VEVENT\r\nEND:VCALENDAR")).toBe(true);
  });

  it("writes the UID, the time stamp and the title", () => {
    const icsLines = icsLinesOf({ title: "Game night" });
    expect(icsLines).toContain("UID:test@notedit");
    expect(icsLines).toContain("DTSTAMP:20260921T020000Z");
    expect(icsLines).toContain("SUMMARY:Game night");
  });

  it("writes a time in a time zone as local time with TZID", () => {
    const icsLines = icsLinesOf();
    expect(icsLines).toContain("DTSTART;TZID=Australia/Melbourne:20260923T200000");
    expect(icsLines).toContain("DTEND;TZID=Australia/Melbourne:20260923T210000");
  });

  it("writes a floating time with no TZID", () => {
    const icsLines = icsLinesOf({ timeZone: { kind: "floating" } });
    expect(icsLines).toContain("DTSTART:20260923T200000");
    expect(icsLines).toContain("DTEND:20260923T210000");
  });

  it("writes an all-day event as dates, ending on the next day", () => {
    const icsLines = icsLinesOf({ time: { kind: "all-day" } });
    expect(icsLines).toContain("DTSTART;VALUE=DATE:20260923");
    expect(icsLines).toContain("DTEND;VALUE=DATE:20260924");
  });

  it("writes the location only when there is one, escaped", () => {
    expect(icsLinesOf().some((icsLine) => icsLine.startsWith("LOCATION"))).toBe(false);
    expect(icsLinesOf({ location: "Hall 2, Level 1" })).toContain("LOCATION:Hall 2\\, Level 1");
  });

  it("writes the RRULE of a repeating event, and none for a one-off event", () => {
    expect(icsLinesOf().some((icsLine) => icsLine.startsWith("RRULE"))).toBe(false);
    const repeat = { pattern: { frequency: "daily", interval: 1 }, end: { kind: "never" } } as const;
    expect(icsLinesOf({ repeat })).toContain("RRULE:FREQ=DAILY");
  });

  it("folds a long title in a non-Latin script", () => {
    const content = calendarFileOf(calendarEventWith({ title: "جلسه شاهنامه خوانی ".repeat(5) }), "en", NOW).content;
    expect(content.split("\r\n").every((icsLine) => new TextEncoder().encode(icsLine).length <= 75)).toBe(true);
  });
});
