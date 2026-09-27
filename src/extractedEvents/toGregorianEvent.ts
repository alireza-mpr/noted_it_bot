import {
  CalendarDate,
  GregorianCalendar,
  createCalendar,
  toCalendar,
  type Calendar,
  type CalendarIdentifier,
} from "@internationalized/date";
import { pickYear, resolveTimezone, todayIn, type CalendarDay } from "../time/timezone";
import type { ExtractedEvent } from "./extractedEvent";

// Calendar files and links only accept Gregorian dates. So every event is
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

// Converts a date in `calendar` to a Gregorian day. Returns null if the date
// does not exist. (The library would silently change 30 Esfand in a common
// year to another day.)
function inGregorian(calendar: Calendar, year: number, month: number, day: number): CalendarDay | null {
  const date = new CalendarDate(calendar, year, month, day);
  if (date.year !== year || date.month !== month || date.day !== day) {
    return null;
  }
  const { year: y, month: m, day: d } = toCalendar(date, OUTPUT_CALENDAR);
  return { year: y, month: m, day: d };
}

const before = (a: { month: number; day: number }, b: { month: number; day: number }) =>
  a.month < b.month || (a.month === b.month && a.day < b.day);

// The model copies the date as written and names its calendar. This function
// is the one place where dates become Gregorian, with a year, for every
// calendar:
// - A start date with no year gets one from pickYear, counted in its own
//   calendar ("Thursday 9 Mehr": this Persian year, or the year it fits).
// - A repeat's end date with no year gets the start's year (or today's year,
//   if there is no start). If that puts it before the start, it gets the next
//   year.
// "Today" is in the event's zone (the default zone if it has none).
//
// Returns null when the dates cannot be converted safely:
// - the calendar is not in the list above;
// - a date is written, but no calendar is named;
// - the day does not exist;
// - a monthly or yearly repeat in another calendar (its months do not match
//   Gregorian months).
export function toGregorianEvent(event: ExtractedEvent, now: Date = new Date()): ExtractedEvent | null {
  const recurrence = event.recurrence ?? null;
  const writesStart = event.month !== null && event.day !== null;
  const writesUntil = recurrence?.until_month != null && recurrence.until_day != null;

  if (event.calendar === null) {
    // No calendar means no date was written. So a weekday pattern has nothing
    // to convert. A written date with no calendar cannot be trusted: guessing
    // Gregorian would silently move a Solar Hijri date.
    const writesDate =
      event.month !== null || event.day !== null || recurrence?.until_month != null || recurrence?.until_day != null;
    return writesDate ? null : event;
  }

  const calendar = calendarNamed(event.calendar);
  if (!calendar) {
    return null;
  }
  const sameMonths = calendar.identifier === OUTPUT_CALENDAR.identifier;
  if (!sameMonths && (recurrence?.frequency === "monthly" || recurrence?.frequency === "yearly")) {
    return null;
  }

  const timeZone = resolveTimezone(event.timezone_hint) ?? "UTC";
  const today = todayIn(timeZone, now);
  const todayInCalendar = toCalendar(
    new CalendarDate(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    calendar,
  );

  let start: CalendarDay | null = null;
  let startInCalendar: CalendarDay = todayInCalendar;
  if (writesStart) {
    const month = event.month!;
    const day = event.day!;
    const year =
      event.year ??
      pickYear(todayInCalendar.year, (candidate) => inGregorian(calendar, candidate, month, day), today, event.weekday ?? null);
    start = inGregorian(calendar, year, month, day);
    if (!start) {
      return null;
    }
    startInCalendar = { year, month, day };
  }

  let convertedRecurrence = recurrence;
  if (recurrence && writesUntil) {
    const untilDay = { month: recurrence.until_month!, day: recurrence.until_day! };
    const untilYear =
      recurrence.until_year ?? startInCalendar.year + (before(untilDay, startInCalendar) ? 1 : 0);
    const until = inGregorian(calendar, untilYear, untilDay.month, untilDay.day);
    if (!until) {
      return null;
    }
    convertedRecurrence = { ...recurrence, until_year: until.year, until_month: until.month, until_day: until.day };
  }

  return {
    ...event,
    calendar: OUTPUT_CALENDAR.identifier,
    year: start?.year ?? event.year,
    month: start?.month ?? event.month,
    day: start?.day ?? event.day,
    recurrence: convertedRecurrence,
  };
}
