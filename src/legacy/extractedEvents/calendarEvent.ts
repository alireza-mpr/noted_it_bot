import {
  addDays,
  toUtcDate,
  weekdayOf,
  type DateOnly,
  type TimeOfDay,
  type Weekday,
} from "../time/dateOnly";
import { zonedTimeToUtc } from "../time/timezone";
import { planEvent, type EventPlan, type EventZone } from "./eventPlan";
import type { ExtractedEvent } from "./extractedEvent";
import { buildRrule, describeRecurrence } from "./recurrence";

// Represents a date in a message where the combination of weekday and date is
// wrong, or does not exist within a reasonable window before or after today.
export interface WeekdayMismatch {
  statedWeekday: string;
  date: string;
  realWeekday: string;
}

export interface BuiltCalendarEvent {
  icsFilename: string;
  icsContent: string;
  googleCalendarUrl: string;
  zone: EventZone;
  inPast: boolean;
  weekdayMismatch: WeekdayMismatch | null; // always null for repeats
  allDay: boolean;
  summaryLines: string[];
  recurrence: string | null; // the English repeat sentence, or null for a one-off
}

const END_OF_DAY: TimeOfDay = { hour: 23, minute: 59 };

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatIcsDate(date: DateOnly): string {
  return `${date.year}${pad(date.month)}${pad(date.day)}`;
}

function formatIcsLocal(date: DateOnly, time: TimeOfDay): string {
  return `${formatIcsDate(date)}T${pad(time.hour)}${pad(time.minute)}00`;
}

function formatIcsUtc(moment: Date): string {
  return moment
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

// RFC 5545 §3.3.11: in TEXT values, backslash, semicolon, comma and newline
// have a special meaning, so they must be escaped.
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const FOLD_LIMIT = 75; // octets per line (RFC 5545 §3.1)

// RFC 5545 §3.1: a line SHOULD NOT be longer than 75 octets. A longer line is
// folded: split into several lines, each new line starting with CRLF and one
// space. Strict parsers can fail on a long line that is not folded (for
// example a long title in a non-Latin script, where each character is several
// bytes in UTF-8). This folds by octet count, and never splits a character.
function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= FOLD_LIMIT) {
    return line;
  }

  const decoder = new TextDecoder();
  const parts: string[] = [];
  let start = 0;
  let limit = FOLD_LIMIT;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Move `end` back while it is in the middle of a character. (A UTF-8
    // continuation byte starts with the bits 10xxxxxx.)
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    parts.push(decoder.decode(bytes.slice(start, end)));
    start = end;
    limit = FOLD_LIMIT - 1; // each new line needs 1 octet for its leading space
  }

  return parts.join("\r\n ");
}

// The zone name when the times are tied to a zone, or null for floating times.
function zoneName(zone: EventZone): string | null {
  return zone.kind === "floating" ? null : zone.name;
}

// The start and end, as DTSTART/DTEND values and as the Google link's "dates":
// - all-day: plain dates. DTEND is exclusive (RFC 5545 §3.6.1), so a one-day
//   event ends on the next day;
// - floating: local times with no zone, so every calendar uses its own zone;
// - in a zone: local times with TZID in the file, UTC times in the link.
function startAndEnd(plan: EventPlan): {
  dtStart: string;
  dtEnd: string;
  googleDates: string;
} {
  if (plan.times.kind === "all-day") {
    const start = formatIcsDate(plan.date);
    const end = formatIcsDate(addDays(plan.date, 1));
    return {
      dtStart: `;VALUE=DATE:${start}`,
      dtEnd: `;VALUE=DATE:${end}`,
      googleDates: `${start}/${end}`,
    };
  }
  const start = formatIcsLocal(plan.date, plan.times.start);
  const end = formatIcsLocal(plan.date, plan.times.end);
  const zone = zoneName(plan.zone);
  if (!zone) {
    return {
      dtStart: `:${start}`,
      dtEnd: `:${end}`,
      googleDates: `${start}/${end}`,
    };
  }
  const utc = (time: TimeOfDay) =>
    formatIcsUtc(zonedTimeToUtc(plan.date, time, zone));
  return {
    dtStart: `;TZID=${zone}:${start}`,
    dtEnd: `;TZID=${zone}:${end}`,
    googleDates: `${utc(plan.times.start)}/${utc(plan.times.end)}`,
  };
}

