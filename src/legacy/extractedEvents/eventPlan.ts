import { appConfig } from "../appConfig/appConfig";
import {
  addDays,
  compareDates,
  isTimeBefore,
  nowIn,
  parseTime,
  type DateOnly,
  type TimeOfDay,
} from "../time/dateOnly";
import { ianaZone } from "../time/timezone";
import type { ExtractedEvent, Recurrence, Weekday } from "./extractedEvent";
import { firstOccurrence, repeatRuleProblem } from "./recurrence";
import { toGregorianDates } from "./toGregorian";

// Where the event's time zone comes from.
export type EventZone =
  | { kind: "message"; name: string } // the message states or suggests it
  | { kind: "user"; name: string } // the user's /tz zone
  | { kind: "floating" }; // none: times as written, in each calendar's own zone

export type EventTimes =
  | { kind: "all-day" } // the message gives no time: we never guess one
  | { kind: "timed"; start: TimeOfDay; end: TimeOfDay };

export interface EventRepeat {
  rule: Recurrence;
  until: DateOnly | null; // null: the series has no end date
}

// A checked event, ready to render. Every date is Gregorian and has a year.
export interface EventPlan {
  title: string | null;
  location: string | null;
  date: DateOnly; // the date, or a repeat's first date
  times: EventTimes;
  zone: EventZone;
  repeat: EventRepeat | null;
  statedWeekday: Weekday | null;
  inPast: boolean; // a one-off event whose date is before today
}

export type PlanResult =
  | { ok: true; plan: EventPlan }
  | { ok: false; reason: "no_event" | "repeat_declined"; detail: string };

const noEvent = (detail: string): PlanResult => ({
  ok: false,
  reason: "no_event",
  detail,
});
const repeatDeclined = (detail: string): PlanResult => ({
  ok: false,
  reason: "repeat_declined",
  detail,
});

// The zone in the message wins. Otherwise the user's /tz zone. Otherwise none.
// null when the message names a zone that Intl does not know.
function eventZone(
  hint: string | null,
  userZone: string | null,
): EventZone | null {
  if (hint) {
    const name = ianaZone(hint);
    return name ? { kind: "message", name } : null;
  }
  return userZone ? { kind: "user", name: userZone } : { kind: "floating" };
}

// With no end time, the event lasts one hour.
function eventTimes(event: ExtractedEvent): EventTimes {
  if (!event.start_time) {
    return { kind: "all-day" };
  }
  const start = parseTime(event.start_time);
  const end = event.end_time
    ? parseTime(event.end_time)
    : { hour: (start.hour + 1) % 24, minute: start.minute };
  return { kind: "timed", start, end };
}

// Turns the model's answer into a checked plan, or says why it cannot:
// - "no_event": no usable date (none written, a relative date like
//   "tomorrow", an unknown zone, or dates that cannot be converted);
// - "repeat_declined": a repeat rule we cannot trust.
// "Today" is in the event's zone, or the default zone for floating times.
export function planEvent(
  event: ExtractedEvent,
  userZone: string | null,
  now: Date,
): PlanResult {
  const zone = eventZone(event.timezone_hint, userZone);
  if (!zone) {
    return noEvent(`unknown time zone ${event.timezone_hint}`);
  }
  const today = nowIn(
    zone.kind === "floating" ? appConfig.defaultTimezone : zone.name,
    now,
  );

  const dates = toGregorianDates(event, today.date);
  if (!dates) {
    return noEvent("the dates cannot be converted");
  }

  const common = {
    title: event.title,
    location: event.location,
    times: eventTimes(event),
    zone,
    statedWeekday: event.weekday ?? null,
  };

  const rule = event.recurrence ?? null;
  if (!rule) {
    if (event.date_kind !== "absolute" || !dates.start) {
      return noEvent("no date");
    }
    return {
      ok: true,
      plan: {
        ...common,
        date: dates.start,
        repeat: null,
        inPast: compareDates(dates.start, today.date) < 0,
      },
    };
  }

  if (event.date_kind !== "absolute" && event.date_kind !== "weekday") {
    return noEvent("no date");
  }
  const problem = repeatRuleProblem(
    rule,
    event.confidence,
    dates.start !== null,
  );
  if (problem) {
    return repeatDeclined(problem);
  }

  // With no start date, the repeat starts today. Today counts only if the
  // event has not started yet.
  const startedToday =
    common.times.kind === "timed" &&
    !isTimeBefore(today.time, common.times.start);
  const from =
    dates.start ?? (startedToday ? addDays(today.date, 1) : today.date);
  const first = firstOccurrence(from, rule);
  if (!first) {
    return repeatDeclined("no matching first occurrence");
  }

  if (rule.end_kind === "until") {
    if (!dates.until) {
      return repeatDeclined("until date incomplete");
    }
    if (compareDates(dates.until, first) < 0) {
      return repeatDeclined("end date is before the first occurrence");
    }
  }
  const until = rule.end_kind === "until" ? dates.until : null;

  return {
    ok: true,
    plan: { ...common, date: first, repeat: { rule, until }, inPast: false },
  };
}

// Why a repeat is declined, or null if it is fine or there is no repeat.
export function recurrenceProblem(
  event: ExtractedEvent,
  now: Date = new Date(),
): string | null {
  const planned = planEvent(event, null, now);
  return !planned.ok && planned.reason === "repeat_declined"
    ? planned.detail
    : null;
}
