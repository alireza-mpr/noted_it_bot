import { describe, expect, it } from "vitest";
import { repeatWorksInCalendar } from "../../../../src/domain/calendar-event/repeat-calendar-rule";

describe("repeatWorksInCalendar", () => {
  it("allows every repeat in the Gregorian calendar", () => {
    expect(repeatWorksInCalendar("gregory", { frequency: "yearly", interval: 1 })).toBe(true);
  });

  it("allows only daily and weekly repeats in other calendars", () => {
    expect(repeatWorksInCalendar("persian", { frequency: "daily", interval: 1 })).toBe(true);
    expect(repeatWorksInCalendar("persian", { frequency: "weekly", interval: 1, weekdays: ["TH"] })).toBe(true);
    expect(repeatWorksInCalendar("persian", { frequency: "yearly", interval: 1 })).toBe(false);
    expect(
      repeatWorksInCalendar("hebrew", { frequency: "monthly", interval: 1, dayOfMonth: { kind: "fixed-day", day: 1 } }),
    ).toBe(false);
  });
});
