export interface ExtractedEvent {
  title: string | null;
  calendar: "gregorian" | "jalali" | "unknown";
  date_kind: "absolute" | "relative" | "weekday" | "none";
  year: number | null;
  month: number | null; // 1-12
  day: number | null; // 1-31
  start_time: string | null; // "HH:MM", 24h
  end_time: string | null;
  timezone_hint: string | null; // IANA name, or null
  location: string | null;
  confidence: number; // 0.0 - 1.0
}
