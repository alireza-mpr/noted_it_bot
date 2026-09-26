import type { Env } from "../../env";
import { appConfig, type AppConfig } from "../../appConfig/appConfig";
import { describeError, Logger, setLogField } from "../../logging/logger";
import { formatWait } from "../../time/formatWait";
import { DEFAULT_LANGUAGE, toSupportedLanguage } from "../../translation/language";
import { getUserLanguageOverride } from "../../translation/userLanguage";
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
import type { TelegramMessage, TelegramUpdate } from "../telegramTypes";

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
    await replier.say(
      "USER_DAILY_QUOTA_EXCEEDED",
      formatWait(result.retryAt, Date.now()),
    );
    return result;
  }

  logger.info("quota consumed", { remainingQuota: result.remainingQuota });
  return result;
}

// Gives back a unit taken for a message no model answered. A failure here is
// logged, not raised: the user already has their reply.
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
): Promise<void> {
  if (message.text === "/start") return startCommandHandler(replier, config);
  if (message.text === "/ver") return versionCommandHandler(env, replier);
  // /diag is deliberately not registered via setMyCommands, so it stays hidden from the menu.
  if (message.text === "/diag") return diagCommandHandler(router, replier);
  if (isLangCommand(message.text)) {
    return langCommandHandler(env, message, replier, config.defaultTimezone);
  }
  if (isTzCommand(message.text)) {
    return tzCommandHandler(env, message, replier, origin);
  }

  const content = message.text ?? message.caption;
  if (!content) {
    logger.error("message had no text or caption", {
      telegramMessage: message,
    });
    await replier.say("NO_TEXT_MESSAGE");
    return;
  }

  // An unknown /command: nothing to extract, and not worth a reply.
  if (content.startsWith("/")) {
    return;
  }

  // Quota is only taken for a message that goes to a model, and is given back
  // if no model answers it.
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
    message,
    content,
    router,
    replier,
    consumed.remaining,
    consumed.show,
  );
  if (!answered && reservation) {
    await refundUserQuota(reservation);
  }
}

// Extracts the user-preferred language from the storage. Fall back to English if the stored preference can't be read.
async function readUserLanguage(
  env: Env,
  message: TelegramMessage,
): Promise<string> {
  try {
    const langOverride = await getUserLanguageOverride(env, message.from.id);
    return (
      toSupportedLanguage(langOverride) ??
      toSupportedLanguage(message.from.language_code) ??
      DEFAULT_LANGUAGE
    );
  } catch (err) {
    logger.error("could not read the user's language, using English", describeError(err));
    return DEFAULT_LANGUAGE;
  }
}

// The first functions that's called right after the bot calls the backend (Webhook).
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
  const message = update?.message;
  if (!message) {
    return;
  }

  setLogField("userId", message.from.id);
  setLogField("username", message.from.username ?? null);
  setLogField("chatId", message.chat.id);

  const lang = await readUserLanguage(env, message);
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
