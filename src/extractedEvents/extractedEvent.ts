export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number; // repeat every N units (days, weeks, …); 1 = every one
  weekdays: Weekday[] | null; // "every Mon and Wed"
  ordinal: number | null; // only for monthly + weekdays: 1..4, or -1 for "last" (first Friday = 1 + FR)
  month_day: number | null; // monthly: "on the 15th"

  // "never" is allowed: the series has no end, and we add no limit.
  end_kind: "never" | "until" | "count";
  until_year: number | null; // null: toGregorianEvent picks the year
  until_month: number | null;
  until_day: number | null;
  count: number | null; // "for 6 weeks" -> 6
}

export interface ExtractedEvent {
  title: string | null;
  // The calendar of the written date, as the model names it. null when the
  // message writes no date.
  calendar: string | null;
  // "weekday" with year/month/day null is the normal shape of a repeat with no
  // start date ("every Sunday at 5pm").
  date_kind: "absolute" | "relative" | "weekday" | "none";
  year: number | null;
  month: number | null; // 1-12
  day: number | null; // 1-31
  // The weekday the message states for the date. Used to pick the year when
  // the message has none. Optional, so older events without it still work.
  weekday?: Weekday | null;
  start_time: string | null; // "HH:MM", 24h
  end_time: string | null;
  timezone_hint: string | null; // IANA name, or null
  location: string | null;
  recurrence?: Recurrence | null; // missing or null: a one-off event
  confidence: number; // 0.0 - 1.0
}
