import type { UserUsageRow } from "../db/schema/userUsageRow";
import { userUsageTableStatement } from "../db/schema/userUsageTable";
import {
  CONSUME_USER_QUOTA,
  QUOTA_RESET_AFTER_MS,
  REFUND_USER_QUOTA,
  SELECT_USER_USAGE,
} from "../db/sql/userUsage";
import type {
  QuotaReservation,
  UserQuotaConsumeResult,
} from "../policy/userQuotaPolicy";

export class UserUsageRepository {
  constructor(private readonly db: D1Database) {}

  async find(
    userId: number,
    now: Date,
    dailyQuota: number,
  ): Promise<UserUsageRow | null> {
    const results = await this.db.batch<UserUsageRow>([
      userUsageTableStatement(this.db),
      this.db
        .prepare(SELECT_USER_USAGE)
        .bind(now.getTime(), userId, dailyQuota),
    ]);
    return results[1].results[0] ?? null;
  }

  // Reads first. So a user with no quota left costs one read and no write.
  async tryConsume(
    userId: number,
    now: Date,
    dailyQuota: number,
  ): Promise<UserQuotaConsumeResult> {
    const nowMs = now.getTime();
    const previous = await this.find(userId, now, dailyQuota);
    const available = previous?.remainingQuota ?? dailyQuota;
    if (available <= 0) {
      return {
        successful: false,
        remainingQuota: 0,
        retryAt: (previous?.lastUsedAt ?? nowMs) + QUOTA_RESET_AFTER_MS,
      };
    }

    const consumed = await this.db
      .prepare(CONSUME_USER_QUOTA)
      .bind(nowMs, userId, dailyQuota)
      .run();
    if (consumed.meta.changes === 0) {
      // Another message from this user took the last unit between the read
      // and the write.
      return {
        successful: false,
        remainingQuota: 0,
        retryAt: nowMs + QUOTA_RESET_AFTER_MS,
      };
    }

    const remainingQuota = available - 1;
    return {
      successful: true,
      remainingQuota,
      retryAt: remainingQuota === 0 ? nowMs + QUOTA_RESET_AFTER_MS : 0,
      reservation: {
        userId,
        dailyQuota,
        consumedAt: nowMs,
        previousRemainingQuota: available,
        previousLastUsedAt: previous?.lastUsedAt ?? 0,
      },
    };
  }

  async refund(reservation: QuotaReservation): Promise<void> {
    await this.db
      .prepare(REFUND_USER_QUOTA)
      .bind(
        reservation.userId,
        reservation.consumedAt,
        reservation.previousRemainingQuota,
        reservation.previousLastUsedAt,
        reservation.dailyQuota,
      )
      .run();
  }
}
