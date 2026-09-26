import type { UserPreferenceRow } from "../db/schema/userPreferenceRow";
import { userPreferenceTableStatement } from "../db/schema/userPreferenceTable";
import {
  CLEAR_USER_LANG,
  SELECT_USER_PREFERENCE,
  SET_USER_LANG,
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

  async setLang(userId: number, lang: string): Promise<void> {
    await this.run([this.db.prepare(SET_USER_LANG).bind(userId, lang)]);
  }

  async clearLang(userId: number): Promise<void> {
    await this.run([this.db.prepare(CLEAR_USER_LANG).bind(userId)]);
  }

  private async run<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    return this.db.batch<T>([userPreferenceTableStatement(this.db), ...statements]);
  }
}
