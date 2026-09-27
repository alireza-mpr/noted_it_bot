import {
  CalendarDate,
  GregorianCalendar,
  createCalendar,
  toCalendar,
  type Calendar,
  type CalendarIdentifier,
} from "@internationalized/date";
import { addMonths, compareDates, weekdayOf, type DateOnly, type Weekday } from "../time/dateOnly";
import type { ExtractedEvent } from "./extractedEvent";

// Calendar files and links only accept Gregorian dates. So every date is
// converted to this calendar.
const OUTPUT_CALENDAR = new GregorianCalendar();

// The calendars a message can use: the date library's id, and the names the
// model may give it (the model names the calendar freely, for example
// "Solar Hijri").
// - Only calendars with plain-number years are listed. Japanese is not: its
//   years count within eras.
// - A plain "Hijri" is missing on purpose: in Iran it means the solar
//   calendar, in Arab countries the lunar one.
const CALENDAR_NAMES: Record<string, string[]> = {
  gregory: ["gregorian", "western", "christian"],
  persian: ["jalali", "solar hijri", "shamsi", "iranian"],
  "islamic-umalqura": ["islamic", "lunar hijri", "hijri qamari", "umm al-qura"],
  "islamic-civil": ["islamic civil", "tabular islamic"],
  hebrew: ["jewish"],
  buddhist: ["thai", "thai solar"],
  indian: ["indian national", "saka"],
  coptic: [],
  ethiopic: ["ethiopian"],
};

function calendarNamed(name: string): Calendar | null {
  const wanted = name.trim().toLowerCase();
  const id = Object.keys(CALENDAR_NAMES).find(
    (candidate) => candidate === wanted || CALENDAR_NAMES[candidate].includes(wanted),
  );
  return id ? createCalendar(id as CalendarIdentifier) : null;
}

// Converts a date in `calendar` to Gregorian. Returns null if the date does
// not exist. (The library would silently change 30 Esfand in a common year to
// another day.)
function inGregorian(calendar: Calendar, year: number, month: number, day: number): DateOnly | null {
  const date = new CalendarDate(calendar, year, month, day);
  if (date.year !== year || date.month !== month || date.day !== day) {
    return null;
  }
  const { year: y, month: m, day: d } = toCalendar(date, OUTPUT_CALENDAR);
  return { year: y, month: m, day: d };
}

// Picks the year for a date written without one, in any calendar.
// - currentYear: today's year in the message's calendar.
// - toGregorian: converts a candidate year's date to Gregorian (null if that
//   date does not exist in that year).
// The rule:
// 1. If the message states the weekday ("Saturday 26 Sep"): use the year
//    where the date falls on that weekday. Try this year, then next year, then
//    last year (only if that date was in the last two months, for example
//    "Saturday 26 Dec" forwarded in early January).
// 2. Otherwise (no weekday, or no year fits): the current year, even if the
//    date has passed. The caption then says so.
function pickYear(
  currentYear: number,
  toGregorian: (year: number) => DateOnly | null,
  today: DateOnly,
  weekday: Weekday | null,
): number {
  if (!weekday) {
    return currentYear;
  }
  const twoMonthsAgo = addMonths(today, -2);
  const fits = (candidate: number, recentOnly: boolean) => {
    const date = toGregorian(candidate);
    if (!date || weekdayOf(date) !== weekday) {
      return false;
    }
    return !recentOnly || compareDates(date, twoMonthsAgo) >= 0;
  };
  if (fits(currentYear, false)) return currentYear;
  if (fits(currentYear + 1, false)) return currentYear + 1;
  if (fits(currentYear - 1, true)) return currentYear - 1;
  return currentYear;
}

// The event's written dates, in Gregorian, with years. null when not written.
export interface GregorianDates {
  start: DateOnly | null;
  until: DateOnly | null;
}

// The model copies dates as written and names their calendar. This is the one
// place where dates become Gregorian, with a year, for every calendar:
// - A start date with no year gets one from pickYear, counted in its own
//   calendar ("Thursday 9 Mehr": this Persian year, or the year it fits).
// - A repeat's end date with no year gets the start's year (or today's year,
//   if there is no start). If that puts it before the start, it gets the next
//   year.
//
// Returns null when the dates cannot be converted safely:
// - the calendar is not in the list above;
// - a date is written, but no calendar is named;
// - the day does not exist;
// - a monthly or yearly repeat in another calendar (its months do not match
//   Gregorian months).
export function toGregorianDates(event: ExtractedEvent, today: DateOnly): GregorianDates | null {
  const rule = event.recurrence ?? null;
  const startDay = event.month !== null && event.day !== null ? { month: event.month, day: event.day } : null;
  const untilDay =
    rule?.until_month != null && rule.until_day != null ? { month: rule.until_month, day: rule.until_day } : null;

  if (event.calendar === null) {
    // No calendar means no date was written. A written date with no calendar
    // cannot be trusted: guessing Gregorian would silently move a Solar Hijri
    // date.
    const writesDate =
      event.month !== null || event.day !== null || rule?.until_month != null || rule?.until_day != null;
    return writesDate ? null : { start: null, until: null };
  }

  const calendar = calendarNamed(event.calendar);
  if (!calendar) {
    return null;
  }
  const sameMonths = calendar.identifier === OUTPUT_CALENDAR.identifier;
  if (!sameMonths && (rule?.frequency === "monthly" || rule?.frequency === "yearly")) {
    return null;
  }

  // Today, and the start date, in the message's own calendar.
  const todayInCalendar = toCalendar(new CalendarDate(today.year, today.month, today.day), calendar);
  let startInCalendar: DateOnly = todayInCalendar;

  let start: DateOnly | null = null;
  if (startDay) {
    const year =
      event.year ??
      pickYear(
        todayInCalendar.year,
        (candidate) => inGregorian(calendar, candidate, startDay.month, startDay.day),
        today,
        event.weekday ?? null,
      );
    start = inGregorian(calendar, year, startDay.month, startDay.day);
    if (!start) {
      return null;
    }
    startInCalendar = { year, ...startDay };
  }

  let until: DateOnly | null = null;
  if (untilDay) {
    const endsBeforeStart =
      untilDay.month < startInCalendar.month ||
      (untilDay.month === startInCalendar.month && untilDay.day < startInCalendar.day);
    const year = rule?.until_year ?? startInCalendar.year + (endsBeforeStart ? 1 : 0);
    until = inGregorian(calendar, year, untilDay.month, untilDay.day);
    if (!until) {
      return null;
    }
  }

  return { start, until };
}
