import type { QuotaReservation, QuotaResult, UsageStore } from "./usage-store";

// The time after the last use when a user's daily quota is full again. See
// ADR-1 in ARCHITECTURE_DECISIONS.md.
export const QUOTA_RESET_AFTER_MS = 24 * 60 * 60 * 1000;

// Represents the quota rules for a user: how many messages a day (tiers,
// later). Create one per request.
export class UserQuotaPolicy {
  constructor(
    private readonly usageStore: UsageStore,
    private readonly dailyQuota: number,
  ) {}

  // Consumes one unit of the user's daily quota, if one is left.
  tryConsume(userId: number, now: Date): Promise<QuotaResult> {
    return this.usageStore.tryConsume(userId, this.dailyQuota, now);
  }

  // Refunds a unit, for a message that no model answered.
  refund(reservation: QuotaReservation): Promise<void> {
    return this.usageStore.refund(reservation);
  }
}
