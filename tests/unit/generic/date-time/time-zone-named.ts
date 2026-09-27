import {
  parseTimeZoneName,
  type IanaTimeZone,
} from "../../../../src/generic/date-time/time-zone";

// Returns the IanaTimeZone for a time zone name. Throws if the name is not
// a time zone.
export function timeZoneNamed(name: string): IanaTimeZone {
  const timeZone = parseTimeZoneName(name);
  if (timeZone === null) {
    throw new Error(`not a time zone: ${name}`);
  }
  return timeZone;
}
