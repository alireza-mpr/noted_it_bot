import type { DateOnly } from "./date-only";
import type { TimeOfDay } from "./time-of-day";

declare const parsedTimeZone: unique symbol;

// Represents an IANA time zone name in its standard spelling, e.g.
// "Asia/Tehran". Only parseTimeZoneName creates one.
export type IanaTimeZone = string & { readonly [parsedTimeZone]: true };

// Represents a date and a time of day in a time zone.
export interface LocalDateTime {
  date: DateOnly;
  time: TimeOfDay;
}

// Returns the standard name of a time zone, or null if the name is not a
// time zone. Other names of a time zone are accepted, e.g. "Iran" gives
// "Asia/Tehran".
export function parseTimeZoneName(name: string): IanaTimeZone | null {
  try {
    return new Intl.DateTimeFormat("en", {
      timeZone: name.trim(),
    }).resolvedOptions().timeZone as IanaTimeZone;
  } catch {
    return null;
  }
}

// Returns the date and the time of day in the time zone at a moment.
export function localDateTimeIn(timeZone: IanaTimeZone, moment: Date): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(moment);
  const numberOf = (partType: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === partType)?.value);
  return {
    date: {
      year: numberOf("year"),
      month: numberOf("month"),
      day: numberOf("day"),
    },
    time: { hour: numberOf("hour"), minute: numberOf("minute") },
  };
}

// Returns the moment when a date and time of day happen in the time zone.
export function toUtcMoment(
  date: DateOnly,
  time: TimeOfDay,
  timeZone: IanaTimeZone,
): Date {
  const asIfUtc = new Date(
    Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute),
  );
  // The offset is found at this moment, so daylight saving is included.
  const shownInTimeZone = new Date(asIfUtc.toLocaleString("en-US", { timeZone }));
  const shownInUtc = new Date(asIfUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const timeZoneOffsetMs = shownInTimeZone.getTime() - shownInUtc.getTime();
  return new Date(asIfUtc.getTime() - timeZoneOffsetMs);
}
