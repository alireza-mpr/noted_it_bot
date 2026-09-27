const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export const EVENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    title:         { type: "STRING",  nullable: true },

    calendar:      { type: "STRING",  nullable: true },
    date_kind:     { type: "STRING",  enum: ["absolute", "relative", "weekday", "none"] },

    year:          { type: "INTEGER", nullable: true },
    month:         { type: "INTEGER", nullable: true },
    day:           { type: "INTEGER", nullable: true },
    // The day of the week the message states for the date ("Saturday 26 Sep").
    weekday:       { type: "STRING",  nullable: true, enum: WEEKDAYS },

    start_time:    { type: "STRING",  nullable: true },
    end_time:      { type: "STRING",  nullable: true },

    timezone_hint: { type: "STRING",  nullable: true },
    location:      { type: "STRING",  nullable: true },

    // null for a one-off event. Set only when the message clearly says it repeats.
    recurrence: {
      type: "OBJECT",
      nullable: true,
      properties: {
        frequency:  { type: "STRING", enum: ["daily", "weekly", "monthly", "yearly"] },
        interval:   { type: "INTEGER" },
        weekdays:   { type: "ARRAY", nullable: true, items: { type: "STRING", enum: WEEKDAYS } },
        ordinal:    { type: "INTEGER", nullable: true },
        month_day:  { type: "INTEGER", nullable: true },

        end_kind:   { type: "STRING", enum: ["never", "until", "count"] },
        until_year:  { type: "INTEGER", nullable: true },
        until_month: { type: "INTEGER", nullable: true },
        until_day:   { type: "INTEGER", nullable: true },
        count:       { type: "INTEGER", nullable: true },
      },
      required: ["frequency", "interval", "end_kind"],
      propertyOrdering: [
        "frequency", "interval", "weekdays", "ordinal", "month_day",
        "end_kind", "until_year", "until_month", "until_day", "count",
      ],
    },

    confidence:    { type: "NUMBER" },
  },
  required: ["calendar", "date_kind", "confidence"],
  propertyOrdering: [
    "title", "calendar", "date_kind",
    "year", "month", "day", "weekday",
    "start_time", "end_time",
    "timezone_hint", "location", "recurrence", "confidence",
  ],
} as const;
