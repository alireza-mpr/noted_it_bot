import { appConfig } from "../appConfig/appConfig";

// Converts a wall-clock date/time in `timeZone` to the equivalent UTC Date,
// without any external library. Standard trick: format the same instant in
// both the target zone and UTC, and use the difference as the zone's offset
// at that instant (correctly handles DST, since it's computed per-instant).
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

// The event's timezone hint as a canonical IANA name ("Iran" becomes
// "Asia/Tehran"), appConfig.defaultTimezone when there is none, or null when Intl doesn't
// recognise it ("Iran Standard Time"), so the caller can decline the event.
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

// Today's calendar date in the given timezone, as a local-midnight Date.
export function todayIn(timeZone: string, now: Date): Date {
  const nowInZone = new Date(now.toLocaleString("en-US", { timeZone }));
  return new Date(nowInZone.getFullYear(), nowInZone.getMonth(), nowInZone.getDate());
}

// The weekday ("MO".."SU") a date falls on, or null if the date doesn't exist
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

// Picks the year for a date written without one, in any calendar. currentYear
// is today's year in the message's calendar, and toGregorian maps a candidate
// year to that date in Gregorian (null if it doesn't exist that year). When
// the message states the weekday ("Saturday 26 Sep"), use the year that puts
// the date on it: this year or next year, or last year only when that date is
// within the last two months ("Saturday 26 Dec" forwarded in early January).
// Otherwise, with no weekday or none that fits, the current year, even if the
// date has passed; the caption then says so.
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

// Whether a calendar date is before today in the given timezone.
export function isBeforeToday(
  year: number,
  month: number,
  day: number,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  return new Date(year, month - 1, day) < todayIn(timeZone, now);
}
