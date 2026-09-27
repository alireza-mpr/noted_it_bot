// Represents a calendar that a message can write its dates in. The values are
// the date library's calendar ids. See "Calendars are data" in
// docs/EDGE_CASES.md.
export type CalendarId =
  | "gregory"
  | "persian"
  | "hebrew"
  | "buddhist"
  | "indian";
