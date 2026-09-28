import {
  parseTimeZoneName,
  type IanaTimeZone,
} from "../../generic/date-time/time-zone";

// Matches "Area/Location" time zone names, e.g. "Australia/Melbourne".
const AREA_TIME_ZONE_NAME = /^[A-Za-z_+\-0-9]+(\/[A-Za-z_+\-0-9]+)+$/;

// Matches "UTC" and "GMT", in any casing.
const UTC_NAME = /^(utc|gmt)$/i;

// Returns the time zone a user typed, or null if the name is not allowed.
// See "Time zones" in docs/EDGE_CASES.md.
export function parseUserTimeZoneName(name: string): IanaTimeZone | null {
  const trimmedName = name.trim();
  if (!AREA_TIME_ZONE_NAME.test(trimmedName) && !UTC_NAME.test(trimmedName)) {
    return null;
  }
  return parseTimeZoneName(trimmedName);
}
