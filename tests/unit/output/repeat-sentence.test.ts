import { describe, expect, it } from "vitest";
import type { Repeat } from "../../../src/domain/calendar-event/repeat";
import type { DateOnly } from "../../../src/generic/date-time/date-only";
import type { SupportedLanguage } from "../../../src/domain/user/supported-language";
import { repeatSentenceOf } from "../../../src/output/repeat-sentence";
import { calendarEventWith } from "./calendar-event-with";

const NEVER = { kind: "never" } as const;

// Returns the repeat sentence of an event with the given repeat.
function sentenceOf(repeat: Repeat<DateOnly>, language: SupportedLanguage = "en"): string | null {
  return repeatSentenceOf(calendarEventWith({ repeat }), language);
}

describe("repeatSentenceOf", () => {
  it("is null for a one-off event", () => {
    expect(repeatSentenceOf(calendarEventWith(), "en")).toBeNull();
  });

  it("names the weekday of a weekly repeat", () => {
    expect(sentenceOf({ pattern: { frequency: "weekly", interval: 1, weekdays: ["TH"] }, end: NEVER })).toBe(
      "Repeats every Thursday",
    );
  });

  it("names several weekdays, the interval and the end date", () => {
    const repeat: Repeat<DateOnly> = {
      pattern: { frequency: "weekly", interval: 2, weekdays: ["MO", "WE"] },
      end: { kind: "until", date: { year: 2027, month: 1, day: 5 } },
    };
    expect(sentenceOf(repeat)).toBe("Repeats every 2 weeks on Monday and Wednesday, until Jan 5, 2027");
  });

  it("names the week of the month and the number of times", () => {
    const firstFriday: Repeat<DateOnly> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "weekday-of-month", week: 1, weekdays: ["FR"] } },
      end: { kind: "after", times: 4 },
    };
    const lastFriday: Repeat<DateOnly> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "weekday-of-month", week: "last", weekdays: ["FR"] } },
      end: { kind: "after", times: 1 },
    };
    expect(sentenceOf(firstFriday)).toBe("Repeats on the first Friday of every month, 4 times");
    expect(sentenceOf(lastFriday)).toBe("Repeats on the last Friday of every month, 1 time");
  });

  it("names a day of the month by its number", () => {
    const repeat: Repeat<DateOnly> = {
      pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "fixed-day", day: 15 } },
      end: NEVER,
    };
    expect(sentenceOf(repeat)).toBe("Repeats on day 15 of every month");
  });

  it("writes daily, weekly, monthly and yearly repeats with no named days", () => {
    expect(sentenceOf({ pattern: { frequency: "daily", interval: 1 }, end: NEVER })).toBe("Repeats every day");
    expect(sentenceOf({ pattern: { frequency: "daily", interval: 3 }, end: NEVER })).toBe("Repeats every 3 days");
    expect(sentenceOf({ pattern: { frequency: "weekly", interval: 2, weekdays: [] }, end: NEVER })).toBe("Repeats every 2 weeks");
    expect(
      sentenceOf({ pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "same-as-first-date" } }, end: NEVER }),
    ).toBe("Repeats every month");
    expect(sentenceOf({ pattern: { frequency: "yearly", interval: 1 }, end: NEVER })).toBe("Repeats every year");
  });
});

describe("repeatSentenceOf, in other languages", () => {
  const EVERY_DAY: Repeat<DateOnly> = { pattern: { frequency: "daily", interval: 1 }, end: NEVER };
  const EVERY_2_WEEKS_UNTIL: Repeat<DateOnly> = {
    pattern: { frequency: "weekly", interval: 2, weekdays: ["MO", "WE"] },
    end: { kind: "until", date: { year: 2027, month: 1, day: 5 } },
  };
  const ALL_PATTERNS: Repeat<DateOnly>[] = [
    EVERY_DAY,
    EVERY_2_WEEKS_UNTIL,
    { pattern: { frequency: "daily", interval: 3 }, end: { kind: "after", times: 12 } },
    { pattern: { frequency: "weekly", interval: 1, weekdays: ["TH"] }, end: { kind: "after", times: 1 } },
    { pattern: { frequency: "monthly", interval: 2, dayOfMonth: { kind: "fixed-day", day: 15 } }, end: NEVER },
    { pattern: { frequency: "monthly", interval: 1, dayOfMonth: { kind: "weekday-of-month", week: "last", weekdays: ["FR"] } }, end: NEVER },
    { pattern: { frequency: "yearly", interval: 1 }, end: NEVER },
  ];

  it("writes the Persian sentence (the bug from the screenshot)", () => {
    expect(sentenceOf(EVERY_DAY, "fa")).toBe("هر روز تکرار می‌شود");
    expect(sentenceOf(EVERY_2_WEEKS_UNTIL, "fa")).toMatch(/^هر ۲ هفته در روزهای دوشنبه و چهارشنبه تکرار می‌شود، تا .*۲۰۲۷$/);
  });

  it("has no Latin letters or digits in any Persian sentence", () => {
    for (const repeat of ALL_PATTERNS) {
      const persianSentence = sentenceOf(repeat, "fa") ?? "";
      expect(persianSentence, persianSentence).not.toMatch(/[A-Za-z0-9]/);
    }
  });

  it("writes the German sentence", () => {
    expect(sentenceOf(EVERY_2_WEEKS_UNTIL, "de")).toBe("Wiederholt sich alle 2 Wochen am Montag und Mittwoch, bis 5. Jan. 2027");
  });

  it("leaves no placeholder unfilled in any language", () => {
    for (const language of ["fa", "ar", "es", "fr", "de", "it", "pt", "ru", "tr", "zh", "ja", "ko", "hi", "nl", "pl"] as const) {
      for (const repeat of ALL_PATTERNS) {
        expect(sentenceOf(repeat, language), language).not.toMatch(/\{\d+\}/);
      }
    }
  });
});
