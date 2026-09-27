export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number; // every N frequency-units; 1 = every one
  weekdays: Weekday[] | null; // "every Mon and Wed"
  ordinal: number | null; // monthly + weekdays: 1..4, or -1 for "last" (first Friday = 1 + FR)
  month_day: number | null; // monthly: "on the 15th"

  // "never" is allowed and means an open-ended series — no cap is applied.
  end_kind: "never" | "until" | "count";
  until_year: number | null; // null year = infer, same as the event's own year
  until_month: number | null;
  until_day: number | null;
  count: number | null; // "for 6 weeks" -> 6
}

export interface ExtractedEvent {
  title: string | null;
  // The calendar an explicit date is written in, as the model names it; null when the message writes no date.
  calendar: string | null;
  // "weekday" with year/month/day null is the normal shape for a recurring
  // event with no stated start date ("every Sunday at 5pm").
  date_kind: "absolute" | "relative" | "weekday" | "none";
  year: number | null;
  month: number | null; // 1-12
  day: number | null; // 1-31
  // The weekday the message states for that date, used to pick the year when
  // none is stated. Optional so events built before the field existed still work.
  weekday?: Weekday | null;
  start_time: string | null; // "HH:MM", 24h
  end_time: string | null;
  timezone_hint: string | null; // IANA name, or null
  location: string | null;
  recurrence?: Recurrence | null; // absent/null = one-off event
  confidence: number; // 0.0 - 1.0
}
