import { UserUsageRepository } from "../repositories/userUsageRepository";
import { UserQuotaPolicyLogger } from "./userQuotaPolicyLogger";

// Enough to undo one use of the quota exactly (see REFUND_USER_QUOTA).
export interface QuotaReservation {
  userId: number;
  dailyQuota: number;
  consumedAt: number;
  previousRemainingQuota: number;
  previousLastUsedAt: number;
}

export type QuotaResult =
  | { allowed: true; remaining: number; reservation: QuotaReservation }
  | { allowed: false; retryAt: number };

// The rules for a user's daily quota. Rules per user (for example tiers with
// different quotas) belong here.
export class UserQuotaPolicy {
  readonly logger = new UserQuotaPolicyLogger();
  private readonly repository: UserUsageRepository;

  constructor(usageDb: D1Database) {
    this.repository = new UserUsageRepository(usageDb);
  }

  // Uses one unit of the user's daily quota, if one is left.
  async tryConsume(userId: number, dailyQuota: number): Promise<QuotaResult> {
    return this.repository.tryConsume(userId, new Date(), dailyQuota);
  }

  // Gives back a unit, for a message that no model answered.
  async refund(reservation: QuotaReservation): Promise<void> {
    await this.repository.refund(reservation);
  }
}
