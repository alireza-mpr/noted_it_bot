// Represents a calendar date with no time and no time zone. Months and days
// start at 1.
export interface DateOnly {
  year: number;
  month: number;
  day: number;
}

// Represents a time of day on a 24-hour clock.
export interface TimeOfDay {
  hour: number;
  minute: number;
}

// Represents a day of the week, written as in iCalendar ("MO" is Monday).
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
