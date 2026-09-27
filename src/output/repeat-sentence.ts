import type { CalendarEvent } from "../domain/calendar-event/calendar-event";
import type {
  MonthlyDay,
  RepeatEnd,
  RepeatPattern,
  WeekOfMonth,
} from "../domain/calendar-event/repeat";
import type { DateOnly, Weekday } from "../generic/date-time/date-only";
import { fillPlaceholders } from "../generic/text/fill-placeholders";
import type { BotMessageId } from "../i18n/bot-message";
import type { SupportedLanguage } from "../i18n/supported-language";
import { translate } from "../i18n/translation";
import { formatDateWithYear, formatWeekdayName } from "./localized-date-time";
import {
  formatNumber,
  formatTimeSpan,
  type TimeUnit,
} from "./localized-number";

const EVERY_ONE_UNIT: Record<TimeUnit, BotMessageId> = {
  day: "REPEAT_EVERY_DAY",
  week: "REPEAT_EVERY_WEEK",
  month: "REPEAT_EVERY_MONTH",
  year: "REPEAT_EVERY_YEAR",
};

const EVERY_N_UNITS: Record<TimeUnit, BotMessageId> = {
  day: "REPEAT_EVERY_N_DAYS",
  week: "REPEAT_EVERY_N_WEEKS",
  month: "REPEAT_EVERY_N_MONTHS",
  year: "REPEAT_EVERY_N_YEARS",
};

const ON_WEEK_OF_MONTH: Record<WeekOfMonth, BotMessageId> = {
  1: "REPEAT_MONTHLY_ON_FIRST",
  2: "REPEAT_MONTHLY_ON_SECOND",
  3: "REPEAT_MONTHLY_ON_THIRD",
  4: "REPEAT_MONTHLY_ON_FOURTH",
  last: "REPEAT_MONTHLY_ON_LAST",
};

// Returns a sentence about the event's repeat, in the language, e.g.
// "Repeats every 2 weeks on Monday and Wednesday, until Jan 5, 2027", or null
// for a one-off event.
export function repeatSentenceOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
): string | null {
  const repeat = calendarEvent.repeat;
  if (repeat === null) {
    return null;
  }
  const patternPhrase = patternPhraseOf(repeat.pattern, language);
  const endPhrase = endPhraseOf(repeat.end, language);
  return endPhrase === null
    ? textOf("REPEAT_SENTENCE", [patternPhrase], language)
    : textOf("REPEAT_SENTENCE_WITH_END", [patternPhrase, endPhrase], language);
}

// Returns e.g. "every Thursday" or "on the first Friday of every month".
function patternPhraseOf(
  pattern: RepeatPattern,
  language: SupportedLanguage,
): string {
  switch (pattern.frequency) {
    case "daily":
      return everyPhraseOf("day", pattern.interval, language);
    case "weekly":
      return weeklyPhraseOf(pattern.weekdays, pattern.interval, language);
    case "monthly":
      return monthlyPhraseOf(
        pattern.dayOfMonth,
        everyPhraseOf("month", pattern.interval, language),
        language,
      );
    case "yearly":
      return everyPhraseOf("year", pattern.interval, language);
  }
}

// Returns e.g. "every week", "every 2 weeks", "every Monday and Wednesday" or
// "every 2 weeks on Monday and Wednesday".
function weeklyPhraseOf(
  weekdays: Weekday[],
  interval: number,
  language: SupportedLanguage,
): string {
  if (weekdays.length === 0) {
    return everyPhraseOf("week", interval, language);
  }
  const weekdayList = weekdayListOf(weekdays, language);
  return interval === 1
    ? textOf("REPEAT_WEEKLY_ON", [weekdayList], language)
    : textOf(
        "REPEAT_EVERY_N_WEEKS_ON",
        [formatTimeSpan(interval, "week", language), weekdayList],
        language,
      );
}

// Returns e.g. "every month", "on day 15 of every month" or "on the first
// Friday of every 2 months".
function monthlyPhraseOf(
  dayOfMonth: MonthlyDay,
  everyMonthPhrase: string,
  language: SupportedLanguage,
): string {
  switch (dayOfMonth.kind) {
    case "same-as-first-date":
      return everyMonthPhrase;
    case "fixed-day":
      return textOf(
        "REPEAT_MONTHLY_ON_DAY",
        [formatNumber(dayOfMonth.day, language), everyMonthPhrase],
        language,
      );
    case "weekday-of-month":
      return textOf(
        ON_WEEK_OF_MONTH[dayOfMonth.week],
        [weekdayListOf(dayOfMonth.weekdays, language), everyMonthPhrase],
        language,
      );
  }
}

// Returns e.g. "until Jan 5, 2027" or "4 times", or null for no end.
function endPhraseOf(
  repeatEnd: RepeatEnd<DateOnly>,
  language: SupportedLanguage,
): string | null {
  switch (repeatEnd.kind) {
    case "never":
      return null;
    case "until":
      return textOf(
        "REPEAT_UNTIL",
        [formatDateWithYear(repeatEnd.date, language)],
        language,
      );
    case "after":
      return textOf(
        repeatEnd.times === 1 ? "REPEAT_ONE_TIME" : "REPEAT_TIMES",
        [formatNumber(repeatEnd.times, language)],
        language,
      );
  }
}

// Returns e.g. "every day" or "every 3 days".
function everyPhraseOf(
  timeUnit: TimeUnit,
  interval: number,
  language: SupportedLanguage,
): string {
  return interval === 1
    ? translate(EVERY_ONE_UNIT[timeUnit], language)
    : textOf(
        EVERY_N_UNITS[timeUnit],
        [formatTimeSpan(interval, timeUnit, language)],
        language,
      );
}

// Returns e.g. "Monday and Wednesday".
function weekdayListOf(
  weekdays: Weekday[],
  language: SupportedLanguage,
): string {
  return new Intl.ListFormat(language, {
    style: "long",
    type: "conjunction",
  }).format(weekdays.map((weekday) => formatWeekdayName(weekday, language)));
}

function textOf(
  botMessageId: BotMessageId,
  values: string[],
  language: SupportedLanguage,
): string {
  return fillPlaceholders(translate(botMessageId, language), values);
}
