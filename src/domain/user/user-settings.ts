import type { IanaTimeZone } from "../../generic/date-time/time-zone";

// Represents the language and time zone a user chose. null means not chosen.
export interface UserSettings {
  language: string | null;
  timeZone: IanaTimeZone | null;
}
