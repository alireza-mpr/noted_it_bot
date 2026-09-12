export const EVENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    title:         { type: "STRING",  nullable: true },

    calendar:      { type: "STRING",  enum: ["gregorian", "jalali", "unknown"] },
    date_kind:     { type: "STRING",  enum: ["absolute", "relative", "weekday", "none"] },

    year:          { type: "INTEGER", nullable: true },
    month:         { type: "INTEGER", nullable: true },
    day:           { type: "INTEGER", nullable: true },

    start_time:    { type: "STRING",  nullable: true },
    end_time:      { type: "STRING",  nullable: true },

    timezone_hint: { type: "STRING",  nullable: true },
    location:      { type: "STRING",  nullable: true },

    confidence:    { type: "NUMBER" },
  },
  required: ["calendar", "date_kind", "confidence"],
  propertyOrdering: [
    "title", "calendar", "date_kind",
    "year", "month", "day",
    "start_time", "end_time",
    "timezone_hint", "location", "confidence",
  ],
} as const;