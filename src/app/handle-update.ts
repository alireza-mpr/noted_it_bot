import { exceptionAttributesOf } from "../adapters/logging/log-event";
import { setLogAttribute } from "../adapters/logging/log-session";
import { Logger } from "../adapters/logging/logger";
import { logUserActivity } from "../adapters/logging/user-activity";
import { setUserLogAttributes } from "../adapters/logging/user-log-attributes";
import type { Router } from "../adapters/models/router";
import {
  parseBotCommand,
  type BotCommand,
} from "../adapters/telegram/bot-command";
import { TelegramReplier, type Replier } from "../adapters/telegram/replier";
import type { TelegramClient } from "../adapters/telegram/telegram-client";
import type {
  IncomingMessage,
  Sender,
  TelegramUpdate,
} from "../adapters/telegram/telegram-update";
import type { DailyQuota } from "../domain/quota/daily-quota";
import {
  replyLanguageOf,
  type ReplyLanguage,
  type ReplyLanguageSource,
} from "../domain/user/reply-language-rule";
import type { SupportedLanguage } from "../domain/user/supported-language";
import { newUser, type User } from "../domain/user/user";
import { fullNameOf } from "../domain/user/user-profile";
import type { UserRepository } from "../domain/user/user-repository";
import { truncateText } from "../generic/text/truncate-text";
import { translate } from "../i18n/translation";
import { checkModels } from "./commands/check-models";
import { setLanguage } from "./commands/set-language";
import { setTimeZone } from "./commands/set-time-zone";
import { showHelp } from "./commands/show-help";
import { showVersion } from "./commands/show-version";
import { startBot } from "./commands/start-bot";
import { createEventFromMessage } from "./create-event-from-message";
import { loadUserOfUpdate } from "./update-user";

const LOGGER = new Logger<UpdateEventName>("handle-update");
const MAX_LOGGED_COMMAND_LENGTH = 64;
const MAX_LOGGED_COMMAND_TEXT_LENGTH = 200;
const LOGGED_REPLY_LANGUAGE_SOURCES: Record<ReplyLanguageSource, string> = {
  "user-choice": "user_choice",
  telegram: "telegram",
  "language-fallback": "language-fallback",
};

// Represents what handling an update needs. workerOrigin is the Worker's
// address, for the /tz link.
export interface UpdateContext {
  router: Pick<Router, "ask">;
  userRepository: UserRepository;
  telegramClient: Pick<TelegramClient, "sendMessage" | "sendDocument">;
  dailyQuota: DailyQuota;
  isDailyQuotaShown: boolean;
  appVersion: string;
  webhookSecret: string;
  workerOrigin: string;
  now: Date;
}

// Handles one update from Telegram: a message, the user blocking or unblocking
// the bot, or an update the bot does not use. Never throws: an error is
// logged, and the user gets a general error reply. See ADR-8 in
// ARCHITECTURE_DECISIONS_REGISTRY.md.
export async function handleUpdate(
  telegramUpdate: TelegramUpdate,
  updateContext: UpdateContext,
): Promise<void> {
  switch (telegramUpdate.kind) {
    case "message":
      await handleMessage(telegramUpdate.message, updateContext);
      return;
    case "bot-blocked":
      setSenderLogAttributes(telegramUpdate.sender, telegramUpdate.chatId);
      logUserActivity("bot_blocked", { "user_activity.via": "membership" });
      return;
    case "bot-unblocked":
      setSenderLogAttributes(telegramUpdate.sender, telegramUpdate.chatId);
      logUserActivity("bot_unblocked");
      return;
    case "ignored":
      LOGGER.info("telegram.update_ignored", {
        "telegram.ignore_reason": telegramUpdate.reason,
      });
      return;
  }
}

// Represents the event names of handling an update.
type UpdateEventName =
  | "telegram.update_ignored"
  | "telegram.update_failed"
  | "telegram.error_reply_failed"
  | "telegram.update_handled";

// Represents what answering one message needs: the update context, the
// replier to the message's chat, and the reply language.
interface MessageContext extends UpdateContext {
  replier: Replier;
  language: SupportedLanguage;
}

