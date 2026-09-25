export interface TelegramUpdate {
  message?: {
    text?: string;
    caption?: string; // media messages carry their text here, not in `text`
    chat: { id: number };
    from: {
      id: number;
      username?: string;
      language_code?: string;
    };
  };
}

export type TelegramMessage = NonNullable<TelegramUpdate["message"]>;
