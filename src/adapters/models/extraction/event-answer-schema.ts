import type { Weekday } from "../../../generic/date-time/date-only";
import type { ResponseSchema } from "../model-result";

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// Represents a model's answer for a message, after its shape is checked. The
// field names are the contract with the model: the prompt uses them. So they
// keep the words the prompt was tested with (e.g. recurrence, not repeat).
export interface EventAnswer {
  title: string | null;
  calendar: string | null;
  date_kind: DateKind;
  year: number | null;
  month: number | null;
  day: number | null;
  weekday: Weekday | null;
  relative_date: RelativeDateAnswer | null;
  start_time: string | null;
  end_time: string | null;
  timezone_hint: string | null;
  location: string | null;
  recurrence: RecurrenceAnswer | null;
  confidence: number;
}

// Represents what kind of date the message writes.
export type DateKind = "absolute" | "relative" | "weekday" | "none";

// Represents a date relative to now, as the model describes it: a number of
// days from today, or a weekday with which week it is in. The model never
// works out the date itself; our code does.
export interface RelativeDateAnswer {
  days_from_today: number | null;
  weekday: Weekday | null;
  which_week: "this" | "next" | null;
}

// Represents a repeat as the model describes it.
export interface RecurrenceAnswer {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  weekdays: string[] | null;
  ordinal: number | null;
  month_day: number | null;
  end_kind: "never" | "until" | "count";
  until_year: number | null;
  until_month: number | null;
  until_day: number | null;
  count: number | null;
}

// Represents the schema that the model's answer must follow.
export const EVENT_ANSWER_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", nullable: true },

    calendar: { type: "STRING", nullable: true },
    date_kind: {
      type: "STRING",
      enum: ["absolute", "relative", "weekday", "none"],
    },

    year: { type: "INTEGER", nullable: true },
    month: { type: "INTEGER", nullable: true },
    day: { type: "INTEGER", nullable: true },
    weekday: { type: "STRING", nullable: true, enum: WEEKDAYS },
    relative_date: {
      type: "OBJECT",
      nullable: true,
      properties: {
        days_from_today: { type: "INTEGER", nullable: true },
        weekday: { type: "STRING", nullable: true, enum: WEEKDAYS },
        which_week: { type: "STRING", nullable: true, enum: ["this", "next"] },
      },
      propertyOrdering: ["days_from_today", "weekday", "which_week"],
    },

    start_time: { type: "STRING", nullable: true },
    end_time: { type: "STRING", nullable: true },

    timezone_hint: { type: "STRING", nullable: true },
    location: { type: "STRING", nullable: true },

    recurrence: {
      type: "OBJECT",
      nullable: true,
      properties: {
        frequency: {
          type: "STRING",
          enum: ["daily", "weekly", "monthly", "yearly"],
        },
        interval: { type: "INTEGER" },
        weekdays: {
          type: "ARRAY",
          nullable: true,
          items: { type: "STRING", enum: WEEKDAYS },
        },
        ordinal: { type: "INTEGER", nullable: true },
        month_day: { type: "INTEGER", nullable: true },

        end_kind: { type: "STRING", enum: ["never", "until", "count"] },
        until_year: { type: "INTEGER", nullable: true },
        until_month: { type: "INTEGER", nullable: true },
        until_day: { type: "INTEGER", nullable: true },
        count: { type: "INTEGER", nullable: true },
      },
      required: ["frequency", "interval", "end_kind"],
      propertyOrdering: [
        "frequency",
        "interval",
        "weekdays",
        "ordinal",
        "month_day",
        "end_kind",
        "until_year",
        "until_month",
        "until_day",
        "count",
      ],
    },

    confidence: { type: "NUMBER" },
  },
  required: ["calendar", "date_kind", "confidence"],
  propertyOrdering: [
    "title",
    "calendar",
    "date_kind",
    "year",
    "month",
    "day",
    "weekday",
    "relative_date",
    "start_time",
    "end_time",
    "timezone_hint",
    "location",
    "recurrence",
    "confidence",
  ],
};
