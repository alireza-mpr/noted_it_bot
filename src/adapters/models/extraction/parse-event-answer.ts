import type { CalendarId } from "../../../domain/calendar-event/calendar";
import type {
  CalendarEventDraft,
  WrittenDate,
  WrittenEndDate,
} from "../../../domain/calendar-event/calendar-event-draft";
import { eventTimeOf } from "../../../domain/calendar-event/event-time-rule";
import type {
  MonthlyDay,
  Repeat,
  RepeatEnd,
  RepeatPattern,
  WeekOfMonth,
} from "../../../domain/calendar-event/repeat";
import { isWeekday, type Weekday } from "../../../generic/date-time/date-only";
import {
  readIntegerOrNull,
  readNumber,
  readOneOf,
  readRecord,
  readRecordOrNull,
  readStringOrNull,
  readStringsOrNull,
  type JsonRecord,
} from "../../../generic/json/json-fields";
import type { TimeOfDay } from "../../../generic/date-time/time-of-day";
import { parseTimeZoneName } from "../../../generic/date-time/time-zone";
import { calendarIdNamed } from "./calendar-names";
import type {
  DateKind,
  EventAnswer,
  RecurrenceAnswer,
} from "./event-answer-schema";

const DATE_KINDS: readonly DateKind[] = [
  "absolute",
  "relative",
  "weekday",
  "none",
];
const FREQUENCIES: readonly RecurrenceAnswer["frequency"][] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];
const END_KINDS: readonly RecurrenceAnswer["end_kind"][] = [
  "never",
  "until",
  "count",
];
// e.g. "20:00", or "20:00:00": Gemini sometimes adds seconds.
const TIME_TEXT_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

// Represents the result of parsing a model answer: the draft, or the reason
// why there is none. The detail is for the logs.
export type DraftResult =
  | { ok: true; draft: CalendarEventDraft }
  | {
      ok: false;
      reason: "unusable-answer" | "no-event" | "repeat-declined";
      detail: string;
    };

