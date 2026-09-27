import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ExtractedEvent } from "../../src/extractedEvents/extractedEvent";
import type { Router } from "../../src/router/router";
import { eventMessageHandler } from "../../src/telegram/messageHandlers/eventMessageHandler";
import { Replier } from "../../src/telegram/replier";
import type { TelegramClient } from "../../src/telegram/telegramClient";

const event = (overrides: Partial<ExtractedEvent> = {}): ExtractedEvent => ({
  title: "Event",
  calendar: "gregorian",
  date_kind: "absolute",
  year: 2030,
  month: 9,
  day: 23,
  start_time: "20:00",
  end_time: null,
  timezone_hint: null,
  location: null,
  recurrence: null,
  confidence: 0.95,
  ...overrides,
});

// Runs one message through the handler with a router that answers `extracted`,
// and returns the .ics and caption that would be sent.
async function send(extracted: ExtractedEvent, userTimezone: string | null) {
  const router = {
    generate: async (_request: unknown, onModelFound?: () => Promise<void>) => {
      await onModelFound?.();
      return { result: "ok", model: "m", text: JSON.stringify(extracted), totalTokens: 1 };
    },
  } as unknown as Router;
  const documents: { content: string; caption: string }[] = [];
  const telegram = {
    sendMessage: async () => {},
    sendDocument: async (_chatId: number, _name: string, content: string, caption: string) =>
      void documents.push({ content, caption }),
  } as unknown as TelegramClient;

  await eventMessageHandler("text", router, new Replier(telegram, 7, "en"), 4, true, userTimezone);
  expect(documents).toHaveLength(1);
  return documents[0];
}

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

describe("event time zone", () => {
  it("uses the zone the message gives, over the user's, with no note", async () => {
    const { content, caption } = await send(event({ timezone_hint: "Asia/Tehran" }), "Europe/London");
    expect(content).toContain("DTSTART;TZID=Asia/Tehran:20300923T200000");
    expect(caption).not.toContain("🌎");
  });

  it("uses the user's /tz zone when the message gives none, and says so", async () => {
    const { content, caption } = await send(event(), "Europe/London");
    expect(content).toContain("DTSTART;TZID=Europe/London:20300923T200000");
    expect(caption).toContain("so I used yours, Europe/London. To change it, send /tz.");
  });

  it("falls back to UTC when neither says, and points to /tz", async () => {
    const { content, caption } = await send(event(), null);
    expect(content).toContain("DTSTART;TZID=UTC:20300923T200000");
    expect(caption).toContain("so I used UTC. To set yours, send /tz.");
  });

  it("says so when the date has already passed", async () => {
    const { caption } = await send(event({ year: 2020, timezone_hint: "UTC" }), null);
    expect(caption).toContain("this date has already passed");
  });

  it("says when the stated weekday doesn't match the date", async () => {
    // 20 Jan 2030 is a Sunday.
    const { caption } = await send(event({ month: 1, day: 20, weekday: "MO", timezone_hint: "UTC" }), null);
    expect(caption).toContain("The message says Monday, but Jan 20, 2030 is a Sunday. Check the date.");
  });

  it("adds no past-date note to a future event", async () => {
    const { caption } = await send(event({ timezone_hint: "UTC" }), null);
    expect(caption).not.toContain("ℹ️");
  });

  it("adds no note to an all-day event, whose date doesn't depend on a zone", async () => {
    const { caption } = await send(event({ start_time: null }), null);
    expect(caption).not.toContain("🌎");
  });
});
