import type { UserUsageRow } from "../db/schema/userUsageRow";
import { userUsageTableStatement } from "../db/schema/userUsageTable";
import {
  CONSUME_USER_QUOTA,
  QUOTA_RESET_AFTER_MS,
  SELECT_USER_USAGE,
} from "../db/sql/userUsage";
import type { UserQuotaConsumeResult } from "../policy/userQuotaPolicy";

export class UserUsageRepository {
  constructor(private readonly db: D1Database) {}

  async find(
    userId: number,
    now: Date,
    dailyQuota: number,
  ): Promise<UserUsageRow | null> {
    const results = await this.run<UserUsageRow>([
      this.db
        .prepare(SELECT_USER_USAGE)
        .bind(now.getTime(), userId, dailyQuota),
    ]);
    return results[1].results[0] ?? null;
  }

  async tryConsume(
    userId: number,
    now: Date,
    dailyQuota: number,
  ): Promise<UserQuotaConsumeResult> {
    const nowMs = now.getTime();
    const results = await this.run<UserUsageRow>([
      this.db
        .prepare(CONSUME_USER_QUOTA)
        .bind(nowMs, userId, dailyQuota),
      this.db
        .prepare(SELECT_USER_USAGE)
        .bind(nowMs, userId, dailyQuota),
    ]);

    const row = results[2].results[0];
    if (!row) {
      throw new Error(`userUsage: no row for ${userId} after consume`);
    }

    return {
      successful: results[1].meta.changes > 0,
      remainingQuota: row.remainingQuota,
      retryAt: row.remainingQuota === 0 ? row.lastUsedAt + QUOTA_RESET_AFTER_MS : 0,
    };
  }

  private async run<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    return this.db.batch<T>([userUsageTableStatement(this.db), ...statements]);
  }
}
