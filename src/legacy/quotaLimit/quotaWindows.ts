const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function currentDay(now: Date): string {
  return PACIFIC_DAY.format(now);
}

export function currentMinute(now: Date): string {
  return now.toISOString().slice(0, 16);
}
