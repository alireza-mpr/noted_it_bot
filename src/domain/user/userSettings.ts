import type { IanaZone } from "../dates/timeZone";

// Represents what a user has chosen. The language is null when the user has
// not chosen one with /lang (Telegram's language is used). The time zone is
// null when the user has not set one with /tz.
export interface UserSettings {
  language: string | null;
  timeZone: IanaZone | null;
}
