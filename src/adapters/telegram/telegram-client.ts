import { readRecord, readStringOrNull } from "../../generic/json/json-fields";

const TELEGRAM_API_URL = "https://api.telegram.org";

// Represents a button under a message that opens a link.
export interface LinkButton {
  label: string;
  url: string;
}

// Represents a file to send as a document.
export interface DocumentFile {
  fileName: string;
  content: string;
  mediaType: string;
}

// Represents the result of a send: sent, refused because the user blocked the
// bot, or failed for another reason.
export type TelegramSendResult =
  | { ok: true }
  | {
      ok: false;
      kind: "blocked" | "failed";
      httpStatus: number;
      description: string;
    };

// Represents a client for the Telegram Bot API. Telegram's answer comes back
// as a TelegramSendResult; only a network error throws.
export class TelegramClient {
  constructor(private readonly botToken: string) {}

  // Sends a plain text message, with a link button under it if one is given.
  async sendMessage(
    chatId: number,
    text: string,
    linkButton: LinkButton | null,
  ): Promise<TelegramSendResult> {
    const response = await fetch(this.methodUrlOf("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(linkButton !== null && {
          reply_markup: {
            inline_keyboard: [[{ text: linkButton.label, url: linkButton.url }]],
          },
        }),
      }),
    });
    return sendResultOf(response);
  }

  // Sends a file, with a caption in Telegram HTML.
  async sendDocument(
    chatId: number,
    documentFile: DocumentFile,
    htmlCaption: string,
  ): Promise<TelegramSendResult> {
    const formData = new FormData();
    formData.set("chat_id", String(chatId));
    formData.set("caption", htmlCaption);
    formData.set("parse_mode", "HTML");
    formData.set(
      "document",
      new Blob([documentFile.content], { type: documentFile.mediaType }),
      documentFile.fileName,
    );
    const response = await fetch(this.methodUrlOf("sendDocument"), {
      method: "POST",
      body: formData,
    });
    return sendResultOf(response);
  }

  private methodUrlOf(methodName: string): string {
    return `${TELEGRAM_API_URL}/bot${this.botToken}/${methodName}`;
  }
}

async function sendResultOf(response: Response): Promise<TelegramSendResult> {
  if (response.ok) {
    return { ok: true };
  }
  const description = await descriptionOf(response);
  // Telegram refuses a send to a user who blocked the bot with 403 "Forbidden:
  // bot was blocked by the user".
  const isBlocked = response.status === 403 && /blocked/i.test(description);
  return {
    ok: false,
    kind: isBlocked ? "blocked" : "failed",
    httpStatus: response.status,
    description,
  };
}

// Returns the description in Telegram's error answer, or "" if there is none.
async function descriptionOf(response: Response): Promise<string> {
  try {
    return readStringOrNull(readRecord(await response.json(), "the answer"), "description") ?? "";
  } catch {
    return "";
  }
}
