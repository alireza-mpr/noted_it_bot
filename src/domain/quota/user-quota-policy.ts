import type { QuotaReservation, QuotaResult, UsageStore } from "./usage-store";

// Represents the quota rules for a user (e.g. tiers, later). Create one per
// request.
export class UserQuotaPolicy {
  constructor(private readonly usageStore: UsageStore) {}

  // Consumes one unit of the user's daily quota, if one is left.
  tryConsume(
    userId: number,
    dailyQuota: number,
    now: Date,
  ): Promise<QuotaResult> {
    return this.usageStore.tryConsume(userId, dailyQuota, now);
  }

  // Refunds a unit, for a message that no model answered.
  refund(reservation: QuotaReservation): Promise<void> {
    return this.usageStore.refund(reservation);
  }
}
