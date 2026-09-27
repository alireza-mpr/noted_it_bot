import type { IanaTimeZone } from "../../generic/date-time/time-zone";
import type { UserSettings } from "./user-settings";

// Represents where the user settings are stored. A port: the database adapter
// implements it.
export interface UserSettingsStore {
  // Returns the user's settings. A user who chose nothing gets null for each
  // setting.
  read(userId: number): Promise<UserSettings>;
  // Sets the user's language. null means "use Telegram's language".
  setLanguage(userId: number, language: string | null): Promise<void>;
  // Sets the user's time zone.
  setTimeZone(userId: number, timeZone: IanaTimeZone): Promise<void>;
}
