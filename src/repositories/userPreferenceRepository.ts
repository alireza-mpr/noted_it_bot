import type { UserPreferenceRow } from "../db/schema/userPreferenceRow";
import { userPreferenceTableStatement } from "../db/schema/userPreferenceTable";
import {
  SELECT_USER_PREFERENCE,
  SET_USER_LANG,
  SET_USER_TIMEZONE,
} from "../db/sql/userPreference";

export class UserPreferenceRepository {
  constructor(private readonly db: D1Database) {}

  async find(userId: number): Promise<UserPreferenceRow | null> {
    const results = await this.run<UserPreferenceRow>([
      this.db.prepare(SELECT_USER_PREFERENCE).bind(userId),
    ]);
    return results[1].results[0] ?? null;
  }

  // A /lang choice replaces Telegram's language (message.from.language_code)
  // for all of that user's future replies. null means "use Telegram's".
  async setLang(userId: number, lang: string | null): Promise<void> {
    await this.run([this.db.prepare(SET_USER_LANG).bind(userId, lang)]);
  }

  async setTimezone(userId: number, timezone: string): Promise<void> {
    await this.run([this.db.prepare(SET_USER_TIMEZONE).bind(userId, timezone)]);
  }

  private async run<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    return this.db.batch<T>([userPreferenceTableStatement(this.db), ...statements]);
  }
}
