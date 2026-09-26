import { describe, expect, it } from "vitest";
import { buildCalendarEvent } from "../../src/lib/extractedEvents/calendarEvent";
import {
  GEMINI_3_1_FLASH_LITE_RADIO_EVENT,
  GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT,
} from "./fixtures/persianRadioProgram";

// Monday 21 Sep 2026, 12:00 Melbourne — before the stated start date.
const NOW = new Date("2026-09-21T02:00:00Z");

describe("Persian radio programme, as extracted by gemini-3.1-flash-lite", () => {
  const built = buildCalendarEvent(
    GEMINI_3_1_FLASH_LITE_RADIO_EVENT,
    "uid@test",
    "en",
    NOW,
  );

  it("builds an event", () => {
    expect(built).not.toBeNull();
  });

  it("is a timed event at the stated 20:00, not an all-day event", () => {
    expect(built!.allDay).toBe(false);
    expect(built!.icsContent).toContain(
      "DTSTART;TZID=Asia/Tehran:20260923T200000",
    );
    expect(built!.icsContent).not.toContain("VALUE=DATE");
  });

  it("ends an hour later when no end time is stated", () => {
    expect(built!.icsContent).toContain(
      "DTEND;TZID=Asia/Tehran:20260923T210000",
    );
  });

  it("repeats daily", () => {
    expect(built!.icsContent).toContain("RRULE:FREQ=DAILY");
    expect(built!.recurrence).not.toBeNull();
  });

  it("puts the same time, in Tehran time, in the Google Calendar link", () => {
    const url = new URL(built!.googleCalendarUrl);
    // 20:00 Iran time (UTC+3:30, no daylight saving) is 16:30 UTC.
    expect(url.searchParams.get("dates")).toBe(
      "20260923T163000Z/20260923T173000Z",
    );
    expect(url.searchParams.get("ctz")).toBe("Asia/Tehran");
    expect(url.searchParams.get("recur")).toBe("RRULE:FREQ=DAILY");
  });
});

describe("Persian radio programme, with the date left in the Persian calendar", () => {
  it("converts 1 Mehr 1405 to the same event as the Gregorian answer", () => {
    const jalali = buildCalendarEvent(
      GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT,
      "uid@test",
      "en",
      NOW,
    );
    const gregorian = buildCalendarEvent(
      GEMINI_3_1_FLASH_LITE_RADIO_EVENT,
      "uid@test",
      "en",
      NOW,
    );

    expect(jalali).not.toBeNull();
    expect(jalali!.icsContent).toContain(
      "DTSTART;TZID=Asia/Tehran:20260923T200000",
    );
    expect(jalali!.icsContent).toBe(gregorian!.icsContent);
    expect(jalali!.googleCalendarUrl).toBe(gregorian!.googleCalendarUrl);
  });

  it("declines a Persian-calendar date with no stated year", () => {
    expect(
      buildCalendarEvent(
        { ...GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT, year: null },
        "uid@test",
        "en",
        NOW,
      ),
    ).toBeNull();
  });

  it("declines a monthly repeat in the Persian calendar", () => {
    const monthly = {
      ...GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT,
      recurrence: {
        ...GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT.recurrence!,
        frequency: "monthly" as const,
        month_day: 1,
      },
    };

    expect(buildCalendarEvent(monthly, "uid@test", "en", NOW)).toBeNull();
  });
});
