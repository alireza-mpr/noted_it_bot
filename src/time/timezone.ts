import { appConfig } from "../appConfig/appConfig";

// Converts a local date and time in `timeZone` to a UTC Date, with no
// external library. The trick: format the same moment in the target zone and
// in UTC. The difference is the zone's offset at that moment. This handles
// daylight saving, because the offset is found for that exact moment.
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));

  const inZone = new Date(asUtc.toLocaleString("en-US", { timeZone }));
  const inUtc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = inUtc.getTime() - inZone.getTime();

  return new Date(asUtc.getTime() + offsetMs);
}

// Returns the event's zone hint as a standard IANA name ("Iran" becomes
// "Asia/Tehran"). With no hint: appConfig.defaultTimezone. If Intl does not
// know the name ("Iran Standard Time"): null, so the caller can decline the
// event.
export function resolveTimezone(timezoneHint: string | null): string | null {
  if (!timezoneHint) {
    return appConfig.defaultTimezone;
  }
  try {
    return new Intl.DateTimeFormat("en", {
      timeZone: timezoneHint,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const WEEKDAY_BY_INDEX = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

// Today's date in the given timezone, as a Date at local midnight.
export function todayIn(timeZone: string, now: Date): Date {
  const nowInZone = new Date(now.toLocaleString("en-US", { timeZone }));
  return new Date(nowInZone.getFullYear(), nowInZone.getMonth(), nowInZone.getDate());
}

// The weekday ("MO".."SU") of a date, or null if the date does not exist
// (29 Feb in a common year).
export function weekdayOf(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 ? WEEKDAY_BY_INDEX[date.getUTCDay()] : null;
}

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
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
export function pickYear(
  currentYear: number,
  toGregorian: (year: number) => CalendarDay | null,
  today: Date,
  weekday: string | null,
): number {
  if (!weekday) {
    return currentYear;
  }
  const twoMonthsAgo = new Date(today);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const fits = (candidate: number, recentOnly: boolean) => {
    const date = toGregorian(candidate);
    if (!date || weekdayOf(date.year, date.month, date.day) !== weekday) {
      return false;
    }
    return !recentOnly || new Date(date.year, date.month - 1, date.day) >= twoMonthsAgo;
  };
  if (fits(currentYear, false)) return currentYear;
  if (fits(currentYear + 1, false)) return currentYear + 1;
  if (fits(currentYear - 1, true)) return currentYear - 1;
  return currentYear;
}

// Whether a date is before today in the given timezone.
export function isBeforeToday(
  year: number,
  month: number,
  day: number,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  return new Date(year, month - 1, day) < todayIn(timeZone, now);
}
