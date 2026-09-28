import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramClient } from "../../../../src/adapters/telegram/telegram-client";

interface TelegramRequest {
  url: string;
  body: BodyInit;
}

// Stubs fetch with Telegram's answer, and returns the requests the client sends.
function stubTelegram(answer: () => Response = () => new Response('{"ok":true}')): TelegramRequest[] {
  const telegramRequests: TelegramRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      telegramRequests.push({ url, body: init.body as BodyInit });
      return answer();
    }),
  );
  return telegramRequests;
}

function telegramError(httpStatus: number, description: string): () => Response {
  return () => new Response(JSON.stringify({ ok: false, description }), { status: httpStatus });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TelegramClient", () => {
  it("sends a plain text message to the chat", async () => {
    const telegramRequests = stubTelegram();

    expect(await new TelegramClient("bot-token").sendMessage(42, "hi", null)).toEqual({ ok: true });
    expect(telegramRequests[0].url).toBe("https://api.telegram.org/botbot-token/sendMessage");
    expect(JSON.parse(telegramRequests[0].body as string)).toEqual({ chat_id: 42, text: "hi" });
  });

  it("adds a link button under the message", async () => {
    const telegramRequests = stubTelegram();

    await new TelegramClient("bot-token").sendMessage(42, "Set your time zone", { label: "Open", url: "https://bot.example/tz" });

    expect(JSON.parse(telegramRequests[0].body as string).reply_markup).toEqual({
      inline_keyboard: [[{ text: "Open", url: "https://bot.example/tz" }]],
    });
  });

  it("sends a document with an HTML caption", async () => {
    const telegramRequests = stubTelegram();

    await new TelegramClient("bot-token").sendDocument(
      42,
      { fileName: "event.ics", content: "BEGIN:VCALENDAR", mediaType: "text/calendar" },
      "<b>Game night</b>",
    );

    const formData = telegramRequests[0].body as FormData;
    expect(telegramRequests[0].url).toBe("https://api.telegram.org/botbot-token/sendDocument");
    expect(formData.get("chat_id")).toBe("42");
    expect(formData.get("caption")).toBe("<b>Game night</b>");
    expect(formData.get("parse_mode")).toBe("HTML");
    const documentFile = formData.get("document") as File;
    expect(documentFile.name).toBe("event.ics");
    expect(documentFile.type).toBe("text/calendar");
    expect(await documentFile.text()).toBe("BEGIN:VCALENDAR");
  });

  it("says when Telegram refuses the send because the user blocked the bot", async () => {
    stubTelegram(telegramError(403, "Forbidden: bot was blocked by the user"));

    expect(await new TelegramClient("bot-token").sendMessage(42, "hi", null)).toEqual({
      ok: false,
      kind: "blocked",
      httpStatus: 403,
      description: "Forbidden: bot was blocked by the user",
    });
  });

  it("says when a send fails for any other reason, without throwing", async () => {
    stubTelegram(telegramError(400, "Bad Request: chat not found"));
    expect(await new TelegramClient("bot-token").sendMessage(42, "hi", null)).toMatchObject({
      ok: false,
      kind: "failed",
      httpStatus: 400,
    });

    stubTelegram(() => new Response("not JSON", { status: 502 }));
    expect(await new TelegramClient("bot-token").sendMessage(42, "hi", null)).toEqual({
      ok: false,
      kind: "failed",
      httpStatus: 502,
      description: "",
    });
  });
});
