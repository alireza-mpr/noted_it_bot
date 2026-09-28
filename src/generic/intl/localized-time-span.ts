const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

// Represents a unit of a span of time.
export type TimeSpanUnit = "minute" | "hour" | "day" | "week" | "month" | "year";

// Returns a span of time in the language, e.g. "3 days" or "۳ روز".
export function formatTimeSpan(
  value: number,
  timeSpanUnit: TimeSpanUnit,
  language: string,
): string {
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: timeSpanUnit,
    unitDisplay: "long",
  }).format(value);
}

// Returns the time from one moment until a later one, in hours and minutes in
// the language, e.g. "2 hours, 5 minutes" or "۲ ساعت، ۵ دقیقه". It rounds up
// to the next minute, and is never below zero.
export function formatTimeUntil(
  fromMoment: Date,
  untilMoment: Date,
  language: string,
): string {
  const totalMinutes = Math.max(
    0,
    Math.ceil((untilMoment.getTime() - fromMoment.getTime()) / MS_PER_MINUTE),
  );
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  const timeSpans = [
    ...(hours > 0 ? [formatTimeSpan(hours, "hour", language)] : []),
    ...(minutes > 0 || hours === 0
      ? [formatTimeSpan(minutes, "minute", language)]
      : []),
  ];
  return new Intl.ListFormat(language, { style: "long", type: "unit" }).format(
    timeSpans,
  );
}
