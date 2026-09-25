import eventExtractPrompt from "../prompts/event_extract.txt";
import diagPingPrompt from "../prompts/diag_ping.txt";
import { EVENT_SCHEMA } from "./lib/extractedEvents/event_schema";
import type { ExtractedEvent } from "./lib/extractedEvents/extractedEvent";
import { buildCalendarEvent } from "./lib/extractedEvents/calendarEvent";
import { recurrenceProblem } from "./lib/extractedEvents/recurrence";
import { computeEventUid } from "./lib/extractedEvents/eventUid";
import { translateText } from "./lib/translation/translate";
import {
  resolveLanguageCode,
  getLanguageDisplayName,
} from "./lib/translation/language";
import {
  getUserLanguageOverride,
  setUserLanguageOverride,
  clearUserLanguageOverride,
} from "./lib/translation/userLanguage";
import { messageLogger } from "./logging/messageLogger";
import { createRouter } from "./router/router";
import type { LlmClient, LlmFailure } from "./lib/providers/providerClient";
import { whitelistPolicy } from "./policy/whitelistPolicy";
import {
  START_MESSAGE,
  CALENDAR_CAPTION_TEMPLATE,
  LINK_LABEL,
  ALL_DAY_NOTE,
  RECURRING_NOTE,
  RECURRENCE_DECLINED_MESSAGE,
  NO_CALENDAR_EVENT_MESSAGE,
  NO_TEXT_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  LANG_STATUS_AUTO,
  LANG_STATUS_MANUAL,
  LANG_SET_CONFIRMATION,
  LANG_RESET_CONFIRMATION,
  LANG_NOT_UNDERSTOOD,
  NOT_WHITELISTED_BY_USERNAME,
  NOT_WHITELISTED_BY_ID,
} from "./lib/interactiveMessages/messages";

export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  APP_VERSION: string;
  GEMINI_API_KEY: string;
  I18N: KVNamespace;
  USER_LANG: KVNamespace;
  MESSAGE_LOG: KVNamespace;
  WHITELIST: KVNamespace;
  GEMINI_USAGE_DB: D1Database;
}

