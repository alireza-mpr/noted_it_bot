const AEST_CLOCK = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function dateTimeAest(now: Date): string {
  const part = (type: string) =>
    AEST_CLOCK.formatToParts(now).find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}
