// Represents a time of day on a 24-hour clock.
export interface TimeOfDay {
  hour: number;
  minute: number;
}

// Returns true if the first time of day is earlier than the second.
export function isTimeBefore(
  firstTime: TimeOfDay,
  secondTime: TimeOfDay,
): boolean {
  return minutesSinceMidnight(firstTime) < minutesSinceMidnight(secondTime);
}

function minutesSinceMidnight(time: TimeOfDay): number {
  return time.hour * 60 + time.minute;
}
