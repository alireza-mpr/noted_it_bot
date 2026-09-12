import dateTimeExtractPrompt from "../prompts/DateTimeExtract.txt";

const GEMINI_MODEL = "gemini-3.8-flash"; // free-tier model, current (non-legacy) Interactions API

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

interface DownstreamResult {
  result: "ok" | "failed";
  message: string;
}

const GEMINI_FAILURE: DownstreamResult = {
  result: "failed",
  message: "Sorry! I couldn't speak with Gemini",
};

async function askGemini(env: Env, prompt: string, temperature?: number): Promise<DownstreamResult> {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: prompt,
        ...(temperature !== undefined && { generation_config: { temperature } }),
      }),
    });

    if (!response.ok) {
      return GEMINI_FAILURE;
    }

    const data = await response.json<{
      steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
    }>();

    const text = data.steps
      ?.filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("")
      .trim();

    return text ? { result: "ok", message: text } : GEMINI_FAILURE;
  } catch {
    return GEMINI_FAILURE;
  }
}

async function replyWith(env: Env, chatId: number, downstream: DownstreamResult): Promise<void> {
  if (downstream.result === "failed") {
    console.error("Downstream call failed", downstream.message);
  }
  await sendMessage(env, chatId, downstream.message);
}

interface DiagCheck {
  name: string;
  run: (env: Env) => Promise<boolean>;
}

// Each check must produce one exact, deterministic expected value — not just
// "did the call succeed" — so a component that responds but drifts/misbehaves
// still gets flagged as broken.
const DIAG_CHECKS: DiagCheck[] = [
  {
    name: "Gemini",
    run: async (env) => {
      const downstream = await askGemini(env, 'Reply with exactly the single word: PONG', 0);
      return downstream.result === "ok" && downstream.message.trim() === "PONG";
    },
  },
];

async function runDiagnostics(env: Env): Promise<string> {
  const lines = await Promise.all(
    DIAG_CHECKS.map(async (check) => {
      const ok = await check.run(env).catch((err) => {
        console.error(`Diag check "${check.name}" threw`, err);
        return false;
      });
      return `${check.name}: ${ok ? "OK" : "Broken"}`;
    })
  );
  return lines.join("\n");
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
        const report = await runDiagnostics(env);
        await sendMessage(env, message.chat.id, report);
      }

      if (message?.text && !message.text.startsWith("/")) {
        const downstream = await askGemini(env, "Hello, what day is today?");
        await replyWith(env, message.chat.id, downstream);
      }
    } catch (err) {
      console.error("Unhandled error processing update", err);
    }

    return new Response("OK");
  },
};
