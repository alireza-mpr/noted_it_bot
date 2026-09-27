import type { TimeOfDay } from "../../generic/date-time/time-of-day";

// Represents when an event happens during its day: all day, or from a start
// time to an end time.
export type EventTime =
  | { kind: "all-day" }
  | { kind: "timed"; start: TimeOfDay; end: TimeOfDay };
