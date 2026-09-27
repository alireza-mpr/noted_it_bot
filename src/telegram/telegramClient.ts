import { logActivity } from "../logging/activityLog";
import { Logger } from "../logging/logger";

const logger = new Logger("telegramClient");

// Telegram answers a send to a user who blocked the bot with 403 "Forbidden:
// bot was blocked by the user". That's logged as the block it is; any other
// failure as a warning. Neither throws, so a reply that can't be delivered
// never fails the update.
async function checkSent(method: string, response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const body = await response.json<{ description?: string }>().catch(() => null);
  const description = body?.description ?? "";
  if (response.status === 403 && /blocked/i.test(description)) {
    logActivity("bot_blocked", { via: "send_refused" });
    return;
  }
  logger.warn("telegram send failed", { method, status: response.status, description });
}

export class TelegramClient {
  constructor(private readonly botToken: string) {}

  async sendMessage(chatId: number, text: string, linkButton?: { text: string; url: string }): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(linkButton && { reply_markup: { inline_keyboard: [[linkButton]] } }),
      }),
    });
    await checkSent("sendMessage", response);
  }

  async sendDocument(
    chatId: number,
    filename: string,
    content: string,
    caption?: string,
    parseMode?: "HTML",
  ): Promise<void> {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    if (caption) {
      form.set("caption", caption);
    }
    if (parseMode) {
      form.set("parse_mode", parseMode);
    }
    form.set(
      "document",
      new Blob([content], { type: "text/calendar" }),
      filename,
    );

    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendDocument`, {
      method: "POST",
      body: form,
    });
    await checkSent("sendDocument", response);
  }
}
