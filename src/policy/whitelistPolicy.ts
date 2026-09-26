import { WhitelistPolicyLogger } from "./whitelistPolicyLogger";

export class WhitelistPolicy {
  readonly logger = new WhitelistPolicyLogger();
  private inited = false;
  private whitelist!: KVNamespace;

  init(whitelist: KVNamespace, logStore: KVNamespace): void {
    this.whitelist = whitelist;
    this.logger.init(logStore);
    this.inited = true;
  }

  async isWhiteListed(userId: number): Promise<boolean> {
    if (!this.inited) {
      throw new Error("whitelistPolicy: call init first");
    }

    return (await this.whitelist.get(String(userId))) !== null;
  }
}

export const whitelistPolicy = new WhitelistPolicy();
