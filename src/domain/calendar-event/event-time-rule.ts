import type { TimeOfDay } from "../../generic/date-time/time-of-day";
import type { EventTime } from "./event-time";

// Returns the event time from the times that the message states. See "Event
// time" in docs/EDGE_CASES.md.
export function eventTimeOf(
  startTime: TimeOfDay | null,
  endTime: TimeOfDay | null,
): EventTime {
  if (startTime === null) {
    return { kind: "all-day" };
  }
  return {
    kind: "timed",
    start: startTime,
    end: endTime ?? oneHourAfter(startTime),
  };
}

function oneHourAfter(time: TimeOfDay): TimeOfDay {
  return { hour: (time.hour + 1) % 24, minute: time.minute };
}
