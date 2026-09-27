export interface TelegramUpdate {
  message?: {
    text?: string;
    caption?: string; // media messages carry their text here, not in `text`
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

// Sent when the bot's own membership in a chat changes; in a private chat that
// is the user blocking (kicked) or unblocking (member) the bot.
export interface TelegramChatMemberUpdate {
  chat: { id: number; type: string };
  from: { id: number; username?: string; first_name?: string };
  new_chat_member: { status: string };
}

export type TelegramMessage = NonNullable<TelegramUpdate["message"]>;
