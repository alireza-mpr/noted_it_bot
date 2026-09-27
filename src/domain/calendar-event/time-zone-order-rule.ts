import type { IanaTimeZone } from "../../generic/date-time/time-zone";
import type { EventTimeZone } from "./event-time-zone";

// Returns the event time zone: the message time zone, else the user time
// zone, else floating. See "Time zones" in docs/EDGE_CASES.md.
export function eventTimeZoneOf(
  messageTimeZone: IanaTimeZone | null,
  userTimeZone: IanaTimeZone | null,
): EventTimeZone {
  if (messageTimeZone !== null) {
    return { kind: "from-message", timeZone: messageTimeZone };
  }
  return userTimeZone !== null
    ? { kind: "from-user", timeZone: userTimeZone }
    : { kind: "floating" };
}
