import { WhitelistPolicyLogger } from "./whitelistPolicyLogger";

export interface WhitelistUser {
  username: string | undefined;
  userId: number | undefined;
}

export class WhitelistPolicy {
  readonly logger = new WhitelistPolicyLogger();
  private inited = false;
  private whitelist!: KVNamespace;

  init(whitelist: KVNamespace, logStore: KVNamespace): void {
    this.whitelist = whitelist;
    this.logger.init(logStore);
    this.inited = true;
  }

  // Entries are added manually to the WHITELIST KV namespace. A user
  // passes if EITHER their username OR their numeric Telegram user id is a key
  // in the namespace — both as plain, unprefixed keys (matched lowercase, so
  // "Alice_Example" and "alice_example" are the same entry). No collision risk
  // between the two: a Telegram username can never be purely numeric.
  // - By username — lets you proactively whitelist someone before they've
  //   ever messaged the bot, just from knowing their @handle.
  // - By id — the only option for a user with no public username (it's
  //   optional in Telegram). The bot's own rejection message includes the
  //   user's id so it can be relayed for this.
  async isWhiteListed(user: WhitelistUser): Promise<boolean> {
    if (!this.inited) {
      throw new Error("whitelistPolicy: call init first");
    }

    if (user.username) {
      const byUsername = await this.whitelist.get(user.username.toLowerCase());
      if (byUsername !== null) {
        return true;
      }
    }

    if (user.userId !== undefined) {
      const byId = await this.whitelist.get(String(user.userId));
      if (byId !== null) {
        return true;
      }
    }

    return false;
  }
}

export const whitelistPolicy = new WhitelistPolicy();
