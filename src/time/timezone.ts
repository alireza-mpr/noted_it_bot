import { toUtcDate, type DateOnly, type TimeOfDay } from "./dateOnly";

// Converts a local date and time in `timeZone` to a UTC Date, with no
// external library. The trick: format the same moment in the target zone and
// in UTC. The difference is the zone's offset at that moment. This handles
// daylight saving, because the offset is found for that exact moment.
export function zonedTimeToUtc(date: DateOnly, time: TimeOfDay, timeZone: string): Date {
  const asUtc = toUtcDate(date, time);
  const inZone = new Date(asUtc.toLocaleString("en-US", { timeZone }));
  const inUtc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() + (inUtc.getTime() - inZone.getTime()));
}

// Returns the standard IANA name of a zone ("Iran" becomes "Asia/Tehran"), or
// null if Intl does not know the name ("Iran Standard Time").
export function ianaZone(name: string): string | null {
  try {
    return new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
