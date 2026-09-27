// Represents a unit of time that a repeat counts in.
export type TimeUnit = "day" | "week" | "month" | "year";

// Returns the number in the language's digits.
export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(language).format(value);
}

// Returns a span of time in the language, e.g. "3 days" or "۳ روز".
export function formatTimeSpan(
  value: number,
  timeUnit: TimeUnit,
  language: string,
): string {
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: timeUnit,
    unitDisplay: "long",
  }).format(value);
}
