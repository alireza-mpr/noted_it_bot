export interface TelegramUpdate {
  message?: {
    text?: string;
    caption?: string; // photos and files have their text here, not in `text`
    chat: { id: number };
    from: {
      id: number;
      username?: string;
      first_name?: string;
      language_code?: string;
    };
  };
  my_chat_member?: TelegramChatMemberUpdate;
}

// Sent when the bot's membership in a chat changes. In a private chat, this
// means the user blocked the bot (kicked) or unblocked it (member).
export interface TelegramChatMemberUpdate {
  chat: { id: number; type: string };
  from: { id: number; username?: string; first_name?: string };
  new_chat_member: { status: string };
}

export type TelegramMessage = NonNullable<TelegramUpdate["message"]>;
