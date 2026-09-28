import { describe, expect, it } from "vitest";
import { parseTelegramUpdate } from "../../../../src/adapters/telegram/telegram-update";

const ALICE = { id: 42, is_bot: false, first_name: "Alice", username: "alice", language_code: "fa" };
const ALICE_USER = { id: 42, username: "alice", firstName: "Alice", lastName: null, languageCode: "fa" };

function messageUpdate(message: object) {
  return { update_id: 1, message: { message_id: 7, chat: { id: 42, type: "private" }, from: ALICE, ...message } };
}

function chatMemberUpdate(status: string) {
  return {
    update_id: 1,
    my_chat_member: {
      chat: { id: 42, type: "private" },
      from: { id: 42, first_name: "Alice" },
      new_chat_member: { status },
    },
  };
}

describe("parseTelegramUpdate", () => {
  it("reads a message: its chat, its sender and its text", () => {
    expect(parseTelegramUpdate(messageUpdate({ text: "Book club 19 Sep" }))).toEqual({
      kind: "message",
      message: { chatId: 42, sender: ALICE_USER, text: "Book club 19 Sep" },
    });
  });

  it("reads the caption of a photo or a file as the text", () => {
    expect(parseTelegramUpdate(messageUpdate({ caption: "Game night 26 Sep" }))).toMatchObject({
      message: { text: "Game night 26 Sep" },
    });
  });

  it("gives a message with no text or caption a null text", () => {
    expect(parseTelegramUpdate(messageUpdate({ sticker: {} }))).toMatchObject({ message: { text: null } });
  });

  it("reads the sender's last name, and a missing username as null", () => {
    const update = messageUpdate({ text: "hi", from: { id: 42, first_name: "Alice", last_name: "Smith" } });
    expect(parseTelegramUpdate(update)).toMatchObject({
      message: { sender: { username: null, firstName: "Alice", lastName: "Smith", languageCode: null } },
    });
  });

  it("reads a block and an unblock (Telegram's my_chat_member: kicked, member)", () => {
    const alice = { id: 42, username: null, firstName: "Alice", lastName: null, languageCode: null };
    expect(parseTelegramUpdate(chatMemberUpdate("kicked"))).toEqual({ kind: "bot-blocked", chatId: 42, user: alice });
    expect(parseTelegramUpdate(chatMemberUpdate("member"))).toEqual({ kind: "bot-unblocked", chatId: 42, user: alice });
  });

  it("ignores any other membership status", () => {
    expect(parseTelegramUpdate(chatMemberUpdate("left"))).toEqual({ kind: "ignored", reason: "a membership status left" });
  });

  it("ignores an update the bot does not use, naming its kind", () => {
    expect(parseTelegramUpdate({ update_id: 1, edited_message: {} })).toEqual({
      kind: "ignored",
      reason: "an update the bot does not use: edited_message",
    });
  });

  it("ignores an update it cannot read, with the reason", () => {
    expect(parseTelegramUpdate("not an update")).toEqual({
      kind: "ignored",
      reason: "an update the bot cannot read: the update is not an object",
    });
    expect(parseTelegramUpdate(messageUpdate({ chat: { id: "42" } }))).toMatchObject({
      kind: "ignored",
      reason: "an update the bot cannot read: id is not a number",
    });
  });
});
