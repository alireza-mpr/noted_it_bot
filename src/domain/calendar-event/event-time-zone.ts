import type { IanaTimeZone } from "../../generic/date-time/time-zone";

// Represents where an event's time zone comes from.
export type EventTimeZone =
  | { kind: "from-message"; timeZone: IanaTimeZone }
  | { kind: "from-user"; timeZone: IanaTimeZone }
  | { kind: "floating" };
