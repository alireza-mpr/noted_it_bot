import type { Env } from "../../env";
import { appConfig } from "../../appConfig/appConfig";
import { logActivity } from "../../logging/activityLog";
import { describeError, Logger, setLogField } from "../../logging/logger";
import { formatWait } from "../../time/formatWait";
import { DEFAULT_LANGUAGE, toSupportedLanguage } from "../../translation/language";
import { UserPreferenceRepository } from "../../repositories/userPreferenceRepository";
import { UserQuotaPolicy } from "../../policy/userQuotaPolicy";
import type { Router } from "../../router/router";
import { diagCommandHandler } from "../commands/diagCommandHandler";
import { isLangCommand, langCommandHandler } from "../commands/langCommandHandler";
import { isTzCommand, tzCommandHandler } from "../commands/tzCommandHandler";
import { startCommandHandler } from "../commands/startCommandHandler";
import { versionCommandHandler } from "../commands/versionCommandHandler";
import { eventMessageHandler } from "./eventMessageHandler";
import { Replier } from "../replier";
import type { TelegramClient } from "../telegramClient";
import type { TelegramChatMemberUpdate, TelegramMessage, TelegramUpdate } from "../telegramTypes";

const logger = new Logger("updateHandler");

// What handling one message needs.
interface MessageContext {
  message: TelegramMessage;
  env: Env;
  router: Router;
  replier: Replier;
  origin: string; // the Worker's address, for the /tz link
  userTimezone: string | null; // null when the user has not set one with /tz
}

// Sends an event message to the model, behind the daily quota. The quota is
// only taken for messages that go to a model, and it is given back if no model
// answers.
async function handleEventMessage(ctx: MessageContext, content: string): Promise<void> {
  const { message, env, router, replier, userTimezone } = ctx;
  if (!appConfig.enforceUserDailyQuota) {
    await eventMessageHandler(content, router, replier, null, userTimezone);
    return;
  }

  const quotaPolicy = new UserQuotaPolicy(env.USAGE_DB);
  const quota = await quotaPolicy.tryConsume(message.from.id, appConfig.dailyQuota);
  if (!quota.allowed) {
    await quotaPolicy.logger.exhausted(message.from.id);
    logActivity("quota_exhausted");
    await replier.say("USER_DAILY_QUOTA_EXCEEDED", formatWait(quota.retryAt, Date.now()));
    return;
  }
  logger.info("quota consumed", { remainingQuota: quota.remaining });

  const answered = await eventMessageHandler(content, router, replier, quota.remaining, userTimezone);
  if (answered) {
    return;
  }
  // If giving the unit back fails, we only log it: the user already has their reply.
  try {
    await quotaPolicy.refund(quota.reservation);
    logger.info("quota refunded", { remainingQuota: quota.reservation.previousRemainingQuota });
  } catch (err) {
    logger.error("could not refund quota", describeError(err));
  }
}

async function handleMessage(ctx: MessageContext): Promise<void> {
  const { message, env, router, replier } = ctx;
  if (message.text === "/start") {
    logActivity("start");
    return startCommandHandler(replier, appConfig);
  }
  if (message.text === "/ver") {
    logActivity("ver");
    return versionCommandHandler(env, replier);
  }
  // /diag is not registered with setMyCommands on purpose, so it does not show
  // in the menu.
  if (message.text === "/diag") {
    logActivity("diag");
    return diagCommandHandler(router, replier);
  }
  if (isLangCommand(message.text)) {
    return langCommandHandler(env, message, replier);
  }
  if (isTzCommand(message.text)) {
    return tzCommandHandler(env, message, replier, ctx.origin);
  }

  const content = message.text ?? message.caption;
  if (!content) {
    logger.error("message had no text or caption", { telegramMessage: message });
    logActivity("event_requested", { outcome: "no_text" });
    await replier.say("NO_TEXT_MESSAGE");
    return;
  }
  // An unknown /command: nothing to extract, and no reply needed.
  if (content.startsWith("/")) {
    return;
  }
  await handleEventMessage(ctx, content);
}

// Telegram sends my_chat_member when a user blocks the bot ("Stop and block
// bot": status kicked), or unblocks or restarts it (status member). Deleting
// the chat without blocking sends nothing, so we cannot see it.
function handleMembershipChange(change: TelegramChatMemberUpdate): void {
  setLogField("userId", change.from.id);
  setLogField("username", change.from.username ?? null);
  setLogField("firstName", change.from.first_name ?? null);
  setLogField("chatId", change.chat.id);

  const status = change.new_chat_member.status;
  if (status === "kicked") {
    logActivity("bot_blocked", { via: "membership" });
  } else if (status === "member") {
    logActivity("bot_unblocked");
  } else {
    logger.info("membership changed", { status, chatType: change.chat.type });
  }
}

// Reads the user's language and time zone in one D1 read. The language falls
// back to the Telegram language, then to English. If the read fails: English,
// and no time zone.
async function readUserSettings(
  env: Env,
  message: TelegramMessage,
): Promise<{ lang: string; timezone: string | null }> {
  try {
    const preference = await new UserPreferenceRepository(env.USAGE_DB).find(message.from.id);
    return {
      lang:
        toSupportedLanguage(preference?.lang) ?? toSupportedLanguage(message.from.language_code) ?? DEFAULT_LANGUAGE,
      timezone: preference?.timezone ?? null,
    };
  } catch (err) {
    logger.error("could not read the user's preferences, using English", describeError(err));
    return { lang: DEFAULT_LANGUAGE, timezone: null };
  }
}

// The first function called for each Telegram message (from the webhook).
export async function updateHandler(
  request: Request,
  env: Env,
  router: Router,
  telegramClient: TelegramClient,
): Promise<void> {
  const startedAt = Date.now();
  const update = await request.json<TelegramUpdate>().catch((err) => {
    logger.error("unhandled error processing update", describeError(err));
    return undefined;
  });
  if (update?.my_chat_member) {
    handleMembershipChange(update.my_chat_member);
    return;
  }

  const message = update?.message;
  if (!message) {
    return;
  }

  setLogField("userId", message.from.id);
  setLogField("username", message.from.username ?? null);
  setLogField("firstName", message.from.first_name ?? null);
  setLogField("chatId", message.chat.id);

  const { lang, timezone } = await readUserSettings(env, message);
  const text = message.text ?? message.caption;
  logger.info("update received", {
    command: text?.startsWith("/") ? text.split(/[\s@]/)[0] : null,
    lang,
  });
  const replier = new Replier(telegramClient, message.chat.id, lang);

  let outcome: "ok" | "error" = "ok";
  try {
    await handleMessage({
      message,
      env,
      router,
      replier,
      origin: new URL(request.url).origin,
      userTimezone: timezone,
    });
  } catch (err) {
    outcome = "error";
    logger.error("unhandled error processing update", describeError(err));
    await replier.reportError();
  }
  logger.info("update processed", { outcome, durationMs: Date.now() - startedAt });
}
