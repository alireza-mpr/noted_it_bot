import { dateTimeAest } from "../time/dateTimeAest";
import { describeError, Logger } from "./logger";

const LOGGER = "messageLogger";
const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days, per the /start disclosure ("I may keep your messages to fix bugs")

export interface MessageLogEntry {
  userId: number;
  receivedMessage: string;
  providerRequest: string;
  providerResponse: string;
  // The model that answered; null when no model did.
  model: string | null;
}

export class MessageLogger {
  private inited = false;
  private logStore!: KVNamespace;

  constructor(private readonly logger: Logger = new Logger(LOGGER)) {}

  init(kv: KVNamespace): void {
    this.logStore = kv;
    this.inited = true;
  }

  // Best-effort: a logging failure must never affect the actual reply.
  async log(entry: MessageLogEntry): Promise<void> {
    this.logger.info("message received", { ...entry });

    try {
      if (!this.inited) {
        throw new Error("call init first");
      }
      const now = new Date();
      const key = `${now.getTime()}-${crypto.randomUUID()}`;
      const value = JSON.stringify({
        logger: LOGGER,
        time: { date_time_aest: dateTimeAest(now) },
        ...entry,
      });
      await this.logStore.put(key, value, { expirationTtl: TTL_SECONDS });
    } catch (err) {
      this.logger.error("threw", describeError(err));
    }
  }
}

export const messageLogger = new MessageLogger();
