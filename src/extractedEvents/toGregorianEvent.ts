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

// Calendar files and links only take Gregorian dates, so every event is
// converted into this one.
const OUTPUT_CALENDAR = new GregorianCalendar();

// The calendars a message may be written in: the date library's id, and the
// names the model may give it (it names the calendar freely, "Solar Hijri").
// Only calendars whose years are plain numbers are listed; Japanese, whose
// years count within eras, is not. A bare "Hijri" is deliberately missing: it
// means the solar calendar in Iran and the lunar one in Arab countries.
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

// A date in `calendar` as a Gregorian day, or null when it doesn't exist (the
// library would clamp 30 Esfand in a common year).
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

// The model copies a date as written and names its calendar. This is the one
// place dates become Gregorian, with a year, whatever calendar they came in:
// - a start date with no year gets one from pickYear, counted in its own
//   calendar ("Thursday 9 Mehr": this Persian year, or the one it fits);
// - a repeat's end date with no year takes the start's year (or today's, with
//   no start), and the next one if it would fall before it.
// "Today" is in the event's zone (the default zone when it gives none).
// Returns null when the dates can't be converted reliably: a calendar not
// listed above, a written date with no calendar named, a day that doesn't
// exist, or a monthly/yearly repeat in another calendar, whose months don't
// line up with Gregorian ones.
export function toGregorianEvent(event: ExtractedEvent, now: Date = new Date()): ExtractedEvent | null {
  const recurrence = event.recurrence ?? null;
  const writesStart = event.month !== null && event.day !== null;
  const writesUntil = recurrence?.until_month != null && recurrence.until_day != null;

  if (event.calendar === null) {
    // No calendar means no date was written, so a weekday pattern has nothing to
    // convert. A written date with no calendar can't be trusted, and guessing
    // Gregorian would silently misplace a Solar Hijri one.
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
