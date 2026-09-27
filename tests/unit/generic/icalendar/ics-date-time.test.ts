import { describe, expect, it } from "vitest";
import {
  formatIcsDate,
  formatIcsLocalDateTime,
  formatIcsUtcDateTime,
} from "../../../../src/generic/icalendar/ics-date-time";

describe("iCalendar date and time formats", () => {
  it("writes a date", () => {
    expect(formatIcsDate({ year: 2026, month: 9, day: 3 })).toBe("20260903");
  });

  it("writes a local date and time", () => {
    expect(formatIcsLocalDateTime({ year: 2026, month: 9, day: 3 }, { hour: 8, minute: 5 })).toBe("20260903T080500");
  });

  it("writes a moment in UTC", () => {
    expect(formatIcsUtcDateTime(new Date("2026-09-23T16:30:00.000Z"))).toBe("20260923T163000Z");
  });
});
