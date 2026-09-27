import type { CalendarEvent } from "../domain/calendar-event/calendar-event";
import type {
  MonthlyDay,
  RepeatEnd,
  RepeatPattern,
  WeekOfMonth,
} from "../domain/calendar-event/repeat";
import type { DateOnly, Weekday } from "../generic/date-time/date-only";
import { formatDateWithYear, formatWeekdayName } from "./localized-date-time";

// The repeat sentence is part of the event, not one of the bot's messages, so
// it is always in English.
const SENTENCE_LANGUAGE = "en";

const WEEK_OF_MONTH_NAMES: Record<WeekOfMonth, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  last: "last",
};

// Returns an English sentence about the event's repeat, e.g. "Repeats every 2
// weeks on Monday and Wednesday, until Jan 5, 2027", or null for a one-off
// event.
export function repeatSentenceOf(calendarEvent: CalendarEvent): string | null {
  const repeat = calendarEvent.repeat;
  if (repeat === null) {
    return null;
  }
  return `Repeats ${patternPhraseOf(repeat.pattern)}${endPhraseOf(repeat.end)}`;
}

// Returns e.g. "every Thursday" or "on the first Friday of every month".
function patternPhraseOf(pattern: RepeatPattern): string {
  const interval = pattern.interval;
  const everyUnit = (unit: string) =>
    interval === 1 ? `every ${unit}` : `every ${interval} ${unit}s`;
  switch (pattern.frequency) {
    case "daily":
      return everyUnit("day");
    case "weekly":
      if (pattern.weekdays.length === 0) {
        return everyUnit("week");
      }
      return interval === 1
        ? `every ${weekdayListOf(pattern.weekdays)}`
        : `every ${interval} weeks on ${weekdayListOf(pattern.weekdays)}`;
    case "monthly":
      return monthlyPhraseOf(pattern.dayOfMonth, everyUnit("month"));
    case "yearly":
      return everyUnit("year");
  }
}

// Returns e.g. "every month", "on the 15th of every month" or "on the first
// Friday of every 2 months".
function monthlyPhraseOf(dayOfMonth: MonthlyDay, everyMonth: string): string {
  switch (dayOfMonth.kind) {
    case "same-as-first-date":
      return everyMonth;
    case "fixed-day":
      return `on the ${ordinalNumberOf(dayOfMonth.day)} of ${everyMonth}`;
    case "weekday-of-month":
      return `on the ${WEEK_OF_MONTH_NAMES[dayOfMonth.week]} ${weekdayListOf(dayOfMonth.weekdays)} of ${everyMonth}`;
  }
}

// Returns e.g. ", until Jan 5, 2027" or ", 4 times", or "" for no end.
function endPhraseOf(repeatEnd: RepeatEnd<DateOnly>): string {
  switch (repeatEnd.kind) {
    case "never":
      return "";
    case "until":
      return `, until ${formatDateWithYear(repeatEnd.date, SENTENCE_LANGUAGE)}`;
    case "after":
      return `, ${repeatEnd.times} ${repeatEnd.times === 1 ? "time" : "times"}`;
  }
}

// Returns e.g. "Monday and Wednesday".
function weekdayListOf(weekdays: Weekday[]): string {
  return new Intl.ListFormat(SENTENCE_LANGUAGE, {
    style: "long",
    type: "conjunction",
  }).format(
    weekdays.map((weekday) => formatWeekdayName(weekday, SENTENCE_LANGUAGE)),
  );
}

// Returns e.g. "1st", "2nd", "11th", "23rd".
function ordinalNumberOf(value: number): string {
  const lastTwoDigits = value % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${value}th`;
  }
  const suffixByLastDigit: Record<number, string> = {
    1: "st",
    2: "nd",
    3: "rd",
  };
  return `${value}${suffixByLastDigit[value % 10] ?? "th"}`;
}
