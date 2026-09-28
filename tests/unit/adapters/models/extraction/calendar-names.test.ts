import { describe, expect, it } from "vitest";
import { calendarIdNamed } from "../../../../../src/adapters/models/extraction/calendar-names";

describe("calendarIdNamed", () => {
  it("accepts a calendar's id and its other names, in any letter case", () => {
    expect(calendarIdNamed("gregory")).toBe("gregory");
    expect(calendarIdNamed(" Gregorian ")).toBe("gregory");
    expect(calendarIdNamed("Solar Hijri")).toBe("persian");
    expect(calendarIdNamed("jalali")).toBe("persian");
    expect(calendarIdNamed("Jewish")).toBe("hebrew");
  });

  it("gives null for a calendar the bot does not accept", () => {
    expect(calendarIdNamed("Lunar Hijri")).toBeNull();
    expect(calendarIdNamed("japanese")).toBeNull();
  });

  it("gives null for a plain Hijri, which means different calendars in different countries", () => {
    expect(calendarIdNamed("Hijri")).toBeNull();
  });
});
