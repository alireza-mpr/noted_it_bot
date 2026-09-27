import type {
  QuotaReservation,
  QuotaResult,
  UsageStore,
} from "../../domain/quota/usage-store";
import { QUOTA_RESET_AFTER_MS } from "../../domain/quota/user-quota-policy";
import { batchWithTable } from "./batch-with-table";

// The parameters of SELECT_USER_USAGE and CONSUME_USER_QUOTA: ?1 now, ?2
// userId, ?3 dailyQuota, ?4 QUOTA_RESET_AFTER_MS.
const QUOTA_RESET = "(?1 - lastUsedAt >= ?4)";
const EFFECTIVE_REMAINING = `(CASE WHEN ${QUOTA_RESET} THEN ?3 ELSE remainingQuota END)`;

const CREATE_USER_USAGE_TABLE = `
CREATE TABLE IF NOT EXISTS user_usage (
  userId         INTEGER NOT NULL PRIMARY KEY,
  remainingQuota INTEGER NOT NULL CHECK (remainingQuota >= 0),
  lastUsedAt     INTEGER NOT NULL DEFAULT 0
)`;

const SELECT_USER_USAGE = `
SELECT
  ${EFFECTIVE_REMAINING} AS remainingQuota,
  lastUsedAt
FROM user_usage
WHERE userId = ?2`;

const CONSUME_USER_QUOTA = `
INSERT INTO user_usage (userId, remainingQuota, lastUsedAt)
VALUES (?2, ?3 - 1, ?1)
ON CONFLICT(userId) DO UPDATE SET
  remainingQuota = ${EFFECTIVE_REMAINING} - 1,
  lastUsedAt     = excluded.lastUsedAt
WHERE ${EFFECTIVE_REMAINING} > 0`;

// Undoes one CONSUME_USER_QUOTA made at time ?2.
// - If no other consume changed the row since then: the row goes back exactly
//   to how it was, lastUsedAt too. So an unanswered message does not move the
//   reset time.
// - Otherwise: one unit is given back.
const REFUND_USER_QUOTA = `
UPDATE user_usage SET
  remainingQuota = CASE WHEN lastUsedAt = ?2 THEN ?3 ELSE MIN(remainingQuota + 1, ?5) END,
  lastUsedAt     = CASE WHEN lastUsedAt = ?2 THEN ?4 ELSE lastUsedAt END
WHERE userId = ?1`;

// Represents the quota usage stored in D1, one row per user. See ADR-1 to
// ADR-3 in ARCHITECTURE_DECISIONS.md.
export class D1UsageStore implements UsageStore {
  constructor(private readonly d1Database: D1Database) {}

  // Consumes one unit of the user's daily quota, if one is left. Reads first,
  // so a user with no quota left costs one read and no write (ADR-2).
  async tryConsume(
    userId: number,
    dailyQuota: number,
    now: Date,
  ): Promise<QuotaResult> {
    const nowMs = now.getTime();
    const userUsageRow = await this.read(userId, dailyQuota, nowMs);
    const remainingQuota = userUsageRow?.remainingQuota ?? dailyQuota;
    const lastUsedAtMs = userUsageRow?.lastUsedAt ?? 0;
    if (remainingQuota <= 0) {
      return { ok: false, retryAt: new Date(lastUsedAtMs + QUOTA_RESET_AFTER_MS) };
    }

    const d1Result = await this.d1Database
      .prepare(CONSUME_USER_QUOTA)
      .bind(nowMs, userId, dailyQuota, QUOTA_RESET_AFTER_MS)
      .run();
    if (d1Result.meta.changes === 0) {
      // Another message from this user took the last unit between the read
      // and the write.
      return { ok: false, retryAt: new Date(nowMs + QUOTA_RESET_AFTER_MS) };
    }

    return {
      ok: true,
      remaining: remainingQuota - 1,
      reservation: {
        userId,
        dailyQuota,
        consumedAt: now,
        previousRemainingQuota: remainingQuota,
        previousLastUsedAt: new Date(lastUsedAtMs),
      },
    };
  }

  // Refunds a unit, for a message that no model answered. See
  // REFUND_USER_QUOTA.
  async refund(quotaReservation: QuotaReservation): Promise<void> {
    await this.d1Database
      .prepare(REFUND_USER_QUOTA)
      .bind(
        quotaReservation.userId,
        quotaReservation.consumedAt.getTime(),
        quotaReservation.previousRemainingQuota,
        quotaReservation.previousLastUsedAt.getTime(),
        quotaReservation.dailyQuota,
      )
      .run();
  }

  private async read(
    userId: number,
    dailyQuota: number,
    nowMs: number,
  ): Promise<UserUsageRow | null> {
    const [d1Result] = await batchWithTable<UserUsageRow>(
      this.d1Database,
      CREATE_USER_USAGE_TABLE,
      [
        this.d1Database
          .prepare(SELECT_USER_USAGE)
          .bind(nowMs, userId, dailyQuota, QUOTA_RESET_AFTER_MS),
      ],
    );
    return d1Result.results[0] ?? null;
  }
}

// Represents a user_usage row, with the quota reset already applied.
interface UserUsageRow {
  remainingQuota: number;
  lastUsedAt: number;
}
