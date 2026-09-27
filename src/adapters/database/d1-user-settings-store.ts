import type { UserSettings } from "../../domain/user/user-settings";
import type { UserSettingsStore } from "../../domain/user/user-settings-store";
import {
  type IanaTimeZone,
  parseTimeZoneName,
} from "../../generic/date-time/time-zone";
import { batchWithTable } from "./batch-with-table";

const CREATE_USER_PREFERENCE_TABLE = `
CREATE TABLE IF NOT EXISTS user_preference (
  userId   INTEGER NOT NULL PRIMARY KEY,
  lang     TEXT,
  timezone TEXT
)`;

const SELECT_USER_PREFERENCE = `
SELECT lang, timezone
FROM user_preference
WHERE userId = ?`;

const SET_USER_LANG = `
INSERT INTO user_preference (userId, lang, timezone)
VALUES (?, ?, NULL)
ON CONFLICT(userId) DO UPDATE SET
  lang = excluded.lang`;

const SET_USER_TIMEZONE = `
INSERT INTO user_preference (userId, lang, timezone)
VALUES (?, NULL, ?)
ON CONFLICT(userId) DO UPDATE SET
  timezone = excluded.timezone`;

// Represents the user settings stored in D1, one row per user.
export class D1UserSettingsStore implements UserSettingsStore {
  constructor(private readonly d1Database: D1Database) {}

  // Returns the user's settings. A user who chose nothing gets null for each
  // setting.
  async read(userId: number): Promise<UserSettings> {
    const [d1Result] = await this.batch<UserPreferenceRow>(
      this.d1Database.prepare(SELECT_USER_PREFERENCE).bind(userId),
    );
    const userPreferenceRow = d1Result.results[0] ?? null;
    return {
      language: userPreferenceRow?.lang ?? null,
      timeZone: timeZoneOf(userPreferenceRow?.timezone ?? null),
    };
  }

  // Sets the user's language. null means "use Telegram's language".
  async setLanguage(userId: number, language: string | null): Promise<void> {
    await this.batch(
      this.d1Database.prepare(SET_USER_LANG).bind(userId, language),
    );
  }

  // Sets the user's time zone.
  async setTimeZone(userId: number, timeZone: IanaTimeZone): Promise<void> {
    await this.batch(
      this.d1Database.prepare(SET_USER_TIMEZONE).bind(userId, timeZone),
    );
  }

  private batch<Row = unknown>(
    statement: D1PreparedStatement,
  ): Promise<D1Result<Row>[]> {
    return batchWithTable<Row>(this.d1Database, CREATE_USER_PREFERENCE_TABLE, [
      statement,
    ]);
  }
}

// Represents a user_preference row.
interface UserPreferenceRow {
  lang: string | null;
  timezone: string | null;
}

// Returns the stored time zone, or null if there is none or it is not a time
// zone.
function timeZoneOf(timeZoneName: string | null): IanaTimeZone | null {
  return timeZoneName === null ? null : parseTimeZoneName(timeZoneName);
}
