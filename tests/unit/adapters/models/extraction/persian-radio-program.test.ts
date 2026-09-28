import { describe, expect, it } from "vitest";
import { parseEventAnswer } from "../../../../../src/adapters/models/extraction/parse-event-answer";
import type { CalendarEvent, EventUid } from "../../../../../src/domain/calendar-event/calendar-event";
import { createCalendarEvent } from "../../../../../src/domain/calendar-event/create-calendar-event";
import { timeZoneNamed } from "../../../../../src/generic/date-time/time-zone";
import { calendarFileOf } from "../../../../../src/output/calendar-file";
import { googleCalendarLinkOf } from "../../../../../src/output/google-calendar-link";
import {
  GEMINI_3_1_FLASH_LITE_RADIO_EVENT,
  GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT,
} from "../../../fixtures/persianRadioProgram";

// Real model answers for one message, from parsing to the calendar file.

// Monday 21 Sep 2026, 12:00 Melbourne: before the stated start date.
const NOW = new Date("2026-09-21T02:00:00Z");
const TEST_EVENT_UID = "uid@test" as EventUid;

// Returns the calendar event for a model answer, or the reason why there is none.
function calendarEventResultOf(modelAnswer: object) {
  const draftResult = parseEventAnswer(JSON.stringify(modelAnswer));
  if (!draftResult.ok) {
    return draftResult;
  }
  return createCalendarEvent(draftResult.draft, TEST_EVENT_UID, {
    userTimeZone: null,
    now: NOW,
    floatingTimeZone: timeZoneNamed("UTC"),
  });
}

// Returns the calendar event for a model answer, or fails the test if there is none.
function calendarEventOf(modelAnswer: object): CalendarEvent {
  const calendarEventResult = calendarEventResultOf(modelAnswer);
  if (!calendarEventResult.ok) {
    throw new Error(`${calendarEventResult.reason}: ${calendarEventResult.detail}`);
  }
  return calendarEventResult.calendarEvent;
}

describe("the Persian radio programme, as gemini-3.1-flash-lite answered it", () => {
  const calendarEvent = calendarEventOf(GEMINI_3_1_FLASH_LITE_RADIO_EVENT);
  const icsContent = calendarFileOf(calendarEvent, "en", NOW).content;

  it("is a timed event at the stated 20:00, in Tehran time", () => {
    expect(icsContent).toContain("DTSTART;TZID=Asia/Tehran:20260923T200000");
    expect(icsContent).not.toContain("VALUE=DATE");
  });

  it("ends an hour later when no end time is stated", () => {
    expect(icsContent).toContain("DTEND;TZID=Asia/Tehran:20260923T210000");
  });

  it("repeats daily", () => {
    expect(icsContent).toContain("RRULE:FREQ=DAILY");
  });

  it("puts the same time, in Tehran time, in the Google Calendar link", () => {
    const linkParameters = new URL(googleCalendarLinkOf(calendarEvent, "en")).searchParams;
    // 20:00 Iran time (UTC+3:30, no daylight saving) is 16:30 UTC.
    expect(linkParameters.get("dates")).toBe("20260923T163000Z/20260923T173000Z");
    expect(linkParameters.get("ctz")).toBe("Asia/Tehran");
    expect(linkParameters.get("recur")).toBe("RRULE:FREQ=DAILY");
  });
});

describe("the Persian radio programme, with the date left in the Persian calendar", () => {
  it("converts 1 Mehr 1405 to the same event as the Gregorian answer", () => {
    expect(calendarEventOf(GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT)).toEqual(
      calendarEventOf(GEMINI_3_1_FLASH_LITE_RADIO_EVENT),
    );
  });

  it("gives a Persian date with no year the current Persian year", () => {
    const withoutYear = { ...GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT, year: null };
    expect(calendarEventOf(withoutYear).date).toEqual({ year: 2026, month: 9, day: 23 });
  });

  it("gives no event for a monthly repeat in the Persian calendar", () => {
    const monthlyAnswer = {
      ...GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT,
      recurrence: { ...GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT.recurrence, frequency: "monthly", month_day: 1 },
    };
    expect(calendarEventResultOf(monthlyAnswer)).toMatchObject({ ok: false, reason: "no-event" });
  });
});
