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

function todayIn(timeZone: string, now: Date): Date {
  const nowInZone = new Date(now.toLocaleString("en-US", { timeZone }));
  return new Date(nowInZone.getFullYear(), nowInZone.getMonth(), nowInZone.getDate());
}

// The weekday ("MO".."SU") a date falls on, or null if the date doesn't exist
// (29 Feb in a common year).
export function weekdayOf(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 ? WEEKDAY_BY_INDEX[date.getUTCDay()] : null;
}

// The extracted year can be null (the model isn't told to guess a year that
// wasn't stated). When the message states the weekday ("Saturday 26 Sep"),
// use the year that puts the date on it: this year or next year, or last
// year only when that date is within the last two months ("Saturday 26 Dec"
// forwarded in early January). Otherwise, with no weekday or none that fits,
// the current year, even if the date has passed; the caption then says so.
export function resolveYear(
  year: number | null,
  month: number,
  day: number,
  timeZone: string,
  now: Date = new Date(),
  weekday: string | null = null,
): number {
  if (year !== null) {
    return year;
  }

  const today = todayIn(timeZone, now);
  const currentYear = today.getFullYear();

  if (weekday) {
    const twoMonthsAgo = new Date(today);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const candidates = [currentYear, currentYear + 1];
    if (new Date(currentYear - 1, month - 1, day) >= twoMonthsAgo) {
      candidates.push(currentYear - 1);
    }
    const fitting = candidates.find((candidate) => weekdayOf(candidate, month, day) === weekday);
    if (fitting !== undefined) {
      return fitting;
    }
  }

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
