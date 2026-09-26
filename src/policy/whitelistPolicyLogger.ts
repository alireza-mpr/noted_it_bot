import { describeError, Logger } from "../logging/logger";
import { dateTimeAest } from "../time/dateTimeAest";

const LOGGER = "whitelistPolicyLogger";
const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export class WhitelistPolicyLogger {
  private inited = false;
  private logStore!: KVNamespace;

  constructor(private readonly logger: Logger = new Logger(LOGGER)) {}

  init(kv: KVNamespace): void {
    this.logStore = kv;
    this.inited = true;
  }

  async rejected(userId: number, chatId: number): Promise<void> {
    const message = `rejected non-whitelisted user id ${userId}, chat ${chatId}`;
    this.logger.warn(message, { userId, chatId });

    try {
      if (!this.inited) {
        throw new Error("call init first");
      }
      const now = new Date();
      const key = `whitelist:${now.getTime()}-${crypto.randomUUID()}`;
      const value = JSON.stringify({
        logger: LOGGER,
        time: { date_time_aest: dateTimeAest(now) },
        message,
      });
      await this.logStore.put(key, value, { expirationTtl: TTL_SECONDS });
    } catch (err) {
      this.logger.error("threw", describeError(err));
    }
  }
}
