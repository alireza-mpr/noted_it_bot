import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TelegramReplier } from "../../../../src/adapters/telegram/replier";
import type { DocumentFile, LinkButton, TelegramSendResult } from "../../../../src/adapters/telegram/telegram-client";
import { axiomEventsOf } from "../logging/axiom-events-of";

const CALENDAR_FILE = { fileName: "event.ics", content: "BEGIN:VCALENDAR" };

// Represents a Telegram client that gives every send the same result, and
// remembers what it was asked to send.
class FakeTelegramClient {
  readonly sentMessages: { chatId: number; text: string; linkButton: LinkButton | null }[] = [];
  readonly sentDocuments: { chatId: number; documentFile: DocumentFile; htmlCaption: string }[] = [];

  constructor(private readonly sendResult: TelegramSendResult = { ok: true }) {}

  async sendMessage(chatId: number, text: string, linkButton: LinkButton | null): Promise<TelegramSendResult> {
    this.sentMessages.push({ chatId, text, linkButton });
    return this.sendResult;
  }

  async sendDocument(chatId: number, documentFile: DocumentFile, htmlCaption: string): Promise<TelegramSendResult> {
    this.sentDocuments.push({ chatId, documentFile, htmlCaption });
    return this.sendResult;
  }
}

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TelegramReplier", () => {
  it("sends each kind of reply to its chat, and the calendar file as text/calendar", async () => {
    const fakeTelegramClient = new FakeTelegramClient();
    const replier = new TelegramReplier(fakeTelegramClient, 42);
    const linkButton = { label: "Open", url: "https://bot.example/tz" };

    await replier.sendText("hi");
    await replier.sendTextWithLinkButton("Set your time zone", linkButton);
    await replier.sendCalendarFile(CALENDAR_FILE, "<b>Game night</b>");

    expect(fakeTelegramClient.sentMessages).toEqual([
      { chatId: 42, text: "hi", linkButton: null },
      { chatId: 42, text: "Set your time zone", linkButton },
    ]);
    expect(fakeTelegramClient.sentDocuments).toEqual([
      { chatId: 42, documentFile: { ...CALENDAR_FILE, mediaType: "text/calendar" }, htmlCaption: "<b>Game night</b>" },
    ]);
  });

  it("logs a fixed telegram.reply_sent event for each kind of reply", async () => {
    const replier = new TelegramReplier(new FakeTelegramClient(), 42);

    const logEvents = await axiomEventsOf(async () => {
      await replier.sendText("hi");
      await replier.sendTextWithLinkButton("Set your time zone", { label: "Open", url: "https://bot.example/tz" });
      await replier.sendCalendarFile(CALENDAR_FILE, "caption");
    });

    expect(logEvents.map((logEvent) => [logEvent.eventName, logEvent["telegram.reply_kind"]])).toEqual([
      ["telegram.reply_sent", "text"],
      ["telegram.reply_sent", "text_with_link"],
      ["telegram.reply_sent", "calendar_file"],
    ]);
  });

  it("logs a send refused because the user blocked the bot as a user activity", async () => {
    const blocked: TelegramSendResult = { ok: false, kind: "blocked", httpStatus: 403, description: "Forbidden: bot was blocked by the user" };

    const logEvents = await axiomEventsOf(() => new TelegramReplier(new FakeTelegramClient(blocked), 42).sendText("hi"));

    expect(logEvents).toEqual([
      expect.objectContaining({ eventName: "user_activity.bot_blocked", "user_activity.via": "send_refused" }),
    ]);
  });

  it("warns about any other failed send, without calling it a block and without throwing", async () => {
    const failed: TelegramSendResult = { ok: false, kind: "failed", httpStatus: 400, description: "Bad Request: chat not found" };

    const logEvents = await axiomEventsOf(() => new TelegramReplier(new FakeTelegramClient(failed), 42).sendText("hi"));

    expect(logEvents).toEqual([
      expect.objectContaining({
        severityText: "WARN",
        eventName: "telegram.send_failed",
        "telegram.method": "sendMessage",
        "http.response.status_code": 400,
        "telegram.error_description": "Bad Request: chat not found",
      }),
    ]);
  });

  it("does not log a sent reply when the network fails: the error is thrown", async () => {
    const throwingClient = {
      sendMessage: async (): Promise<TelegramSendResult> => {
        throw new Error("network down");
      },
      sendDocument: async (): Promise<TelegramSendResult> => ({ ok: true }),
    };
    let thrownError: unknown = null;

    const logEvents = await axiomEventsOf(async () => {
      await new TelegramReplier(throwingClient, 42).sendText("hi").catch((error: unknown) => {
        thrownError = error;
      });
    });

    expect(String(thrownError)).toContain("network down");
    expect(logEvents).toEqual([]);
  });
});
