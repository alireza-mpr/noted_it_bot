export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { first_name?: string };
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("OK");
    }

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const update = await request.json<TelegramUpdate>();
    const message = update.message;

    if (message?.text === "/hi") {
      const userName = message.from?.first_name ?? "there";
      const currentTime = new Date().toLocaleString("en-US", {
        timeZone: "UTC",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: `Hi ${userName}, current time is: ${currentTime} UTC`,
        }),
      });
    }

    return new Response("OK");
  },
};
