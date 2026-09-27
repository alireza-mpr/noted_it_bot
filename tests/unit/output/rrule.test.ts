import { describe, expect, it } from "vitest";
import type { DateOnly } from "../../../src/generic/date-time/date-only";
import type { Repeat } from "../../../src/domain/calendar-event/repeat";
import { rruleOf } from "../../../src/output/rrule";
import { timeZoneNamed } from "../generic/date-time/time-zone-named";
import { calendarEventWith } from "./calendar-event-with";

const MELBOURNE = { kind: "from-message", timeZone: timeZoneNamed("Australia/Melbourne") } as const;
const WEEKLY_ON_THURSDAY: Repeat<DateOnly> = {
  pattern: { frequency: "weekly", interval: 1, weekdays: ["TH"] },
  end: { kind: "never" },
};
const UNTIL_NOV_29_2026 = { kind: "until", date: { year: 2026, month: 11, day: 29 } } as const;

// Returns the RRULE of a Melbourne event with the given repeat.
function rruleWith(repeat: Repeat<DateOnly>, overrides: Parameters<typeof calendarEventWith>[0] = {}): string | null {
  return rruleOf(calendarEventWith({ timeZone: MELBOURNE, repeat, ...overrides }));
}

describe("rruleOf", () => {
  it("is null for a one-off event", () => {
    expect(rruleOf(calendarEventWith())).toBeNull();
  });

  it("writes a weekly repeat with no end", () => {
    expect(rruleWith(WEEKLY_ON_THURSDAY)).toBe("FREQ=WEEKLY;BYDAY=TH");
  });

  it("writes the interval and the number of times", () => {
    const repeat: Repeat<DateOnly> = {
      pattern: { frequency: "weekly", interval: 2, weekdays: ["TH"] },
      end: { kind: "after", times: 6 },
    };
    expect(rruleWith(repeat)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;COUNT=6");
  });

  it("writes a daily repeat", () => {
    expect(rruleWith({ pattern: { frequency: "daily", interval: 1 }, end: { kind: "never" } })).toBe("FREQ=DAILY");
  });

  it("writes the first and the last Friday of the month", () => {
    const firstFriday: Repeat<DateOnly> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "weekday-of-month", week: 1, weekdays: ["FR"] } },
      end: { kind: "never" },
    };
    const lastFriday: Repeat<DateOnly> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "weekday-of-month", week: "last", weekdays: ["FR"] } },
      end: { kind: "never" },
    };
    expect(rruleWith(firstFriday)).toBe("FREQ=MONTHLY;BYDAY=1FR");
    expect(rruleWith(lastFriday)).toBe("FREQ=MONTHLY;BYDAY=-1FR");
  });

  it("writes a fixed day of the month", () => {
    const repeat: Repeat<DateOnly> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "fixed-day", day: 15 } },
      end: { kind: "never" },
    };
    expect(rruleWith(repeat)).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
  });

  it("ends a timed repeat at the end of its last day, in UTC", () => {
    // 29 Nov 2026 23:59 in Melbourne (AEDT, UTC+11) is 12:59 UTC.
    expect(rruleWith({ ...WEEKLY_ON_THURSDAY, end: UNTIL_NOV_29_2026 })).toBe("FREQ=WEEKLY;BYDAY=TH;UNTIL=20261129T125900Z");
  });

  it("ends an all-day repeat on a date", () => {
    expect(rruleWith({ ...WEEKLY_ON_THURSDAY, end: UNTIL_NOV_29_2026 }, { time: { kind: "all-day" } })).toBe(
      "FREQ=WEEKLY;BYDAY=TH;UNTIL=20261129",
    );
  });

  it("ends a floating repeat at the end of its last day, in local time", () => {
    expect(rruleWith({ ...WEEKLY_ON_THURSDAY, end: UNTIL_NOV_29_2026 }, { timeZone: { kind: "floating" } })).toBe(
      "FREQ=WEEKLY;BYDAY=TH;UNTIL=20261129T235900",
    );
  });
});
