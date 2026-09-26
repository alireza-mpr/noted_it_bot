import type { ExtractedEvent, Recurrence, Weekday } from "./extractedEvent";
import { resolveTimezone, resolveYear } from "../time/timezone";
import { toSupportedLanguage } from "../translation/language";
import {
  RECURRENCE_PHRASES,
  type Ordinal,
  type PluralForms,
} from "../translation/recurrencePhrases";

// Below this, a message that reads as recurring is declined rather than
// guessed at — a wrong repeat rule silently fills someone's calendar.
export const RECURRENCE_MIN_CONFIDENCE = 0.7;

export interface YMD {
  year: number;
  month: number;
  day: number;
}

export type RecurrencePlan =
  | { ok: true; first: YMD; until: YMD | null }
  | { ok: false; reason: string };

// Index = Date#getUTCDay().
const WEEKDAY_BY_INDEX: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const VALID_WEEKDAYS = new Set<string>(WEEKDAY_BY_INDEX);

function toDate(d: YMD): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

function fromDate(date: Date): YMD {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addDays(d: YMD, days: number): YMD {
  const date = toDate(d);
  date.setUTCDate(date.getUTCDate() + days);
  return fromDate(date);
}

function compare(a: YMD, b: YMD): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

function daysInMonth(d: YMD): number {
  return new Date(Date.UTC(d.year, d.month, 0)).getUTCDate();
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

// Today's date and time-of-day in `timeZone` (not the server's UTC).
function zonedNow(now: Date, timeZone: string): { ymd: YMD; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  return {
    ymd: { year: get("year"), month: get("month"), day: get("day") },
    minutes: get("hour") * 60 + get("minute"),
  };
}

// Does this calendar day fit the pattern's weekday / ordinal / day-of-month
// constraints? (Interval and end conditions are the calendar app's job.)
function matches(d: YMD, r: Recurrence): boolean {
  const weekday = WEEKDAY_BY_INDEX[toDate(d).getUTCDay()];
  const hasWeekdays = !!r.weekdays?.length;

  switch (r.frequency) {
    case "weekly":
      return hasWeekdays ? r.weekdays!.includes(weekday) : true;
    case "monthly":
      if (hasWeekdays && r.ordinal != null) {
        if (!r.weekdays!.includes(weekday)) {
          return false;
        }
        return r.ordinal === -1
          ? d.day + 7 > daysInMonth(d)
          : Math.ceil(d.day / 7) === r.ordinal;
      }
      if (r.month_day != null) {
        return d.day === r.month_day;
      }
      return true;
    default:
      return true;
  }
}

function findMatch(from: YMD, r: Recurrence): YMD | null {
  for (let i = 0; i < 800; i++) {
    const candidate = addDays(from, i);
    if (matches(candidate, r)) {
      return candidate;
    }
  }
  return null;
}

// Works out the first occurrence and the end date, or explains why the
// pattern can't be turned into a calendar series. Date arithmetic lives here,
// never in the model.
export function planRecurrence(
  event: ExtractedEvent,
  now: Date = new Date(),
): RecurrencePlan {
  const r = event.recurrence;
  if (!r) {
    return { ok: false, reason: "no recurrence" };
  }

  if (event.confidence < RECURRENCE_MIN_CONFIDENCE) {
    return { ok: false, reason: `low confidence (${event.confidence})` };
  }

  if (!["daily", "weekly", "monthly", "yearly"].includes(r.frequency)) {
    return { ok: false, reason: `unknown frequency ${r.frequency}` };
  }
  if (!Number.isInteger(r.interval) || r.interval < 1) {
    return { ok: false, reason: `invalid interval ${r.interval}` };
  }
  if (
    r.weekdays &&
    (r.weekdays.length === 0 || r.weekdays.some((d) => !VALID_WEEKDAYS.has(d)))
  ) {
    return { ok: false, reason: "invalid weekdays" };
  }
  if (
    r.ordinal != null &&
    !(
      r.frequency === "monthly" &&
      r.weekdays?.length &&
      [1, 2, 3, 4, -1].includes(r.ordinal)
    )
  ) {
    return {
      ok: false,
      reason: "ordinal only applies to monthly weekday patterns",
    };
  }
  if (
    r.month_day != null &&
    !(
      r.frequency === "monthly" &&
      Number.isInteger(r.month_day) &&
      r.month_day >= 1 &&
      r.month_day <= 31
    )
  ) {
    return { ok: false, reason: "month_day only applies to monthly patterns" };
  }
  if (r.frequency === "monthly" && r.weekdays?.length && r.ordinal == null) {
    return { ok: false, reason: "monthly weekday pattern without an ordinal" };
  }
  if (r.end_kind === "count" && !(Number.isInteger(r.count) && r.count! >= 1)) {
    return { ok: false, reason: "invalid count" };
  }

  const hasStartDate = event.month !== null && event.day !== null;
  if (!hasStartDate) {
    // No stated start: the pattern itself must say which days.
    const selfContained =
      r.frequency === "daily" ||
      (r.frequency === "weekly" && !!r.weekdays?.length) ||
      (r.frequency === "monthly" &&
        ((!!r.weekdays?.length && r.ordinal != null) || r.month_day != null));
    if (!selfContained) {
      return {
        ok: false,
        reason: "no start date and the pattern doesn't say which days",
      };
    }
  }

  const timeZone = resolveTimezone(event.timezone_hint);
  if (!timeZone) {
    return { ok: false, reason: "unrecognised timezone" };
  }
  const { ymd: today, minutes } = zonedNow(now, timeZone);

  let from: YMD;
  if (hasStartDate) {
    from = {
      year: resolveYear(event.year, event.month!, event.day!, timeZone, now),
      month: event.month!,
      day: event.day!,
    };
  } else {
    from = today;
    // Today only counts if the event hasn't already started.
    if (event.start_time && minutes >= toMinutes(event.start_time)) {
      from = addDays(today, 1);
    }
  }

  const first = findMatch(from, r);
  if (!first) {
    return { ok: false, reason: "no matching first occurrence" };
  }

  let until: YMD | null = null;
  if (r.end_kind === "until") {
    if (r.until_month == null || r.until_day == null) {
      return { ok: false, reason: "until date incomplete" };
    }
    let untilYear = r.until_year ?? first.year;
    until = { year: untilYear, month: r.until_month, day: r.until_day };
    if (r.until_year == null && compare(until, first) < 0) {
      untilYear += 1;
      until = { year: untilYear, month: r.until_month, day: r.until_day };
    }
    if (compare(until, first) < 0) {
      return { ok: false, reason: "end date is before the first occurrence" };
    }
  }

  return { ok: true, first, until };
}

// null = fine (or not a recurring event). Otherwise a reason to decline: an
// untrustworthy repeat rule is declined outright, since a wrong one silently
// fills someone's calendar.
export function recurrenceProblem(
  event: ExtractedEvent,
  now: Date = new Date(),
): string | null {
  if (!event.recurrence || (event.calendar !== null && event.calendar !== "gregorian")) {
    return null;
  }
  if (event.date_kind !== "absolute" && event.date_kind !== "weekday") {
    return null;
  }
  const plan = planRecurrence(event, now);
  return plan.ok ? null : plan.reason;
}

// The RRULE value (no "RRULE:" prefix). `untilValue` is pre-formatted by the
// caller because its form depends on the event: a UTC timestamp for timed
// events, a plain date for all-day ones.
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

// The weekday's name in `lang`, from Intl. 4 Jan 2026 was a Sunday.
function weekdayName(day: Weekday, lang: string): string {
  return new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, 0, 4 + WEEKDAY_BY_INDEX.indexOf(day))),
  );
}

