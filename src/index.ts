export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  APP_VERSION: string;
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { first_name?: string };
  };
}

const START_MESSAGE = `Noted.

Forward me any message with an event in it.
I'll pull out the date and send you a calendar file.

Right now I read explicit dates only
("19 Sep, 8pm"), not "tomorrow".
Times are assumed to be Melbourne.

Beta. I keep your messages to fix bugs.`;

async function sendMessage(env: Env, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
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

    if (message?.text === "/start") {
      await sendMessage(env, message.chat.id, START_MESSAGE);
    }

    if (message?.text === "/version") {
      await sendMessage(env, message.chat.id, env.APP_VERSION);
    }

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

      await sendMessage(env, message.chat.id, `Hi ${userName}, current time is: ${currentTime} UTC`);
    }

    return new Response("OK");
  },
};
