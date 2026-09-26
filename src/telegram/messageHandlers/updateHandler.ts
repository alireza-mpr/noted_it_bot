import type { Env } from "../../env";
import {
  USER_DAILY_QUOTA_EXCEEDED,
  NOT_WHITELISTED,
} from "../../interactiveMessages/messages";
import {
  featureFlags,
  type FeatureFlags,
} from "../../featureFlags/featureFlags";
import { describeError, Logger, setLogField } from "../../logging/logger";
import { formatWait } from "../../time/formatWait";
import { DEFAULT_LANGUAGE, toSupportedLanguage } from "../../translation/language";
import { getUserLanguageOverride } from "../../translation/userLanguage";
import {
  userQuotaPolicy,
  type UserQuotaConsumeResult,
} from "../../policy/userQuotaPolicy";
import { whitelistPolicy } from "../../policy/whitelistPolicy";
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
      USER_DAILY_QUOTA_EXCEEDED,
      formatWait(result.retryAt, Date.now()),
    );
    return result;
  }

  logger.info("quota consumed", { remainingQuota: result.remainingQuota });
  return result;
}

// Returns true (after replying) when the sender isn't allowed.
async function rejectUnlessWhitelisted(
  message: TelegramMessage,
  replier: Replier,
): Promise<boolean> {
  const userId = message.from.id;
  if (await whitelistPolicy.isWhiteListed(userId)) {
    logger.info("whitelist check passed");
    return false;
  }

  await whitelistPolicy.logger.rejected(userId, message.chat.id);
  await replier.say(NOT_WHITELISTED, String(userId));
  return true;
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
  flags: FeatureFlags,
  consumed: ConsumedQuota,
): Promise<void> {
  // /lang is exempt, so even a rejected user can pick the language of the rejection.
  if (!isLangCommand(message.text)) {
    if (
      flags.enforceUserWhitelisting &&
      (await rejectUnlessWhitelisted(message, replier))
    ) {
      return;
    }

    if (flags.enforceUserDailyQuota && !isTzCommand(message.text)) {
      const quota = await consumeUserQuota(
        message,
        replier,
        flags.dailyQuota,
      );
      if (!quota.successful) {
        return;
      }
      consumed.show = true;
      consumed.remaining = quota.remainingQuota;
    }
  }

  if (message.text === "/start") return startCommandHandler(replier);
  if (message.text === "/ver") return versionCommandHandler(env, replier);
  // /diag is deliberately not registered via setMyCommands, so it stays hidden from the menu.
  if (message.text === "/diag") return diagCommandHandler(router, replier);
  if (isLangCommand(message.text)) {
    return langCommandHandler(env, message, replier, flags.defaultTimezone);
  }
  if (isTzCommand(message.text)) {
    return tzCommandHandler(env, router, message, replier);
  }

  return eventMessageHandler(
    message,
    router,
    replier,
    consumed.remaining,
    consumed.show,
  );
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
  const replier = new Replier(env, router, telegramClient, message.chat.id, lang);

  const consumed: ConsumedQuota = { show: false, remaining: 0 };
  let outcome: "ok" | "error" = "ok";
  try {
    await handleMessage(message, env, router, replier, featureFlags, consumed);
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
