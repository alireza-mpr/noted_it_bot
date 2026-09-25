import type { Env } from "../../env";
import { NOT_WHITELISTED } from "../../lib/interactiveMessages/messages";
import { DEFAULT_LANGUAGE } from "../../lib/translation/language";
import { getUserLanguageOverride } from "../../lib/translation/userLanguage";
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

// Returns true (after replying) when the sender isn't allowed.
async function rejectUnlessWhitelisted(
  message: TelegramMessage,
  replier: Replier,
): Promise<boolean> {
  const { id: userId, username } = message.from;
  if (await whitelistPolicy.isWhiteListed({ username, userId })) {
    return false;
  }

  await whitelistPolicy.logger.rejected(username, userId, message.chat.id);
  await replier.say(NOT_WHITELISTED, username ?? String(userId));
  return true;
}

async function handleMessage(
  message: TelegramMessage,
  env: Env,
  router: Router,
  replier: Replier,
): Promise<void> {
  // /lang is exempt, so even a rejected user can pick the language of the rejection.
  if (
    !isLangCommand(message.text) &&
    (await rejectUnlessWhitelisted(message, replier))
  ) {
    return;
  }

  if (message.text === "/start") return startCommandHandler(replier);
  if (message.text === "/ver") return versionCommandHandler(env, replier);
  // /diag is deliberately not registered via setMyCommands, so it stays hidden from the menu.
  if (message.text === "/diag") return diagCommandHandler(router, replier);
  if (isLangCommand(message.text)) {
    return langCommandHandler(env, message, replier);
  }

  return eventMessageHandler(message, router, replier);
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
    await handleMessage(message, env, router, replier);
  } catch (err) {
    console.error("Unhandled error processing update", err);
    await replier.reportError();
  }
}
