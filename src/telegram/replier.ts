import { GENERIC_ERROR_MESSAGE } from "../lib/interactiveMessages/messages";
import { fillPlaceholder } from "../lib/translation/placeholders";
import { translateText } from "../lib/translation/translate";
import type { TranslateEnv } from "../lib/translation/translate";
import type { TelegramClient } from "./telegramClient";

export class Replier {
  constructor(
    private readonly env: TranslateEnv,
    private readonly telegram: TelegramClient,
    private readonly chatId: number,
    readonly lang: string,
  ) {}

  withLang(lang: string): Replier {
    return new Replier(this.env, this.telegram, this.chatId, lang);
  }

  async translate(template: string, value?: string): Promise<string> {
    const text = await translateText(this.env, template, this.lang);
    return value === undefined ? text : fillPlaceholder(text, value);
  }

  async say(template: string, value?: string): Promise<void> {
    await this.sendPlain(await this.translate(template, value));
  }

  async sendPlain(text: string): Promise<void> {
    await this.telegram.sendMessage(this.chatId, text);
  }

  async sendDocument(
    filename: string,
    content: string,
    caption: string,
  ): Promise<void> {
    await this.telegram.sendDocument(this.chatId, filename, content, caption, "HTML");
  }

  async reportError(): Promise<void> {
    const text = await this.translate(GENERIC_ERROR_MESSAGE).catch(
      () => GENERIC_ERROR_MESSAGE,
    );
    await this.sendPlain(text).catch((err) =>
      console.error("Failed to report error back to chat", err),
    );
  }
}
