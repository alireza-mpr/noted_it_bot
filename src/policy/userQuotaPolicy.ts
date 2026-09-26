import { UserUsageRepository } from "../repositories/userUsageRepository";
import { UserQuotaPolicyLogger } from "./userQuotaPolicyLogger";

export interface UserQuotaConsumeResult {
  successful: boolean;
  remainingQuota: number;
  retryAt: number;
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
}

export const userQuotaPolicy = new UserQuotaPolicy();
