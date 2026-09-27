import { describe, expect, it } from "vitest";
import {
  formatClockTime,
  formatDateWithYear,
  formatShortDate,
  formatWeekdayName,
} from "../../../src/output/localized-date-time";

// Wednesday 23 September 2026.
const WED_SEP_23_2026 = { year: 2026, month: 9, day: 23 };

describe("dates and times in the reply language", () => {
  it("writes a short date with its weekday", () => {
    expect(formatShortDate(WED_SEP_23_2026, "en")).toBe("Wed, Sep 23");
  });

  it("writes a date with its year", () => {
    expect(formatDateWithYear({ year: 2026, month: 1, day: 20 }, "en")).toBe("Jan 20, 2026");
  });

  it("writes a time of day", () => {
    expect(formatClockTime({ hour: 20, minute: 0 }, "en")).toBe("8:00 PM");
  });

  it("writes weekday names", () => {
    expect(formatWeekdayName("MO", "en")).toBe("Monday");
    expect(formatWeekdayName("SU", "en")).toBe("Sunday");
  });

  it("writes Persian names and digits, on the Gregorian calendar", () => {
    expect(formatWeekdayName("MO", "fa")).toBe("دوشنبه");
    expect(formatWeekdayName("TU", "fa")).toBe("سه‌شنبه");
    // The Gregorian year 2026, not the Persian year 1405.
    expect(formatDateWithYear({ year: 2026, month: 1, day: 20 }, "fa")).toContain("۲۰۲۶");
  });
});
