const DEFAULT_TIMEZONE = "Australia/Melbourne";

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

// The model's timezone hint as a canonical IANA name ("Iran" becomes
// "Asia/Tehran"), the default when there is none, or null when Intl doesn't
// recognise it ("Iran Standard Time"), so the caller can decline the event.
export function resolveTimezone(timezoneHint: string | null): string | null {
  if (!timezoneHint) {
    return DEFAULT_TIMEZONE;
  }
  try {
    return new Intl.DateTimeFormat("en", {
      timeZone: timezoneHint,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

// The extracted year can be null (the model isn't told to guess a year that
// wasn't stated). Assume the next upcoming occurrence: this year, unless that
// date has already passed in the event's timezone, in which case next year.
export function resolveYear(
  year: number | null,
  month: number,
  day: number,
  timeZone: string,
  now: Date = new Date()
): number {
  if (year !== null) {
    return year;
  }

  const nowInZone = new Date(now.toLocaleString("en-US", { timeZone }));
  const currentYear = nowInZone.getFullYear();

  const candidate = new Date(currentYear, month - 1, day);
  const today = new Date(nowInZone.getFullYear(), nowInZone.getMonth(), nowInZone.getDate());

  return candidate < today ? currentYear + 1 : currentYear;
}
