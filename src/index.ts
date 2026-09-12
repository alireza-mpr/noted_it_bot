import eventExtractPrompt from "../prompts/event_extract.txt";
import diagPingPrompt from "../prompts/diag_ping.txt";
import { EVENT_SCHEMA } from "./schemas/event_schema";
import type { ExtractedEvent } from "./interfaces/extracted_event";
import { buildCalendarEvent } from "./lib/calendarEvent";
import { computeEventUid } from "./lib/eventUid";

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
    caption?: string; // set instead of `text` when the message carries media (photo, video, ...)
    chat: { id: number };
    from?: { first_name?: string };
  };
}

const START_MESSAGE = `Noted.

Forward me any message with an event in it.
I'll pull out the date and send you a calendar file.

Right now I read explicit dates only
("19 Sep, 8pm"), not "tomorrow".
Times are assumed to be Australian Eastern Standard Time (Sydney/Melbourne).

Beta. I keep your messages to fix bugs.`;

async function sendMessage(env: Env, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function sendDocument(
  env: Env,
  chatId: number,
  filename: string,
  content: string,
  caption?: string,
  parseMode?: "HTML"
): Promise<void> {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) {
    form.set("caption", caption);
  }
  if (parseMode) {
    form.set("parse_mode", parseMode);
  }
  form.set("document", new Blob([content], { type: "text/calendar" }), filename);

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, {
    method: "POST",
    body: form,
  });
}

// Escapes a URL for safe use inside an HTML href="..." attribute (Telegram's
// HTML parse_mode). Google Calendar links contain `&` between query params.
function escapeHtmlAttribute(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

export async function extractEvent(env: Env, telegramMessageText: string): Promise<DownstreamResult> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          // 2. your prompt
          systemInstruction: { parts: [{ text: eventExtractPrompt }] },

          // 3. the telegram message
          contents: [{ role: "user", parts: [{ text: telegramMessageText }] }],

          // 4. the shape you want back
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: EVENT_SCHEMA,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("extractEvent: Gemini returned", response.status, await response.text());
      return GEMINI_FAILURE;
    }

    const data = await response.json<{
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    }>();

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("extractEvent: no text in Gemini response", JSON.stringify(data));
      return GEMINI_FAILURE;
    }

    const event: ExtractedEvent = JSON.parse(text);
    console.log("extractEvent: extracted", JSON.stringify({ source: telegramMessageText, event }));
    return { result: "ok", message: JSON.stringify(event) };
  } catch (err) {
    console.error("extractEvent: threw", err);
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
      const downstream = await askGemini(env, diagPingPrompt.trim(), 0);
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
    // it succeeds. Never let an error propagate up to the response status —
    // but still surface it back to the chat (when we know the chat id) so a
    // failure is visible to the user instead of silently swallowed.
    let chatId: number | undefined;
    try {
      const update = await request.json<TelegramUpdate>();
      const message = update.message;
      chatId = message?.chat.id;

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

      // A media message (photo, video, ...) carries its text as `caption`
      // instead of `text` — e.g. a forwarded channel post with a flyer image.
      const content = message?.text ?? message?.caption;

      if (message && content && !content.startsWith("/")) {
        const downstream = await extractEvent(env, content);

        if (downstream.result === "ok") {
          const event: ExtractedEvent = JSON.parse(downstream.message);
          const uid = await computeEventUid(content);
          const calendarEvent = buildCalendarEvent(event, uid);

          if (calendarEvent) {
            const googleUrl = escapeHtmlAttribute(calendarEvent.googleCalendarUrl);
            const caption =
              `📅 To add to Google Calendar, click <a href="${googleUrl}">here</a>.\n` +
              `📎 For Apple Calendar, Outlook, or anything else — tap the attached file.`;

            await sendDocument(
              env,
              message.chat.id,
              calendarEvent.icsFilename,
              calendarEvent.icsContent,
              caption,
              "HTML"
            );
          } else {
            console.error("Could not build a calendar event from extraction", downstream.message);
            await sendMessage(env, message.chat.id, "⚠️ I couldn't turn this into a calendar event yet.");
          }
        } else {
          await replyWith(env, message.chat.id, downstream);
        }
      }

      if (message && !content) {
        console.error("Message had no text or caption", JSON.stringify(message));
        await sendMessage(env, message.chat.id, "⚠️ I couldn't find any text in that message.");
      }
    } catch (err) {
      console.error("Unhandled error processing update", err);
      if (chatId !== undefined) {
        await sendMessage(env, chatId, "⚠️ Something went wrong on my end — I've logged it to fix later.").catch(
          (sendErr) => console.error("Failed to report error back to chat", sendErr)
        );
      }
    }

    return new Response("OK");
  },
};
