import type { Env } from "../../env";
import {
  USER_DAILY_QUOTA_EXCEEDED,
  NOT_WHITELISTED,
} from "../../interactiveMessages/messages";
import {
  featureFlags,
  type FeatureFlags,
} from "../../featureFlags/featureFlags";
import { formatWait } from "../../time/formatWait";
import { DEFAULT_LANGUAGE } from "../../translation/language";
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
import { startCommandHandler } from "../commands/startCommandHandler";
import { versionCommandHandler } from "../commands/versionCommandHandler";
import { eventMessageHandler } from "./eventMessageHandler";
import { Replier } from "../replier";
import type { TelegramClient } from "../telegramClient";
import type { TelegramMessage, TelegramUpdate } from "../telegramTypes";

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
  }
  return result;
}

// Returns true (after replying) when the sender isn't allowed.
async function rejectUnlessWhitelisted(
  message: TelegramMessage,
  replier: Replier,
): Promise<boolean> {
  const userId = message.from.id;
  if (await whitelistPolicy.isWhiteListed(userId)) {
    return false;
  }

  await whitelistPolicy.logger.rejected(userId, message.chat.id);
  await replier.say(NOT_WHITELISTED, String(userId));
  return true;
}

async function handleMessage(
  message: TelegramMessage,
  env: Env,
  router: Router,
  replier: Replier,
  flags: FeatureFlags,
): Promise<void> {
  let remainingQuota = 0;
  // /lang is exempt, so even a rejected user can pick the language of the rejection.
  if (!isLangCommand(message.text)) {
    if (
      flags.enforceUserWhitelisting &&
      (await rejectUnlessWhitelisted(message, replier))
    ) {
      return;
    }

    if (flags.enforceUserDailyQuota) {
      const quota = await consumeUserQuota(
        message,
        replier,
        flags.dailyQuota,
      );
      if (!quota.successful) {
        return;
      }
      remainingQuota = quota.remainingQuota;
    }
  }

  if (message.text === "/start") return startCommandHandler(replier);
  if (message.text === "/ver") return versionCommandHandler(env, replier);
  // /diag is deliberately not registered via setMyCommands, so it stays hidden from the menu.
  if (message.text === "/diag") return diagCommandHandler(router, replier);
  if (isLangCommand(message.text)) {
    return langCommandHandler(env, message, replier);
  }

  return eventMessageHandler(
    message,
    router,
    replier,
    remainingQuota,
    flags.enforceUserDailyQuota,
  );
}

// Extracts the user-preferred language from the storage. Fall back to English if the stored preference can't be read.
async function readUserLanguage(
  env: Env,
  message: TelegramMessage,
): Promise<string> {
  try {
    const langOverride = await getUserLanguageOverride(env, message.chat.id);
    return langOverride ?? message.from.language_code ?? DEFAULT_LANGUAGE;
  } catch (err) {
    console.error("Could not read the user's language, using English", err);
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
  const update = await request.json<TelegramUpdate>().catch((err) => {
    console.error("Unhandled error processing update", err);
    return undefined;
  });
  const message = update?.message;
  if (!message) {
    return;
  }

  const lang = await readUserLanguage(env, message);
  const replier = new Replier(env, telegramClient, message.chat.id, lang);

  try {
    await handleMessage(message, env, router, replier, featureFlags);
  } catch (err) {
    console.error("Unhandled error processing update", err);
    await replier.reportError();
  }
}
