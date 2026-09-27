import { UserUsageRepository } from "../repositories/userUsageRepository";
import { UserQuotaPolicyLogger } from "./userQuotaPolicyLogger";

export interface UserQuotaConsumeResult {
  successful: boolean;
  remainingQuota: number;
  retryAt: number;
  // Set when a unit was taken. So it can be given back if no model answers.
  reservation?: QuotaReservation;
}

export interface QuotaReservation {
  userId: number;
  dailyQuota: number;
  consumedAt: number;
  previousRemainingQuota: number;
  previousLastUsedAt: number;
}

export class UserQuotaPolicy {
  readonly logger = new UserQuotaPolicyLogger();
  private repository: UserUsageRepository | undefined;

  init(usageDb: D1Database): void {
    this.repository = new UserUsageRepository(usageDb);
  }

  async tryConsume(
    userId: number,
    dailyQuota: number,
  ): Promise<UserQuotaConsumeResult> {
    if (!this.repository) {
      throw new Error("userQuotaPolicy: call init first");
    }

    return this.repository.tryConsume(userId, new Date(), dailyQuota);
  }

  async refund(reservation: QuotaReservation): Promise<void> {
    if (!this.repository) {
      throw new Error("userQuotaPolicy: call init first");
    }

    await this.repository.refund(reservation);
  }
}

export const userQuotaPolicy = new UserQuotaPolicy();
