import eventExtractPrompt from "../prompts/event_extract.txt";
import { EVENT_SCHEMA } from "./schemas/event_schema";
import type { ExtractedEvent } from "./interfaces/extracted_event";
import { buildCalendarEvent } from "./lib/calendarEvent";
import { computeEventUid } from "./lib/eventUid";
import { translateText } from "./lib/translate";
import { resolveLanguageCode, getLanguageDisplayName, isRtl } from "./lib/language";
import { getUserLanguageOverride, setUserLanguageOverride, clearUserLanguageOverride } from "./lib/userLanguage";
import { logMessage } from "./lib/messageLog";
import { isWhitelisted } from "./lib/whitelist";
import {
  START_MESSAGE,
  CALENDAR_CAPTION_TEMPLATE,
  LINK_LABEL,
  ALL_DAY_NOTE,
  NO_CALENDAR_EVENT_MESSAGE,
  NO_TEXT_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  LANG_STATUS_AUTO,
  LANG_STATUS_MANUAL,
  LANG_SET_CONFIRMATION,
  LANG_RESET_CONFIRMATION,
  LANG_NOT_UNDERSTOOD,
  NOT_WHITELISTED_MESSAGE,
} from "./messages";

const GEMINI_MODEL = "gemini-3.8-flash"; // free-tier model, current (non-legacy) Interactions API

export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  APP_VERSION: string;
  GEMINI_API_KEY: string;
  I18N: KVNamespace;
  USER_LANG: KVNamespace;
  MESSAGE_LOG: KVNamespace;
  WHITELIST: KVNamespace;
}

interface TelegramUpdate {
  message?: {
    text?: string;
    caption?: string; // set instead of `text` when the message carries media (photo, video, ...)
    chat: { id: number };
    from?: { first_name?: string; username?: string; language_code?: string };
  };
}

async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
): Promise<void> {
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

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, {
    method: "POST",
    body: form,
  });
}

// Escapes a URL for safe use inside an HTML href="..." attribute (Telegram's
// HTML parse_mode). Google Calendar links contain `&` between query params.
function escapeHtmlAttribute(url: string): string {
  return url
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface DownstreamResult {
  result: "ok" | "failed";
  message: string;
}

const GEMINI_FAILURE: DownstreamResult = {
  result: "failed",
  message: "Sorry! I couldn't speak with Gemini",
};

export async function extractEvent(
  env: Env,
  telegramMessageText: string,
): Promise<DownstreamResult> {
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
      },
    );

    if (!response.ok) {
      console.error(
        "extractEvent: Gemini returned",
        response.status,
        await response.text(),
      );
      return GEMINI_FAILURE;
    }

    const data = await response.json<{
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    }>();

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error(
        "extractEvent: no text in Gemini response",
        JSON.stringify(data),
      );
      return GEMINI_FAILURE;
    }

    const event: ExtractedEvent = JSON.parse(text);
    console.log(
      "extractEvent: extracted",
      JSON.stringify({ source: telegramMessageText, event }),
    );
    return { result: "ok", message: JSON.stringify(event) };
  } catch (err) {
    console.error("extractEvent: threw", err);
    return GEMINI_FAILURE;
  }
}

