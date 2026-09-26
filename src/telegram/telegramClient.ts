export class TelegramClient {
  constructor(private readonly botToken: string) {}

  async sendMessage(chatId: number, text: string, linkButton?: { text: string; url: string }): Promise<void> {
    await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(linkButton && { reply_markup: { inline_keyboard: [[linkButton]] } }),
      }),
    });
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

    await fetch(`https://api.telegram.org/bot${this.botToken}/sendDocument`, {
      method: "POST",
      body: form,
    });
  }
}