interface TelegramUpdate {
  message?: {
    text?: string;
    caption?: string; // media messages carry their text here, not in `text`
    chat: { id: number };
    from?: {
      id?: number;
      first_name?: string;
      username?: string;
      language_code?: string;
    };
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

// Escapes a URL for an HTML href (Telegram parse_mode HTML); calendar links contain "&".
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
  failure?: LlmFailure;
}

const GEMINI_FAILURE: DownstreamResult = {
  result: "failed",
  message: "Sorry! I couldn't speak with Gemini",
};

export async function extractEvent(
  llm: LlmClient,
  telegramMessageText: string,
): Promise<DownstreamResult> {
  try {
    const answer = await llm.generate({
      systemPrompt: eventExtractPrompt,
      userPrompt: telegramMessageText,
      responseSchema: EVENT_SCHEMA,
    });
    if (answer.result === "failed") {
      return { ...GEMINI_FAILURE, failure: answer.failure };
    }

    const event: ExtractedEvent = JSON.parse(answer.text);
    console.log(
      "extractEvent: extracted",
      JSON.stringify({ source: telegramMessageText, event }),
    );
    return { result: "ok", message: JSON.stringify(event) };
  } catch (err) {
    console.error("extractEvent: threw", err);
    return {
      ...GEMINI_FAILURE,
      failure: { kind: "internal", detail: String(err) },
    };
  }
}

async function replyWith(
  env: Env,
  chatId: number,
  downstream: DownstreamResult,
  lang: string | undefined,
): Promise<void> {
  if (downstream.result === "failed") {
    console.error(
      "Downstream call failed",
      downstream.message,
      JSON.stringify(downstream.failure),
    );
  }
  const text = await translateText(env, downstream.message, lang);
  await sendMessage(env, chatId, text);
}

interface DiagCheck {
  name: string;
  run: (llm: LlmClient) => Promise<string | null>;
}

const DIAG_CHECKS: DiagCheck[] = [
  {
    name: "Gemini",
    run: async (llm) => {
      const answer = await llm.generate({
        userPrompt: diagPingPrompt.trim(),
        temperature: 0,
      });
      if (answer.result === "failed") {
        return answer.failure.kind;
      }
      return answer.text.trim() === "PONG" ? null : "unexpected reply";
    },
  },
];

async function runDiagnostics(llm: LlmClient): Promise<string> {
  const lines = await Promise.all(
    DIAG_CHECKS.map(async (check) => {
      const problem = await check.run(llm).catch((err) => {
        console.error(`Diag check "${check.name}" threw`, err);
        return "threw";
      });
      return `${check.name}: ${problem === null ? "OK" : `Broken (${problem})`}`;
    }),
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

    whitelistPolicy.init(env.WHITELIST, env.MESSAGE_LOG);
    messageLogger.init(env.MESSAGE_LOG);
    const router = createRouter(env);

    // Always ACK 200 from here on: Telegram retries a non-2xx update and blocks
    // the queue behind it. Errors are reported to the chat instead.
    let chatId: number | undefined;
    let lang: string | undefined;
    try {
      const update = await request.json<TelegramUpdate>();
      const message = update.message;
      chatId = message?.chat.id;

      const langOverride = message
        ? await getUserLanguageOverride(env, message.chat.id)
        : null;
      lang = langOverride ?? message?.from?.language_code;

      // /lang is exempt, so even a rejected user can pick the language of the rejection.
      const isLangCommand = message?.text?.startsWith("/lang") ?? false;

      if (
        message &&
        !isLangCommand &&
        !(await whitelistPolicy.isWhiteListed({
          username: message.from?.username,
          userId: message.from?.id,
        }))
      ) {
        await whitelistPolicy.logger.rejected(
          message.from?.username,
          message.from?.id,
          message.chat.id,
        );
        const identifierTemplate = message.from?.username
          ? NOT_WHITELISTED_BY_USERNAME
          : NOT_WHITELISTED_BY_ID;
        const identifierValue = message.from?.username
          ? `@${message.from.username}`
          : String(message.from?.id ?? "unknown");
        const text = (
          await translateText(env, identifierTemplate, lang)
        ).replace("{0}", identifierValue);
        await sendMessage(env, message.chat.id, text);
        return new Response("OK");
      }

      if (message?.text === "/start") {
        const startText = (
          await translateText(env, START_MESSAGE, lang)
        ).replace("{0}", "Noted");
        await sendMessage(env, message.chat.id, startText);
      }

      if (message?.text === "/ver") {
        await sendMessage(env, message.chat.id, env.APP_VERSION);
      }

      // Hidden: not registered via setMyCommands.
      if (message?.text === "/diag") {
        const report = await runDiagnostics(router);
        await sendMessage(env, message.chat.id, report);
      }

      if (message?.text?.startsWith("/lang")) {
        const arg = message.text.slice("/lang".length).trim();

        if (!arg) {
          const template = langOverride ? LANG_STATUS_MANUAL : LANG_STATUS_AUTO;
          const displayName = getLanguageDisplayName(lang ?? "en");
          const text = (await translateText(env, template, lang)).replace(
            "{0}",
            displayName,
          );
          await sendMessage(env, message.chat.id, text);
        } else if (arg.toLowerCase() === "auto") {
          await clearUserLanguageOverride(env, message.chat.id);
          await sendMessage(
            env,
            message.chat.id,
            await translateText(
              env,
              LANG_RESET_CONFIRMATION,
              message.from?.language_code,
            ),
          );
        } else {
          const resolved = await resolveLanguageCode(env, arg);
          if (!resolved) {
            const text = (
              await translateText(env, LANG_NOT_UNDERSTOOD, lang)
            ).replace("{0}", arg);
            await sendMessage(env, message.chat.id, text);
          } else {
            await setUserLanguageOverride(env, message.chat.id, resolved);
            const displayName = getLanguageDisplayName(resolved);
            const text = (
              await translateText(env, LANG_SET_CONFIRMATION, resolved)
            ).replace("{0}", displayName);
            await sendMessage(env, message.chat.id, text);
          }
        }
      }

      const content = message?.text ?? message?.caption;

      if (message && content && !content.startsWith("/")) {
        const downstream = await extractEvent(router, content);

        await messageLogger.log({
          username: message.from?.username ?? null,
          userId: message.from?.id ?? null,
          receivedMessage: content,
          geminiRequest: content,
          geminiResponse: downstream.message,
        });

        if (downstream.result === "ok") {
          const event: ExtractedEvent = JSON.parse(downstream.message);
          const uid = await computeEventUid(content);

          const problem = recurrenceProblem(event);
          if (problem) {
            console.error(
              "Declined recurring event",
              problem,
              downstream.message,
            );
            await sendMessage(
              env,
              message.chat.id,
              await translateText(env, RECURRENCE_DECLINED_MESSAGE, lang),
            );
            return new Response("OK");
          }

          const calendarEvent = buildCalendarEvent(event, uid, lang);

          if (calendarEvent) {
            const googleUrl = escapeHtmlAttribute(
              calendarEvent.googleCalendarUrl,
            );
            const [captionTemplate, linkLabel] = await Promise.all([
              translateText(env, CALENDAR_CAPTION_TEMPLATE, lang),
              translateText(env, LINK_LABEL, lang),
            ]);

            const summaryLines = [...calendarEvent.summaryLines];
            if (calendarEvent.recurrence) {
              const sentence = (
                await translateText(
                  env,
                  calendarEvent.recurrence.template,
                  lang,
                )
              ).replace("{0}", calendarEvent.recurrence.untilLabel ?? "");
              summaryLines.push(`🔁 ${sentence}`);
            }
            const summaryBlock = summaryLines
              .map((line) => escapeHtmlAttribute(line))
              .join("\n");
            const addToCalendarText = captionTemplate.replace(
              "{0}",
              `<a href="${googleUrl}">${linkLabel}</a>`,
            );
            let caption = `${summaryBlock}\n\n🔔 ${addToCalendarText}`;
            if (calendarEvent.recurrence) {
              caption += `\n\n${await translateText(env, RECURRING_NOTE, lang)}`;
            }
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
        const errorText = await translateText(
          env,
          GENERIC_ERROR_MESSAGE,
          lang,
        ).catch(() => GENERIC_ERROR_MESSAGE);
        await sendMessage(env, chatId, errorText).catch((sendErr) =>
          console.error("Failed to report error back to chat", sendErr),
        );
      }
    }
    return new Response("OK");
  },
};
