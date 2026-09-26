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

  async getLang(userId: number): Promise<string | null> {
    return (await this.find(userId))?.lang ?? null;
  }

  async getTimezone(userId: number, defaultTimezone: string): Promise<string> {
    return (await this.find(userId))?.timezone ?? defaultTimezone;
  }

  async setLang(
    userId: number,
    lang: string | null,
    defaultTimezone: string,
  ): Promise<void> {
    await this.run([
      this.db.prepare(SET_USER_LANG).bind(userId, lang, defaultTimezone),
    ]);
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