function pickForm(forms: PluralForms, n: number, lang: string): string {
  if (n === 1 && forms["1"] !== undefined) {
    return forms["1"];
  }
  return forms[new Intl.PluralRules(lang).select(n)] ?? forms.other;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

// The pattern as a sentence in `lang` (English for an unsupported language),
// built from the phrase tables in src/translation/recurrencePhrases.ts, so no
// model is involved. `untilLabel` is the end date, already formatted for the
// language; it's only used when the series ends on a date.
export function describeRecurrence(
  r: Recurrence,
  lang: string | undefined,
  untilLabel: string | null = null,
): string {
  const language = toSupportedLanguage(lang) ?? "en";
  const phrases = RECURRENCE_PHRASES[language];
  const number = new Intl.NumberFormat(language, { useGrouping: false });
  const list = (items: string[]) =>
    new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(items);
  const n = number.format(r.interval);
  const weekdays = r.weekdays?.length ? r.weekdays : null;

  let text: string;
  if (r.frequency === "weekly" && weekdays) {
    const days = list(weekdays.map((d) => weekdayName(d, language)));
    text = fill(pickForm(phrases.weeklyOn, r.interval, language), { n, days });
  } else if (r.frequency === "monthly" && weekdays && r.ordinal != null) {
    const nth = phrases.nth[String(r.ordinal) as Ordinal];
    const days = list(
      weekdays.map((d) => {
        const template =
          typeof nth === "string" ? nth : nth[phrases.weekdayGender?.[d] ?? "m"] ?? nth.m;
        return fill(template, { weekday: weekdayName(d, language) });
      }),
    );
    text = fill(pickForm(phrases.monthlyOnWeekday, r.interval, language), { n, days });
  } else if (r.frequency === "monthly" && r.month_day != null) {
    const day = phrases.monthDay
      ? phrases.monthDay(r.month_day)
      : number.format(r.month_day);
    text = fill(pickForm(phrases.monthlyOnDay, r.interval, language), { n, day });
  } else {
    const forms =
      r.frequency === "daily"
        ? phrases.daily
        : r.frequency === "weekly"
          ? phrases.weekly
          : r.frequency === "monthly"
            ? phrases.monthly
            : phrases.yearly;
    text = fill(pickForm(forms, r.interval, language), { n });
  }

  if (r.end_kind === "until" && untilLabel) {
    text = fill(phrases.until, { text, date: untilLabel });
  } else if (r.end_kind === "count" && r.count != null) {
    text = fill(pickForm(phrases.count, r.count, language), {
      text,
      n: number.format(r.count),
    });
  }
  return text;
}
