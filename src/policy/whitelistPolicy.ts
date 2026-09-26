import { WhitelistRepository } from "../repositories/whitelistRepository";
import { WhitelistPolicyLogger } from "./whitelistPolicyLogger";

export class WhitelistPolicy {
  readonly logger = new WhitelistPolicyLogger();
  private repository: WhitelistRepository | undefined;

  init(usageDb: D1Database, logStore: KVNamespace): void {
    this.repository = new WhitelistRepository(usageDb);
    this.logger.init(logStore);
  }

  async isWhiteListed(userId: number): Promise<boolean> {
    if (!this.repository) {
      throw new Error("whitelistPolicy: call init first");
    }

    return this.repository.isWhitelisted(userId);
  }
}

export const whitelistPolicy = new WhitelistPolicy();
