import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runLogSession } from "../../src/legacy/logging/logger";
import { Replier } from "../../src/legacy/telegram/replier";
import type { TelegramClient } from "../../src/legacy/telegram/telegramClient";

type Event = Record<string, unknown>;

async function capture(fn: () => Promise<void>): Promise<Event[]> {
  let sent: Event[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return new Response("{}");
    }),
  );
  const pending: Promise<unknown>[] = [];
  await runLogSession(
    { AXIOM_TOKEN: "t" },
    { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
    fn,
  );
  await Promise.all(pending);
  return sent;
}

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Replier", () => {
  const telegram = {
    sendMessage: async () => {},
    sendDocument: async () => {},
  } as unknown as TelegramClient;

  it("logs a fixed 'reply sent' event for a text reply and for a document", async () => {
    const replier = new Replier(telegram, 1, "en");

    const events = await capture(async () => {
      await replier.say("NO_TEXT_MESSAGE");
      await replier.sendDocument("event.ics", "BEGIN:VCALENDAR", "caption");
    });

    expect(events.map((e) => [e.level, e.message, e.type])).toEqual([
      ["info", "reply sent", "text"],
      ["info", "reply sent", "document"],
    ]);
    expect(events[0]).toMatchObject({ source: "replier", lang: "en" });
    expect(events[1]).toMatchObject({ filename: "event.ics" });
  });

  it("does not log 'reply sent' when sending fails", async () => {
    const failing = { sendMessage: async () => { throw new Error("telegram down"); } } as unknown as TelegramClient;
    const replier = new Replier(failing, 1, "en");

    const events = await capture(async () => {
      await replier.say("NO_TEXT_MESSAGE").catch(() => {});
    });

    expect(events).toHaveLength(0);
  });
});
