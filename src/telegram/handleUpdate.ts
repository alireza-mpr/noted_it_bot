import {
  NO_TEXT_MESSAGE,
  NOT_WHITELISTED_BY_ID,
  NOT_WHITELISTED_BY_USERNAME,
} from "../lib/interactiveMessages/messages";
import { getUserLanguageOverride } from "../lib/translation/userLanguage";
import { whitelistPolicy } from "../policy/whitelistPolicy";
import type { BotDeps, MessageContext } from "./botContext";
import { findCommand } from "./commands/findCommand";
import { isLangCommand } from "./commands/langCommand";
import { handleEventMessage } from "./eventMessage";
import { Replier } from "./replier";
import type { TelegramMessage, TelegramUpdate } from "./telegramTypes";

// Returns true (after replying) when the sender isn't allowed.
async function rejectUnlessWhitelisted(
  message: TelegramMessage,
  replier: Replier,
): Promise<boolean> {
  const username = message.from?.username;
  const userId = message.from?.id;
  if (await whitelistPolicy.isWhiteListed({ username, userId })) {
    return false;
  }

  await whitelistPolicy.logger.rejected(username, userId, message.chat.id);
  await replier.say(
    username ? NOT_WHITELISTED_BY_USERNAME : NOT_WHITELISTED_BY_ID,
    username ? `@${username}` : String(userId ?? "unknown"),
  );
  return true;
}

async function routeMessage(ctx: MessageContext): Promise<void> {
  const { message, replier } = ctx;

  const command = findCommand(message.text);
  if (command) {
    await command(ctx);
    return;
  }

  const content = message.text ?? message.caption;
  if (!content) {
    console.error("Message had no text or caption", JSON.stringify(message));
    await replier.say(NO_TEXT_MESSAGE);
    return;
  }

  if (!content.startsWith("/")) {
    await handleEventMessage(ctx, content);
  }
}

// Never throws: Telegram retries a non-2xx update and blocks the queue behind it,
// so errors are reported to the chat instead.
export async function handleUpdate(request: Request, deps: BotDeps): Promise<void> {
  const { env, llm, telegram } = deps;
  let chatId: number | undefined;
  let lang: string | undefined;

  try {
    const message = (await request.json<TelegramUpdate>()).message;
    if (!message) {
      return;
    }
    chatId = message.chat.id;

    const langOverride = await getUserLanguageOverride(env, chatId);
    lang = langOverride ?? message.from?.language_code;
    const replier = new Replier(env, telegram, chatId, lang);

    // /lang is exempt, so even a rejected user can pick the language of the rejection.
    if (!isLangCommand(message.text) && (await rejectUnlessWhitelisted(message, replier))) {
      return;
    }

    await routeMessage({ env, llm, message, replier, lang, langOverride });
  } catch (err) {
    console.error("Unhandled error processing update", err);
    if (chatId !== undefined) {
      await new Replier(env, telegram, chatId, lang).reportError();
    }
  }
}
