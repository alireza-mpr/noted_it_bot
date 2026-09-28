import type { CalendarFile } from "../../output/calendar-file";
import { Logger } from "../logging/logger";
import { logUserActivity } from "../logging/user-activity";
import type {
  LinkButton,
  TelegramClient,
  TelegramSendResult,
} from "./telegram-client";

const LOGGER = new Logger<ReplierEventName>("replier");
const CALENDAR_FILE_MEDIA_TYPE = "text/calendar";

// Represents the replies to one chat. The texts are ready to send: the app
// writes them in the reply language.
export interface Replier {
  // Sends a plain text.
  sendText(text: string): Promise<void>;
  // Sends a plain text, with a link button under it.
  sendTextWithLinkButton(text: string, linkButton: LinkButton): Promise<void>;
  // Sends the calendar file, with its caption in Telegram HTML.
  sendCalendarFile(calendarFile: CalendarFile, htmlCaption: string): Promise<void>;
}

// Represents the replies to one Telegram chat. A reply that Telegram refuses
// is logged, not thrown, so it never fails the update.
export class TelegramReplier implements Replier {
  constructor(
    private readonly telegramClient: Pick<TelegramClient, "sendMessage" | "sendDocument">,
    private readonly chatId: number,
  ) {}

  // Sends a plain text.
  async sendText(text: string): Promise<void> {
    const sendResult = await this.telegramClient.sendMessage(this.chatId, text, null);
    logSendResult(sendResult, "text", "sendMessage");
  }

  // Sends a plain text, with a link button under it.
  async sendTextWithLinkButton(text: string, linkButton: LinkButton): Promise<void> {
    const sendResult = await this.telegramClient.sendMessage(this.chatId, text, linkButton);
    logSendResult(sendResult, "text_with_link", "sendMessage");
  }

  // Sends the calendar file, with its caption in Telegram HTML.
  async sendCalendarFile(calendarFile: CalendarFile, htmlCaption: string): Promise<void> {
    const sendResult = await this.telegramClient.sendDocument(
      this.chatId,
      { ...calendarFile, mediaType: CALENDAR_FILE_MEDIA_TYPE },
      htmlCaption,
    );
    logSendResult(sendResult, "calendar_file", "sendDocument");
  }
}

// Represents the replier's event names.
type ReplierEventName = "telegram.reply_sent" | "telegram.send_failed";

// Represents what kind of reply was sent, in snake_case for the logs.
type ReplyKind = "text" | "text_with_link" | "calendar_file";

function logSendResult(
  sendResult: TelegramSendResult,
  replyKind: ReplyKind,
  telegramMethod: string,
): void {
  if (sendResult.ok) {
    LOGGER.info("telegram.reply_sent", { "telegram.reply_kind": replyKind });
  } else if (sendResult.kind === "blocked") {
    logUserActivity("bot_blocked", { "user_activity.via": "send_refused" });
  } else {
    LOGGER.warn("telegram.send_failed", {
      "telegram.method": telegramMethod,
      "http.response.status_code": sendResult.httpStatus,
      "telegram.error_description": sendResult.description,
    });
  }
}
