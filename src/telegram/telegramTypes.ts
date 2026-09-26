export interface TelegramUpdate {
  message?: {
    text?: string;
    caption?: string; // media messages carry their text here, not in `text`
    chat: { id: number };
    from: {
      id: number;
      language_code?: string;
    };
  };
}

export type TelegramMessage = NonNullable<TelegramUpdate["message"]>;
