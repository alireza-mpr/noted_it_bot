export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  APP_VERSION: string;
  GEMINI_API_KEY: string;
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

interface GeminiResult {
  result: boolean;
  message: string;
}

const GEMINI_FAILURE: GeminiResult = {
  result: false,
  message: "Sorry! I couldn't speak with Gemini",
};

async function askGemini(env: Env, prompt: string): Promise<GeminiResult> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      return GEMINI_FAILURE;
    }

    const data = await response.json<{
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    }>();

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? { result: true, message: text } : GEMINI_FAILURE;
  } catch {
    return GEMINI_FAILURE;
  }
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

    // Always ACK with 200 past this point, no matter what happens below.
    // Telegram only advances its per-bot update queue on a 2xx response —
    // any non-2xx (or a thrown error surfacing as 500) leaves that update
    // stuck at the head of the queue, blocking every update behind it until
    // it succeeds. Swallow and log failures here instead of letting them
    // propagate, so a broken downstream call (Gemini, a bug, a bad payload)
    // can never wedge the whole queue.
    try {
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

      if (message?.text === "/diag") {
        const { result } = await askGemini(env, "Say OK.");
        await sendMessage(env, message.chat.id, result ? "OK" : "Broken");
      }

      if (message?.text && !message.text.startsWith("/")) {
        const { message: reply } = await askGemini(env, "Hello, what day is today?");
        await sendMessage(env, message.chat.id, reply);
      }
    } catch (err) {
      console.error("Unhandled error processing update", err);
    }

    return new Response("OK");
  },
};
