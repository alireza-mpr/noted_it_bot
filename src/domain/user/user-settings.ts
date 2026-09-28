import type { IanaTimeZone } from "../../generic/date-time/time-zone";
import type { SupportedLanguage } from "./supported-language";

// Represents the language and time zone a user chose. null means not chosen.
export interface UserSettings {
  language: SupportedLanguage | null;
  timeZone: IanaTimeZone | null;
}
