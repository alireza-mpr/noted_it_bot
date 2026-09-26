import { fillPlaceholder } from "../translation/placeholders";
import type { MessageId } from "../interactiveMessages/messages";
import { translateStatic } from "../translation/translate";
import type { TelegramClient } from "./telegramClient";
import { describeError, Logger } from "../logging/logger";

const logger = new Logger("replier");

export class Replier {
  constructor(
    private readonly telegram: TelegramClient,
    private readonly chatId: number,
    readonly lang: string,
  ) {}

  withLang(lang: string): Replier {
    return new Replier(this.telegram, this.chatId, lang);
  }

  translate(id: MessageId, value?: string): string {
    const text = translateStatic(id, this.lang);
    return value === undefined ? text : fillPlaceholder(text, value);
  }

  async say(id: MessageId, value?: string): Promise<void> {
    await this.sendPlain(this.translate(id, value));
  }

  async sayWithQuota(
    id: MessageId,
    remainingQuota: number,
    showQuota: boolean,
  ): Promise<void> {
    const text = this.translate(id);
    if (!showQuota) {
      await this.sendPlain(text);
      return;
    }
    await this.sendPlain(`${text}\n\n${this.quotaLine(remainingQuota)}`);
  }

  private quotaLine(remainingQuota: number): string {
    return this.translate("USER_DAILY_QUOTA_REMAINING", String(remainingQuota));
  }

  async sayWithLink(id: MessageId, buttonId: MessageId, url: string): Promise<void> {
    const text = this.translate(id);
    const label = this.translate(buttonId);
    await this.telegram.sendMessage(this.chatId, text, { text: label, url });
    logger.info("reply sent", { type: "link", lang: this.lang });
  }

  async sendPlain(text: string): Promise<void> {
    await this.telegram.sendMessage(this.chatId, text);
    logger.info("reply sent", { type: "text", lang: this.lang });
  }

  async sendDocument(
    filename: string,
    content: string,
    caption: string,
  ): Promise<void> {
    await this.telegram.sendDocument(
      this.chatId,
      filename,
      content,
      caption,
      "HTML",
    );
    logger.info("reply sent", { type: "document", lang: this.lang, filename });
  }

  async reportError(remainingQuota: number, showQuota: boolean): Promise<void> {
    const errorText = this.translate("GENERIC_ERROR_MESSAGE");
    const quotaText = showQuota ? this.quotaLine(remainingQuota) : "";
    const text = quotaText ? `${errorText}\n\n${quotaText}` : errorText;
    await this.sendPlain(text).catch((err) =>
      logger.error("failed to report error back to chat", describeError(err)),
    );
  }
}
