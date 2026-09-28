import {
  readInteger,
  readRecord,
  readRecordOrNull,
  readString,
  readStringOrNull,
  type JsonRecord,
} from "../../generic/json/json-fields";

// Represents a Telegram user who talks to the bot.
export interface TelegramUser {
  id: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  languageCode: string | null;
}

// Represents a message that a user sends or forwards to the bot. Its text is
// the message's text, or the caption of a photo or file. It is null when the
// message has neither (e.g. a sticker).
export interface IncomingMessage {
  chatId: number;
  sender: TelegramUser;
  text: string | null;
}

// Represents what Telegram sends the webhook for one event: a message, the
// user blocking or unblocking the bot, or something the bot does not use.
// Telegram sends a block or an unblock as a my_chat_member update, with the
// status "kicked" or "member".
export type TelegramUpdate =
  | { kind: "message"; message: IncomingMessage }
  | { kind: "bot-blocked"; chatId: number; user: TelegramUser }
  | { kind: "bot-unblocked"; chatId: number; user: TelegramUser }
  | { kind: "ignored"; reason: string };

// Returns the update in the JSON that Telegram sends. An update the bot does
// not use, or one it cannot read, is ignored, with the reason.
export function parseTelegramUpdate(updateJson: unknown): TelegramUpdate {
  try {
    const updateRecord = readRecord(updateJson, "the update");
    const messageRecord = readRecordOrNull(updateRecord, "message");
    if (messageRecord !== null) {
      return messageUpdateOf(messageRecord);
    }
    const chatMemberRecord = readRecordOrNull(updateRecord, "my_chat_member");
    if (chatMemberRecord !== null) {
      return chatMemberUpdateOf(chatMemberRecord);
    }
    const updateKinds = Object.keys(updateRecord).filter((key) => key !== "update_id");
    return { kind: "ignored", reason: `an update the bot does not use: ${updateKinds.join(", ")}` };
  } catch (error) {
    return {
      kind: "ignored",
      reason: `an update the bot cannot read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function messageUpdateOf(messageRecord: JsonRecord): TelegramUpdate {
  return {
    kind: "message",
    message: {
      chatId: readInteger(readRecord(messageRecord.chat, "chat"), "id"),
      sender: telegramUserOf(readRecord(messageRecord.from, "from")),
      text:
        readStringOrNull(messageRecord, "text") ??
        readStringOrNull(messageRecord, "caption"),
    },
  };
}

// Returns the user blocking or unblocking the bot. Any other membership
// status is ignored.
function chatMemberUpdateOf(chatMemberRecord: JsonRecord): TelegramUpdate {
  const status = readString(readRecord(chatMemberRecord.new_chat_member, "new_chat_member"), "status");
  if (status !== "kicked" && status !== "member") {
    return { kind: "ignored", reason: `a membership status ${status}` };
  }
  return {
    kind: status === "kicked" ? "bot-blocked" : "bot-unblocked",
    chatId: readInteger(readRecord(chatMemberRecord.chat, "chat"), "id"),
    user: telegramUserOf(readRecord(chatMemberRecord.from, "from")),
  };
}

function telegramUserOf(userRecord: JsonRecord): TelegramUser {
  return {
    id: readInteger(userRecord, "id"),
    username: readStringOrNull(userRecord, "username"),
    firstName: readString(userRecord, "first_name"),
    lastName: readStringOrNull(userRecord, "last_name"),
    languageCode: readStringOrNull(userRecord, "language_code"),
  };
}
