// A calendar date with no time and no time zone. Months and days start at 1.
export interface DateOnly {
  year: number;
  month: number;
  day: number;
}

// A time of day, 24-hour.
export interface TimeOfDay {
  hour: number;
  minute: number;
}

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

// In the order of Date#getUTCDay().
const WEEKDAY_BY_INDEX: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const MIDNIGHT: TimeOfDay = { hour: 0, minute: 0 };

export function isWeekday(value: string): value is Weekday {
  return (WEEKDAY_BY_INDEX as string[]).includes(value);
}

export function toUtcDate(date: DateOnly, time: TimeOfDay = MIDNIGHT): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute));
}

function fromUtcDate(date: Date): DateOnly {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

// The date, or null if it does not exist (29 Feb in a common year).
export function realDate(year: number, month: number, day: number): DateOnly | null {
  const date = fromUtcDate(toUtcDate({ year, month, day }));
  return date.year === year && date.month === month && date.day === day ? date : null;
}

export function addDays(date: DateOnly, days: number): DateOnly {
  return fromUtcDate(toUtcDate({ ...date, day: date.day + days }));
}

export function addMonths(date: DateOnly, months: number): DateOnly {
  return fromUtcDate(toUtcDate({ ...date, month: date.month + months }));
}

// Negative when a is before b, 0 when equal, positive when a is after b.
export function compareDates(a: DateOnly, b: DateOnly): number {
  return toUtcDate(a).getTime() - toUtcDate(b).getTime();
}

export function weekdayOf(date: DateOnly): Weekday {
  return WEEKDAY_BY_INDEX[toUtcDate(date).getUTCDay()];
}

export function daysInMonth(date: DateOnly): number {
  return new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();
}

// "18:30" becomes { hour: 18, minute: 30 }.
export function parseTime(text: string): TimeOfDay {
  const [hour, minute] = text.split(":").map(Number);
  return { hour, minute };
}

export function isTimeBefore(a: TimeOfDay, b: TimeOfDay): boolean {
  return a.hour * 60 + a.minute < b.hour * 60 + b.minute;
}

// Today's date and the time of day in `timeZone` (not the server's UTC time).
export function nowIn(timeZone: string, now: Date): { date: DateOnly; time: TimeOfDay } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  return {
    date: { year: get("year"), month: get("month"), day: get("day") },
    time: { hour: get("hour"), minute: get("minute") },
  };
}