async function replyWith(
  env: Env,
  chatId: number,
  downstream: DownstreamResult,
  lang: string | undefined,
): Promise<void> {
  if (downstream.result === "failed") {
    console.error("Downstream call failed", downstream.message);
  }
  const text = await translateText(env, downstream.message, lang);
  await sendMessage(env, chatId, text);
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
    let lang: string | undefined;
    try {
      const update = await request.json<TelegramUpdate>();
      const message = update.message;
      chatId = message?.chat.id;

      const langOverride = message ? await getUserLanguageOverride(env, message.chat.id) : null;
      lang = langOverride ?? message?.from?.language_code;

      if (message && !(await isWhitelisted(env, message.from?.username))) {
        console.warn("Rejected non-whitelisted user", message.from?.username ?? "(no username)", message.chat.id);
        await sendMessage(env, message.chat.id, await translateText(env, NOT_WHITELISTED_MESSAGE, lang));
        return new Response("OK");
      }

      if (message?.text === "/start") {
        const startText = (await translateText(env, START_MESSAGE, lang)).replace("{0}", "Noted");
        await sendMessage(env, message.chat.id, startText);
      }

      if (message?.text === "/ver") {
        await sendMessage(env, message.chat.id, env.APP_VERSION);
      }

      if (message?.text?.startsWith("/lang")) {
        const arg = message.text.slice("/lang".length).trim();

        if (!arg) {
          const template = langOverride ? LANG_STATUS_MANUAL : LANG_STATUS_AUTO;
          const displayName = getLanguageDisplayName(lang ?? "en");
          const text = (await translateText(env, template, lang)).replace("{0}", displayName);
          await sendMessage(env, message.chat.id, text);
        } else if (arg.toLowerCase() === "auto") {
          await clearUserLanguageOverride(env, message.chat.id);
          await sendMessage(env, message.chat.id, await translateText(env, LANG_RESET_CONFIRMATION, message.from?.language_code));
        } else {
          const resolved = await resolveLanguageCode(env, arg);
          if (!resolved) {
            const text = (await translateText(env, LANG_NOT_UNDERSTOOD, lang)).replace("{0}", arg);
            await sendMessage(env, message.chat.id, text);
          } else {
            await setUserLanguageOverride(env, message.chat.id, resolved);
            const displayName = getLanguageDisplayName(resolved);
            const text = (await translateText(env, LANG_SET_CONFIRMATION, resolved)).replace("{0}", displayName);
            await sendMessage(env, message.chat.id, text);
          }
        }
      }

      // A media message (photo, video, ...) carries its text as `caption`
      // instead of `text` — e.g. a forwarded channel post with a flyer image.
      const content = message?.text ?? message?.caption;

      if (message && content && !content.startsWith("/")) {
        const downstream = await extractEvent(env, content);

        await logMessage(env, {
          username: message.from?.username ?? null,
          receivedMessage: content,
          geminiRequest: content,
          geminiResponse: downstream.message,
        });

        if (downstream.result === "ok") {
          const event: ExtractedEvent = JSON.parse(downstream.message);
          const uid = await computeEventUid(content);
          const calendarEvent = buildCalendarEvent(event, uid, lang);

          if (calendarEvent) {
            const googleUrl = escapeHtmlAttribute(
              calendarEvent.googleCalendarUrl,
            );
            const [captionTemplate, linkLabel] = await Promise.all([
              translateText(env, CALENDAR_CAPTION_TEMPLATE, lang),
              translateText(env, LINK_LABEL, lang),
            ]);

            const summaryBlock = calendarEvent.summaryLines.map((line) => escapeHtmlAttribute(line)).join("\n");
            const pointerEmoji = isRtl(lang) ? "👈" : "👉";
            const addToCalendarText = captionTemplate.replace("{0}", `<a href="${googleUrl}">${linkLabel}</a>`);
            let caption = `${summaryBlock}\n\n${pointerEmoji} ${addToCalendarText}`;
            if (calendarEvent.allDay) {
              caption += `\n\n${await translateText(env, ALL_DAY_NOTE, lang)}`;
            }

            await sendDocument(
              env,
              message.chat.id,
              calendarEvent.icsFilename,
              calendarEvent.icsContent,
              caption,
              "HTML",
            );
          } else {
            console.error(
              "Could not build a calendar event from extraction",
              downstream.message,
            );
            await sendMessage(
              env,
              message.chat.id,
              await translateText(env, NO_CALENDAR_EVENT_MESSAGE, lang),
            );
          }
        } else {
          await replyWith(env, message.chat.id, downstream, lang);
        }
      }

      if (message && !content) {
        console.error(
          "Message had no text or caption",
          JSON.stringify(message),
        );
        await sendMessage(
          env,
          message.chat.id,
          await translateText(env, NO_TEXT_MESSAGE, lang),
        );
      }
    } catch (err) {
      console.error("Unhandled error processing update", err);
      if (chatId !== undefined) {
        const errorText = await translateText(env, GENERIC_ERROR_MESSAGE, lang).catch(
          () => GENERIC_ERROR_MESSAGE,
        );
        await sendMessage(
          env,
          chatId,
          errorText,
        ).catch((sendErr) =>
          console.error("Failed to report error back to chat", sendErr),
        );
      }
    }

    return new Response("OK");
  },
};
