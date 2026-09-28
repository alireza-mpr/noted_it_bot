import { describe, expect, it } from "vitest";
import type { Repeat } from "../../../../src/domain/calendar-event/repeat";
import { repeatDeclineReason } from "../../../../src/domain/calendar-event/repeat-decline-rule";

// Thursday 24 September 2026.
const THU_SEP_24_2026 = { year: 2026, month: 9, day: 24 };
const CONFIDENT = 0.9;

const WEEKLY_ON_THURSDAY: Repeat<never> = {
  pattern: { frequency: "weekly", interval: 1, weekdays: ["TH"] },
  end: { kind: "never" },
};

describe("repeatDeclineReason", () => {
  it("is null for a valid repeat", () => {
    expect(repeatDeclineReason(WEEKLY_ON_THURSDAY, false, THU_SEP_24_2026, CONFIDENT)).toBeNull();
  });

  it("declines a repeat when the model's confidence is below 0.7", () => {
    expect(repeatDeclineReason(WEEKLY_ON_THURSDAY, true, THU_SEP_24_2026, 0.69)).toBe("low confidence (0.69)");
    expect(repeatDeclineReason(WEEKLY_ON_THURSDAY, true, THU_SEP_24_2026, 0.7)).toBeNull();
  });

  it("declines an interval that is not a whole number of at least 1", () => {
    for (const interval of [0, -1, 1.5]) {
      const repeat = { ...WEEKLY_ON_THURSDAY, pattern: { ...WEEKLY_ON_THURSDAY.pattern, interval } };
      expect(repeatDeclineReason(repeat, true, THU_SEP_24_2026, CONFIDENT), String(interval)).not.toBeNull();
    }
  });

  it("declines a monthly weekday pattern with no weekdays", () => {
    const repeat: Repeat<never> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "weekday-of-month", week: 1, weekdays: [] } },
      end: { kind: "never" },
    };
    expect(repeatDeclineReason(repeat, true, THU_SEP_24_2026, CONFIDENT)).not.toBeNull();
  });

  it("declines a day of the month that no month has", () => {
    const repeat: Repeat<never> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "fixed-day", day: 32 } },
      end: { kind: "never" },
    };
    expect(repeatDeclineReason(repeat, true, THU_SEP_24_2026, CONFIDENT)).not.toBeNull();
  });

  it("declines a number of times below 1", () => {
    expect(repeatDeclineReason({ ...WEEKLY_ON_THURSDAY, end: { kind: "after", times: 0 } }, true, THU_SEP_24_2026, CONFIDENT)).not.toBeNull();
  });

  it("with no start date, declines a pattern that does not say which days", () => {
    const everyWeek: Repeat<never> = { pattern: { frequency: "weekly", interval: 1, weekdays: [] }, end: { kind: "never" } };
    const everyYear: Repeat<never> = { pattern: { frequency: "yearly", interval: 1 }, end: { kind: "never" } };
    expect(repeatDeclineReason(everyWeek, false, THU_SEP_24_2026, CONFIDENT)).not.toBeNull();
    expect(repeatDeclineReason(everyYear, false, THU_SEP_24_2026, CONFIDENT)).not.toBeNull();
    expect(repeatDeclineReason(everyWeek, true, THU_SEP_24_2026, CONFIDENT)).toBeNull();
    expect(repeatDeclineReason(everyYear, true, THU_SEP_24_2026, CONFIDENT)).toBeNull();
  });

  it("declines an end date before the first date", () => {
    const endsBefore = { ...WEEKLY_ON_THURSDAY, end: { kind: "until", date: { year: 2026, month: 9, day: 1 } } } as const;
    expect(repeatDeclineReason(endsBefore, true, THU_SEP_24_2026, CONFIDENT)).toBe("the end date is before the first date");
  });
});
