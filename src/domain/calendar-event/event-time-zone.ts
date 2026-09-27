import type { IanaTimeZone } from "../../generic/date-time/time-zone";

// Represents where an event's time zone comes from.
export type EventTimeZone =
  | { kind: "from-message"; timeZone: IanaTimeZone }
  | { kind: "from-user"; timeZone: IanaTimeZone }
  | { kind: "floating" };

// Returns the event's time zone, or null for floating times.
export function ianaTimeZoneOf(
  eventTimeZone: EventTimeZone,
): IanaTimeZone | null {
  return eventTimeZone.kind === "floating" ? null : eventTimeZone.timeZone;
}
