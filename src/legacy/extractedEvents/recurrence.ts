import { addDays, daysInMonth, isWeekday, weekdayOf, type DateOnly } from "../time/dateOnly";
import type { Recurrence, Weekday } from "./extractedEvent";

// Below this confidence, a message that looks like a repeat is declined, not
// guessed. A wrong repeat rule would silently fill someone's calendar.
export const RECURRENCE_MIN_CONFIDENCE = 0.7;

const DAY_NAMES: Record<Weekday, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

const ORDINAL_NAMES: Record<number, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last",
};

// Does this day match the pattern's weekdays, ordinal and day of the month?
// (The interval and the end are handled by the calendar app.)
function matches(date: DateOnly, r: Recurrence): boolean {
  const weekday = weekdayOf(date);
  const weekdays = r.weekdays ?? [];

  switch (r.frequency) {
    case "weekly":
      return weekdays.length === 0 || weekdays.includes(weekday);
    case "monthly":
      if (weekdays.length > 0 && r.ordinal != null) {
        if (!weekdays.includes(weekday)) {
          return false;
        }
        return r.ordinal === -1 ? date.day + 7 > daysInMonth(date) : Math.ceil(date.day / 7) === r.ordinal;
      }
      if (r.month_day != null) {
        return date.day === r.month_day;
      }
      return true;
    default:
      return true;
  }
}

// The first day on or after `from` that matches the pattern, or null if none
// does within about two years.
export function firstOccurrence(from: DateOnly, r: Recurrence): DateOnly | null {
  for (let i = 0; i < 800; i++) {
    const candidate = addDays(from, i);
    if (matches(candidate, r)) {
      return candidate;
    }
  }
  return null;
}

// Why a repeat rule cannot be trusted, or null if it is fine. A rule we
// cannot trust is declined, because a wrong one silently fills someone's
// calendar. All date calculations happen in our code, never in the model.
export function repeatRuleProblem(r: Recurrence, confidence: number, hasStartDate: boolean): string | null {
  if (confidence < RECURRENCE_MIN_CONFIDENCE) {
    return `low confidence (${confidence})`;
  }
  if (!["daily", "weekly", "monthly", "yearly"].includes(r.frequency)) {
    return `unknown frequency ${r.frequency}`;
  }
  if (!Number.isInteger(r.interval) || r.interval < 1) {
    return `invalid interval ${r.interval}`;
  }
  const weekdays = r.weekdays ?? [];
  if (r.weekdays && (weekdays.length === 0 || weekdays.some((d) => !isWeekday(d)))) {
    return "invalid weekdays";
  }
  if (r.ordinal != null && !(r.frequency === "monthly" && weekdays.length > 0 && [1, 2, 3, 4, -1].includes(r.ordinal))) {
    return "ordinal only applies to monthly weekday patterns";
  }
  if (
    r.month_day != null &&
    !(r.frequency === "monthly" && Number.isInteger(r.month_day) && r.month_day >= 1 && r.month_day <= 31)
  ) {
    return "month_day only applies to monthly patterns";
  }
  if (r.frequency === "monthly" && weekdays.length > 0 && r.ordinal == null) {
    return "monthly weekday pattern without an ordinal";
  }
  if (r.end_kind === "count" && !(r.count !== null && Number.isInteger(r.count) && r.count >= 1)) {
    return "invalid count";
  }
  if (!hasStartDate) {
    // No start date: the pattern itself must say which days.
    const saysWhichDays =
      r.frequency === "daily" ||
      (r.frequency === "weekly" && weekdays.length > 0) ||
      (r.frequency === "monthly" && ((weekdays.length > 0 && r.ordinal != null) || r.month_day != null));
    if (!saysWhichDays) {
      return "no start date and the pattern doesn't say which days";
    }
  }
  return null;
}

// The RRULE value (without the "RRULE:" prefix). The caller formats
// `untilValue`, because its format depends on the event: a UTC time for timed
// events, a local time for floating ones, a plain date for all-day ones.
export function buildRrule(r: Recurrence, untilValue: string | null): string {
  const parts = [`FREQ=${r.frequency.toUpperCase()}`];

  if (r.interval > 1) {
    parts.push(`INTERVAL=${r.interval}`);
  }
  if (r.frequency === "weekly" && r.weekdays?.length) {
    parts.push(`BYDAY=${r.weekdays.join(",")}`);
  }
  if (r.frequency === "monthly") {
    if (r.weekdays?.length && r.ordinal != null) {
      parts.push(
        `BYDAY=${r.weekdays.map((d) => `${r.ordinal}${d}`).join(",")}`,
      );
    } else if (r.month_day != null) {
      parts.push(`BYMONTHDAY=${r.month_day}`);
    }
  }
  if (r.end_kind === "count") {
    parts.push(`COUNT=${r.count}`);
  }
  if (r.end_kind === "until" && untilValue) {
    parts.push(`UNTIL=${untilValue}`);
  }

  return parts.join(";");
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
}

// An English sentence that describes the pattern ("Repeats every 2 weeks on
// Monday and Wednesday, until 5 Jan 2027"). It is part of the event, not one
// of the bot's own messages, so it is not translated.
export function describeRecurrence(r: Recurrence, untilLabel: string | null = null): string {
  const every = (unit: string, plural: string) =>
    r.interval === 1 ? `every ${unit}` : `every ${r.interval} ${plural}`;
  const days = r.weekdays?.length
    ? new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(
        r.weekdays.map((d) => DAY_NAMES[d]),
      )
    : null;

  let phrase: string;
  switch (r.frequency) {
    case "daily":
      phrase = every("day", "days");
      break;
    case "weekly":
      phrase = days
        ? r.interval === 1
          ? `every ${days}`
          : `every ${r.interval} weeks on ${days}`
        : every("week", "weeks");
      break;
    case "monthly": {
      const month =
        r.interval === 1 ? "every month" : `every ${r.interval} months`;
      if (days && r.ordinal != null) {
        phrase = `on the ${ORDINAL_NAMES[r.ordinal]} ${days} of ${month}`;
      } else if (r.month_day != null) {
        phrase = `on the ${r.month_day}${ordinalSuffix(r.month_day)} of ${month}`;
      } else {
        phrase = month;
      }
      break;
    }
    default:
      phrase = every("year", "years");
  }

  let text = `Repeats ${phrase}`;
  if (r.end_kind === "until" && untilLabel) {
    text += `, until ${untilLabel}`;
  } else if (r.end_kind === "count") {
    text += `, ${r.count} ${r.count === 1 ? "time" : "times"}`;
  }
  return text;
}
