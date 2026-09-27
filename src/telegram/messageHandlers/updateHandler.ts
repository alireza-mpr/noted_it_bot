import type { Env } from "../../env";
import { appConfig, type AppConfig } from "../../appConfig/appConfig";
import { logActivity } from "../../logging/activityLog";
import { describeError, Logger, setLogField } from "../../logging/logger";
import { formatWait } from "../../time/formatWait";
import {
  DEFAULT_LANGUAGE,
  toSupportedLanguage,
} from "../../translation/language";
import { UserPreferenceRepository } from "../../repositories/userPreferenceRepository";
import {
  userQuotaPolicy,
  type QuotaReservation,
  type UserQuotaConsumeResult,
} from "../../policy/userQuotaPolicy";
import type { Router } from "../../router/router";
import { diagCommandHandler } from "../commands/diagCommandHandler";
import {
  isLangCommand,
  langCommandHandler,
} from "../commands/langCommandHandler";
import { isTzCommand, tzCommandHandler } from "../commands/tzCommandHandler";
import { startCommandHandler } from "../commands/startCommandHandler";
import { versionCommandHandler } from "../commands/versionCommandHandler";
import { eventMessageHandler } from "./eventMessageHandler";
import { Replier } from "../replier";
import type { TelegramClient } from "../telegramClient";
import type {
  TelegramChatMemberUpdate,
  TelegramMessage,
  TelegramUpdate,
} from "../telegramTypes";

const logger = new Logger("updateHandler");

async function consumeUserQuota(
  message: TelegramMessage,
  replier: Replier,
  dailyQuota: number,
): Promise<UserQuotaConsumeResult> {
  const userId = message.from.id;
  const result = await userQuotaPolicy.tryConsume(userId, dailyQuota);
  if (!result.successful) {
    await userQuotaPolicy.logger.exhausted(userId);
    logActivity("quota_exhausted");
    await replier.say(
      "USER_DAILY_QUOTA_EXCEEDED",
      formatWait(result.retryAt, Date.now()),
    );
    return result;
  }

  logger.info("quota consumed", { remainingQuota: result.remainingQuota });
  return result;
}

// Gives back the unit taken for a message that no model answered. If this
// fails, we only log it: the user already has their reply.
async function refundUserQuota(reservation: QuotaReservation): Promise<void> {
  try {
    await userQuotaPolicy.refund(reservation);
    logger.info("quota refunded", {
      remainingQuota: reservation.previousRemainingQuota,
    });
  } catch (err) {
    logger.error("could not refund quota", describeError(err));
  }
}

interface ConsumedQuota {
  show: boolean;
  remaining: number;
}

async function handleMessage(
  message: TelegramMessage,
  env: Env,
  router: Router,
  replier: Replier,
  config: AppConfig,
  consumed: ConsumedQuota,
  origin: string,
  userTimezone: string | null,
): Promise<void> {
  if (message.text === "/start") {
    logActivity("start");
    return startCommandHandler(replier, config);
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
    return tzCommandHandler(env, message, replier, origin);
  }

  const content = message.text ?? message.caption;
  if (!content) {
    logger.error("message had no text or caption", {
      telegramMessage: message,
    });
    logActivity("event_requested", { outcome: "no_text" });
    await replier.say("NO_TEXT_MESSAGE");
    return;
  }

  // An unknown /command: nothing to extract, and no reply needed.
  if (content.startsWith("/")) {
    return;
  }

  // Quota is only taken for messages that go to a model. It is given back if
  // no model answers.
  let reservation: QuotaReservation | undefined;
  if (config.enforceUserDailyQuota) {
    const quota = await consumeUserQuota(message, replier, config.dailyQuota);
    if (!quota.successful) {
      return;
    }
    consumed.show = true;
    consumed.remaining = quota.remainingQuota;
    reservation = quota.reservation;
  }

  const answered = await eventMessageHandler(
    content,
    router,
    replier,
    consumed.remaining,
    consumed.show,
    userTimezone,
  );
  if (!answered && reservation) {
    await refundUserQuota(reservation);
  }
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

interface UserSettings {
  lang: string;
  // null when the user has not set one with /tz.
  timezone: string | null;
}

// Reads the user's language and time zone in one D1 read. The language falls
// back to the Telegram language, then to English. If the read fails: English,
// and no time zone.
async function readUserSettings(
  env: Env,
  message: TelegramMessage,
): Promise<UserSettings> {
  try {
    const preference = await new UserPreferenceRepository(env.USAGE_DB).find(message.from.id);
    return {
      lang:
        toSupportedLanguage(preference?.lang) ??
        toSupportedLanguage(message.from.language_code) ??
        DEFAULT_LANGUAGE,
      timezone: preference?.timezone ?? null,
    };
  } catch (err) {
    logger.error(
      "could not read the user's preferences, using English",
      describeError(err),
    );
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

  const consumed: ConsumedQuota = { show: false, remaining: 0 };
  let outcome: "ok" | "error" = "ok";
  try {
    await handleMessage(
      message,
      env,
      router,
      replier,
      appConfig,
      consumed,
      new URL(request.url).origin,
      timezone,
    );
  } catch (err) {
    outcome = "error";
    logger.error("unhandled error processing update", describeError(err));
    await replier.reportError(consumed.remaining, consumed.show);
  }
  logger.info("update processed", {
    outcome,
    durationMs: Date.now() - startedAt,
  });
}