// Returns the draft in a model answer, or the reason why there is none. An
// answer that is not JSON of the schema's shape is unusable. See "Dates" and
// "Repeats" in docs/EDGE_CASES.md.
export function parseEventAnswer(modelAnswerText: string): DraftResult {
  let eventAnswer: EventAnswer;
  try {
    eventAnswer = readEventAnswer(JSON.parse(modelAnswerText));
  } catch (error) {
    return {
      ok: false,
      reason: "unusable-answer",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  return draftOf(eventAnswer);
}

function draftOf(eventAnswer: EventAnswer): DraftResult {
  const recurrence = eventAnswer.recurrence;
  if (eventAnswer.date_kind === "relative") {
    // e.g. "tomorrow": not supported yet.
    return noEvent("a relative date");
  }
  if (recurrence !== null && eventAnswer.date_kind === "none") {
    return noEvent("a repeat with no date");
  }

  const calendarResult = calendarResultOf(eventAnswer);
  if (!calendarResult.ok) {
    return noEvent(calendarResult.detail);
  }

  const invalidTimeText = [eventAnswer.start_time, eventAnswer.end_time].find(
    (timeText) => timeText !== null && timeOfDayOf(timeText) === null,
  );
  if (invalidTimeText !== undefined) {
    return noEvent(`a time that is not HH:MM: ${invalidTimeText}`);
  }

  const timeZoneHint = eventAnswer.timezone_hint;
  const timeZone =
    timeZoneHint === null ? null : parseTimeZoneName(timeZoneHint);
  if (timeZoneHint !== null && timeZone === null) {
    return noEvent(`a time zone that does not exist: ${timeZoneHint}`);
  }

  const repeatResult = recurrence === null ? null : repeatResultOf(recurrence);
  if (repeatResult !== null && !repeatResult.ok) {
    return {
      ok: false,
      reason: "repeat-declined",
      detail: repeatResult.detail,
    };
  }

  return {
    ok: true,
    draft: {
      title: eventAnswer.title,
      location: eventAnswer.location,
      writtenInCalendar: calendarResult.calendarId,
      date: writtenDateOf(eventAnswer),
      time: eventTimeOf(
        optionalTimeOfDayOf(eventAnswer.start_time),
        optionalTimeOfDayOf(eventAnswer.end_time),
      ),
      timeZone,
      repeat: repeatResult === null ? null : repeatResult.repeat,
      confidence: eventAnswer.confidence,
    },
  };
}

// Returns the calendar the message writes its dates in. A date with no
// calendar is not guessed: see "Calendars are data" in docs/EDGE_CASES.md.
function calendarResultOf(
  eventAnswer: EventAnswer,
): { ok: true; calendarId: CalendarId } | { ok: false; detail: string } {
  const calendarName = eventAnswer.calendar;
  if (calendarName === null) {
    return writesDate(eventAnswer)
      ? { ok: false, detail: "a date with no calendar" }
      : { ok: true, calendarId: "gregory" };
  }
  const calendarId = calendarIdNamed(calendarName);
  return calendarId === null
    ? {
        ok: false,
        detail: `a calendar the bot does not accept: ${calendarName}`,
      }
    : { ok: true, calendarId };
}

function writesDate(eventAnswer: EventAnswer): boolean {
  const recurrence = eventAnswer.recurrence;
  return [
    eventAnswer.month,
    eventAnswer.day,
    recurrence?.until_month ?? null,
    recurrence?.until_day ?? null,
  ].some((dateNumber) => dateNumber !== null);
}

// Returns the written date, or null if there is none: a one-off event needs an absolute date, and any date needs a month and a day.
function writtenDateOf(eventAnswer: EventAnswer): WrittenDate | null {
  const { month, day } = eventAnswer;
  const isOneOffWithoutAbsoluteDate =
    eventAnswer.recurrence === null && eventAnswer.date_kind !== "absolute";
  if (isOneOffWithoutAbsoluteDate || month === null || day === null) {
    return null;
  }
  return { year: eventAnswer.year, month, day, weekday: eventAnswer.weekday };
}

function optionalTimeOfDayOf(timeText: string | null): TimeOfDay | null {
  return timeText === null ? null : timeOfDayOf(timeText);
}

// Returns the time of day in e.g. "20:00" or "20:00:00", or null if the text
// is not a time of day.
function timeOfDayOf(timeText: string): TimeOfDay | null {
  const timeMatch = TIME_TEXT_PATTERN.exec(timeText.trim());
  if (timeMatch === null) {
    return null;
  }
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

// Returns the repeat that the model describes, or why it cannot be trusted.
// The domain checks the rest: see "Repeats" in docs/EDGE_CASES.md.
function repeatResultOf(
  recurrence: RecurrenceAnswer,
):
  | { ok: true; repeat: Repeat<WrittenEndDate> }
  | { ok: false; detail: string } {
  const { frequency, ordinal } = recurrence;
  const writtenWeekdays = recurrence.weekdays;
  const weekdays = (writtenWeekdays ?? []).filter(isWeekday);
  if (
    writtenWeekdays !== null &&
    (weekdays.length === 0 || weekdays.length !== writtenWeekdays.length)
  ) {
    return {
      ok: false,
      detail: `invalid weekdays: ${writtenWeekdays.join(",")}`,
    };
  }
  if (ordinal !== null && !(frequency === "monthly" && weekdays.length > 0)) {
    return {
      ok: false,
      detail: "an ordinal outside a monthly weekday pattern",
    };
  }
  if (recurrence.month_day !== null && frequency !== "monthly") {
    return {
      ok: false,
      detail: "a day of the month outside a monthly pattern",
    };
  }
  if (frequency === "monthly" && weekdays.length > 0 && ordinal === null) {
    return { ok: false, detail: "a monthly weekday pattern with no ordinal" };
  }
  const weekOfMonth = ordinal === null ? null : weekOfMonthOf(ordinal);
  if (ordinal !== null && weekOfMonth === null) {
    return { ok: false, detail: `invalid ordinal ${ordinal}` };
  }

  const repeatEnd = repeatEndOf(recurrence);
  if (repeatEnd === null) {
    return { ok: false, detail: `an incomplete ${recurrence.end_kind} end` };
  }
  const interval = recurrence.interval;
  const pattern: RepeatPattern =
    frequency === "weekly"
      ? { frequency, interval, weekdays }
      : frequency === "monthly"
        ? {
            frequency,
            interval,
            dayOfMonth: monthlyDayOf(
              recurrence.month_day,
              weekOfMonth,
              weekdays,
            ),
          }
        : { frequency, interval };
  return { ok: true, repeat: { pattern, end: repeatEnd } };
}

// Returns the week of the month for the model's ordinal (1 to 4, or -1 for
// "last"), or null for any other number.
function weekOfMonthOf(ordinal: number): WeekOfMonth | null {
  if (ordinal === -1) {
    return "last";
  }
  return ordinal === 1 || ordinal === 2 || ordinal === 3 || ordinal === 4
    ? ordinal
    : null;
}

function monthlyDayOf(
  monthDay: number | null,
  weekOfMonth: WeekOfMonth | null,
  weekdays: Weekday[],
): MonthlyDay {
  if (weekOfMonth !== null) {
    return { kind: "weekday-of-month", week: weekOfMonth, weekdays };
  }
  return monthDay === null
    ? { kind: "same-as-first-date" }
    : { kind: "fixed-day", day: monthDay };
}

// Returns the repeat end, or null if the model leaves out a part it needs:
// the month and day of an end date, or the number of times.
function repeatEndOf(
  recurrence: RecurrenceAnswer,
): RepeatEnd<WrittenEndDate> | null {
  switch (recurrence.end_kind) {
    case "never":
      return { kind: "never" };
    case "until": {
      const {
        until_year: year,
        until_month: month,
        until_day: day,
      } = recurrence;
      return month === null || day === null
        ? null
        : { kind: "until", date: { year, month, day } };
    }
    case "count":
      return recurrence.count === null
        ? null
        : { kind: "after", times: recurrence.count };
  }
}

function noEvent(detail: string): DraftResult {
  return { ok: false, reason: "no-event", detail };
}

// Returns the model's answer with its shape checked. Throws if the shape is
// wrong.
function readEventAnswer(answerJson: unknown): EventAnswer {
  const answerRecord = readRecord(answerJson, "the answer");
  const recurrenceRecord = readRecordOrNull(answerRecord, "recurrence");
  return {
    title: readStringOrNull(answerRecord, "title"),
    calendar: readStringOrNull(answerRecord, "calendar"),
    date_kind: readOneOf(answerRecord, "date_kind", DATE_KINDS),
    year: readIntegerOrNull(answerRecord, "year"),
    month: readIntegerOrNull(answerRecord, "month"),
    day: readIntegerOrNull(answerRecord, "day"),
    weekday: readWeekdayOrNull(answerRecord, "weekday"),
    start_time: readStringOrNull(answerRecord, "start_time"),
    end_time: readStringOrNull(answerRecord, "end_time"),
    timezone_hint: readStringOrNull(answerRecord, "timezone_hint"),
    location: readStringOrNull(answerRecord, "location"),
    recurrence:
      recurrenceRecord === null ? null : readRecurrenceAnswer(recurrenceRecord),
    confidence: readNumber(answerRecord, "confidence"),
  };
}

function readRecurrenceAnswer(recurrenceRecord: JsonRecord): RecurrenceAnswer {
  return {
    frequency: readOneOf(recurrenceRecord, "frequency", FREQUENCIES),
    interval: readNumber(recurrenceRecord, "interval"),
    weekdays: readStringsOrNull(recurrenceRecord, "weekdays"),
    ordinal: readIntegerOrNull(recurrenceRecord, "ordinal"),
    month_day: readIntegerOrNull(recurrenceRecord, "month_day"),
    end_kind: readOneOf(recurrenceRecord, "end_kind", END_KINDS),
    until_year: readIntegerOrNull(recurrenceRecord, "until_year"),
    until_month: readIntegerOrNull(recurrenceRecord, "until_month"),
    until_day: readIntegerOrNull(recurrenceRecord, "until_day"),
    count: readIntegerOrNull(recurrenceRecord, "count"),
  };
}

function readWeekdayOrNull(
  jsonRecord: JsonRecord,
  fieldName: string,
): Weekday | null {
  const fieldValue = readStringOrNull(jsonRecord, fieldName);
  if (fieldValue !== null && !isWeekday(fieldValue)) {
    throw new Error(`${fieldName} is not a weekday: ${fieldValue}`);
  }
  return fieldValue;
}
