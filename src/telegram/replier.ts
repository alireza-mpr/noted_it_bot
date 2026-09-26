import {
  GENERIC_ERROR_MESSAGE,
  USER_DAILY_QUOTA_REMAINING,
} from "../interactiveMessages/messages";
import { fillPlaceholder } from "../translation/placeholders";
import { translateText } from "../translation/translate";
import type { TranslateEnv } from "../translation/translate";
import type { Router } from "../router/router";
import type { TelegramClient } from "./telegramClient";

export class Replier {
  constructor(
    private readonly env: TranslateEnv,
    private readonly router: Router,
    private readonly telegram: TelegramClient,
    private readonly chatId: number,
    readonly lang: string,
  ) {}

  withLang(lang: string): Replier {
    return new Replier(this.env, this.router, this.telegram, this.chatId, lang);
  }

  async translate(template: string, value?: string): Promise<string> {
    const text = await translateText(this.env, this.router, template, this.lang);
    return value === undefined ? text : fillPlaceholder(text, value);
  }

  async say(template: string, value?: string): Promise<void> {
    await this.sendPlain(await this.translate(template, value));
  }

  async sayWithQuota(
    template: string,
    remainingQuota: number,
    showQuota: boolean,
  ): Promise<void> {
    const text = await this.translate(template);
    if (!showQuota) {
      await this.sendPlain(text);
      return;
    }
    await this.sendPlain(`${text}\n\n${await this.quotaLine(remainingQuota)}`);
  }

  private quotaLine(remainingQuota: number): Promise<string> {
    return this.translate(USER_DAILY_QUOTA_REMAINING, String(remainingQuota));
  }

  async sendPlain(text: string): Promise<void> {
    await this.telegram.sendMessage(this.chatId, text);
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
  }

  async reportError(remainingQuota: number, showQuota: boolean): Promise<void> {
    const errorText = await this.translate(GENERIC_ERROR_MESSAGE).catch(
      () => GENERIC_ERROR_MESSAGE,
    );
    const quotaText = showQuota
      ? await this.quotaLine(remainingQuota).catch(() =>
          fillPlaceholder(USER_DAILY_QUOTA_REMAINING, String(remainingQuota)),
        )
      : "";
    const text = quotaText ? `${errorText}\n\n${quotaText}` : errorText;
    await this.sendPlain(text).catch((err) =>
      console.error("Failed to report error back to chat", err),
    );
  }
}