// The series ends at the end of its last day (23:59): a plain date for all-day
// events, local time for floating times, and UTC for times in a zone (RFC 5545
// requires each of these).
function formatUntil(plan: EventPlan, until: DateOnly): string {
  if (plan.times.kind === "all-day") {
    return formatIcsDate(until);
  }
  const zone = zoneName(plan.zone);
  return zone
    ? formatIcsUtc(zonedTimeToUtc(until, END_OF_DAY, zone))
    : formatIcsLocal(until, END_OF_DAY);
}

// Days of January 2024, starting on Monday 1 Jan. So each weekday code maps
// to a date on that weekday.
const WEEKDAY_REFERENCE_DAY: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

// Always use the Gregorian calendar. Some locales (for example "fa") use
// another calendar by default (Jalali). That would show a date that does not
// match the Gregorian event we create.
function formatDate(
  date: DateOnly,
  lang: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(lang, {
    ...options,
    timeZone: "UTC",
    calendar: "gregory",
  }).format(toUtcDate(date));
}

function formatClock(time: TimeOfDay, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(toUtcDate({ year: 2000, month: 1, day: 1 }, time));
}

// When the stated weekday does not match the date: the stated weekday, the
// date, and the real weekday, in the reply language. Otherwise null.
function weekdayMismatch(
  plan: EventPlan,
  lang: string,
): WeekdayMismatch | null {
  const actual = weekdayOf(plan.date);
  if (plan.repeat || !plan.statedWeekday || plan.statedWeekday === actual) {
    return null;
  }
  const weekdayName = (date: DateOnly) =>
    formatDate(date, lang, { weekday: "long" });
  return {
    statedWeekday: weekdayName({
      year: 2024,
      month: 1,
      day: WEEKDAY_REFERENCE_DAY[plan.statedWeekday],
    }),
    date: formatDate(plan.date, lang, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    realWeekday: weekdayName(plan.date),
  };
}

// 📌 title, then 🗓️ date and time.
function summaryLines(plan: EventPlan, lang: string): string[] {
  const date = formatDate(plan.date, lang, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const when =
    plan.times.kind === "all-day"
      ? date
      : `${date} ${formatClock(plan.times.start, lang)}–${formatClock(plan.times.end, lang)}`;
  return [...(plan.title ? [`📌 ${plan.title}`] : []), `🗓️ ${when}`];
}

// Renders a checked plan: the .ics file, the Google link and the caption parts.
export function renderCalendarEvent(
  plan: EventPlan,
  uid: string,
  lang: string,
  now: Date,
): BuiltCalendarEvent {
  const title = plan.title ?? "Event";
  const { dtStart, dtEnd, googleDates } = startAndEnd(plan);
  const rrule = plan.repeat
    ? buildRrule(
        plan.repeat.rule,
        plan.repeat.until ? formatUntil(plan, plan.repeat.until) : null,
      )
    : null;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//noted_it//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART${dtStart}`,
    `DTEND${dtEnd}`,
    ...(rrule ? [`RRULE:${rrule}`] : []),
    `SUMMARY:${escapeIcsText(title)}`,
    ...(plan.location ? [`LOCATION:${escapeIcsText(plan.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(foldIcsLine);

  const google = new URLSearchParams({ action: "TEMPLATE", text: title });
  const zone = zoneName(plan.zone);
  if (zone && plan.times.kind === "timed") {
    google.set("ctz", zone);
  }
  google.set("dates", googleDates);
  if (plan.location) {
    google.set("location", plan.location);
  }
  if (rrule) {
    // Google's web calendar uses this. Its phone app ignores it and adds only
    // one event. That is why the caption sends users to the file for repeats.
    google.set("recur", `RRULE:${rrule}`);
  }

  return {
    icsFilename: "event.ics",
    icsContent: lines.join("\r\n"),
    googleCalendarUrl: `https://calendar.google.com/calendar/render?${google.toString()}`,
    zone: plan.zone,
    inPast: plan.inPast,
    weekdayMismatch: weekdayMismatch(plan, lang),
    allDay: plan.times.kind === "all-day",
    summaryLines: summaryLines(plan, lang),
    recurrence: plan.repeat
      ? describeRecurrence(
          plan.repeat.rule,
          plan.repeat.until
            ? formatDate(plan.repeat.until, "en", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : null,
        )
      : null,
  };
}

// Plans and renders in one step. Returns null when there is no event.
// `now` can be set, so tests can control the date.
export function buildCalendarEvent(
  extracted: ExtractedEvent,
  uid: string,
  lang = "en",
  now: Date = new Date(),
  userZone: string | null = null,
): BuiltCalendarEvent | null {
  const planned = planEvent(extracted, userZone, now);
  return planned.ok ? renderCalendarEvent(planned.plan, uid, lang, now) : null;
}