// Answers a message: runs its command, or creates an event from it. Logs
// telegram.update_handled at the end, with how long it took.
async function handleMessage(
  message: IncomingMessage,
  updateContext: UpdateContext,
): Promise<void> {
  const { sender } = message;
  setSenderLogAttributes(sender, message.chatId);
  const botCommand =
    message.text === null ? null : parseBotCommand(message.text);
  const replier = new TelegramReplier(
    updateContext.telegramClient,
    message.chatId,
  );
  // The Telegram language until the user is loaded, e.g. when the database
  // fails.
  let language = replyLanguageOf(
    newUser(sender.userId, sender.userProfile),
  ).language;
  try {
    const user = await loadUserOfUpdate(
      updateContext.userRepository,
      sender.userId,
      sender.userProfile,
    );
    const replyLanguage = replyLanguageOf(user);
    language = replyLanguage.language;
    setReplyLanguageLogAttributes(replyLanguage);
    await answerMessage(user, message, botCommand, {
      ...updateContext,
      replier,
      language,
    });
  } catch (error) {
    LOGGER.error("telegram.update_failed", exceptionAttributesOf(error));
    await sendErrorReply(replier, language);
  }
  LOGGER.info("telegram.update_handled", {
    "telegram.command":
      botCommand === null
        ? null
        : truncateText(botCommand.name, MAX_LOGGED_COMMAND_LENGTH),
    "telegram.duration_ms": Date.now() - updateContext.now.getTime(),
  });
}

async function answerMessage(
  user: User,
  message: IncomingMessage,
  botCommand: BotCommand | null,
  messageContext: MessageContext,
): Promise<void> {
  if (botCommand === null) {
    await createEventFromMessage(
      { user, messageText: message.text },
      messageContext,
    );
    return;
  }
  await runBotCommand(
    user,
    message.sender.userProfile.firstName,
    botCommand,
    messageContext,
  );
}

// Runs the command. An unknown command, e.g. /settings, gets no reply; it is
// logged with the text after it, to see what users try.
async function runBotCommand(
  user: User,
  firstName: string,
  botCommand: BotCommand,
  messageContext: MessageContext,
): Promise<void> {
  const { replier, language } = messageContext;
  switch (botCommand.name) {
    case "start":
      await startBot(firstName, replier, language);
      return;
    case "help":
      await showHelp(
        messageContext.dailyQuota,
        messageContext.isDailyQuotaShown,
        replier,
        language,
      );
      return;
    case "ver":
      await showVersion(messageContext.appVersion, replier);
      return;
    case "diag":
      await checkModels(messageContext.router, replier);
      return;
    case "lang":
      await setLanguage(user, botCommand.argumentText, messageContext);
      return;
    case "tz":
      await setTimeZone(user, botCommand.argumentText, messageContext);
      return;
    default:
      logUserActivity("unknown_command_sent", {
        "user_activity.command": truncateText(
          botCommand.name,
          MAX_LOGGED_COMMAND_LENGTH,
        ),
        "user_activity.command_text":
          botCommand.argumentText === null
            ? null
            : truncateText(
                botCommand.argumentText,
                MAX_LOGGED_COMMAND_TEXT_LENGTH,
              ),
      });
  }
}

// Sends the general error reply. If it cannot be sent either, it is only
// logged, so the update still ends.
async function sendErrorReply(
  replier: Replier,
  language: SupportedLanguage,
): Promise<void> {
  try {
    await replier.sendText(translate("GENERIC_ERROR_MESSAGE", language));
  } catch (error) {
    LOGGER.warn("telegram.error_reply_failed", exceptionAttributesOf(error));
  }
}

// Adds the sender to every later log event of the update: the user, the chat
// and the language of the user's Telegram app.
function setSenderLogAttributes(sender: Sender, chatId: number): void {
  setUserLogAttributes(
    sender.userId,
    sender.userProfile.username,
    fullNameOf(sender.userProfile),
  );
  setLogAttribute("telegram.chat.id", chatId);
  setLogAttribute(
    "telegram.user_language_code",
    sender.userProfile.telegramLanguageCode,
  );
}

function setReplyLanguageLogAttributes(replyLanguage: ReplyLanguage): void {
  setLogAttribute("telegram.reply_language", replyLanguage.language);
  setLogAttribute(
    "telegram.reply_language_source",
    LOGGED_REPLY_LANGUAGE_SOURCES[replyLanguage.source],
  );
}
