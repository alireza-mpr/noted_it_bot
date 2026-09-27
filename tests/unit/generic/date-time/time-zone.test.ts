import { describe, expect, it } from "vitest";
import {
  dateTimeTextIn,
  parseTimeZoneName,
  localDateTimeIn,
  timeZoneNamed,
  toUtcMoment,
} from "../../../../src/generic/date-time/time-zone";

describe("parseTimeZoneName", () => {
  it("returns the standard name for another name or casing of the time zone", () => {
    expect(parseTimeZoneName("Iran")).toBe("Asia/Tehran");
    expect(parseTimeZoneName("asia/tehran")).toBe("Asia/Tehran");
  });

  it("returns null for a name that is not a time zone", () => {
    expect(parseTimeZoneName("Iran Standard Time")).toBeNull();
  });
});

describe("timeZoneNamed", () => {
  it("returns the time zone for a name written in the code", () => {
    expect(timeZoneNamed("Asia/Tehran")).toBe("Asia/Tehran");
  });

  it("throws for a name that is not a time zone", () => {
    expect(() => timeZoneNamed("Mars/Olympus")).toThrow("not a time zone: Mars/Olympus");
  });
});

describe("dateTimeTextIn", () => {
  it("writes the date and time in the time zone, with seconds, on a 24-hour clock", () => {
    // 04:05:09 UTC on 28 Sep 2026 is 14:05:09 in Melbourne (AEST, UTC+10).
    expect(dateTimeTextIn(timeZoneNamed("Australia/Melbourne"), new Date("2026-09-28T04:05:09Z"))).toBe(
      "2026-09-28 14:05:09",
    );
  });

  it("writes midnight as 00, not 24", () => {
    expect(dateTimeTextIn(timeZoneNamed("UTC"), new Date("2026-09-28T00:00:00Z"))).toBe("2026-09-28 00:00:00");
  });
});

describe("localDateTimeIn", () => {
  it("returns the date and time in the time zone, not in UTC", () => {
    // 20:00 UTC on 26 Sep 2026 is 06:00 on 27 Sep in Melbourne (AEST, UTC+10).
    expect(localDateTimeIn(timeZoneNamed("Australia/Melbourne"), new Date("2026-09-26T20:00:00Z"))).toEqual({
      date: { year: 2026, month: 9, day: 27 },
      time: { hour: 6, minute: 0 },
    });
  });
});

describe("toUtcMoment", () => {
  it("uses the time zone's offset", () => {
    // Iran is UTC+3:30, with no daylight saving.
    const utcDate = toUtcMoment({ year: 2026, month: 9, day: 23 }, { hour: 20, minute: 0 }, timeZoneNamed("Asia/Tehran"));
    expect(utcDate.toISOString()).toBe("2026-09-23T16:30:00.000Z");
  });

  it("uses the daylight saving offset on that day", () => {
    // 29 Nov 2026 in Melbourne is AEDT, UTC+11.
    const timeZone = timeZoneNamed("Australia/Melbourne");
    expect(toUtcMoment({ year: 2026, month: 11, day: 29 }, { hour: 23, minute: 59 }, timeZone).toISOString()).toBe(
      "2026-11-29T12:59:00.000Z",
    );
    // 21 Sep 2026 in Melbourne is AEST, UTC+10.
    expect(toUtcMoment({ year: 2026, month: 9, day: 21 }, { hour: 12, minute: 0 }, timeZone).toISOString()).toBe(
      "2026-09-21T02:00:00.000Z",
    );
  });
});
