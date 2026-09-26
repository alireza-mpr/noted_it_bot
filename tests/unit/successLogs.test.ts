import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runLogSession } from "../../src/logging/logger";
import type { Router } from "../../src/router/router";
import { Replier } from "../../src/telegram/replier";
import type { TelegramClient } from "../../src/telegram/telegramClient";
import { translateText } from "../../src/translation/translate";

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

function fakeKv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
  } as unknown as KVNamespace;
}

const okRouter = {
  generate: async () => ({ result: "ok", model: "gemini-3.1-flash-lite", text: "سلام", totalTokens: 5 }),
} as unknown as Router;

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
    const replier = new Replier({ I18N: fakeKv() }, okRouter, telegram, 1, "en");

    const events = await capture(async () => {
      await replier.say("Hello");
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
    const replier = new Replier({ I18N: fakeKv() }, okRouter, failing, 1, "en");

    const events = await capture(async () => {
      await replier.say("Hello").catch(() => {});
    });

    expect(events).toHaveLength(0);
  });
});

describe("translateText", () => {
  it("logs one 'translation generated' on a miss and a debug 'cache hit' afterwards", async () => {
    const env = { I18N: fakeKv() };

    const events = await capture(async () => {
      await translateText(env, okRouter, "Hello", "fa");
      await translateText(env, okRouter, "Hello", "fa");
    });

    expect(events.map((e) => [e.level, e.message])).toEqual([
      ["info", "translation generated"],
      ["debug", "translation cache hit"],
    ]);
    expect(events[0]).toMatchObject({ lang: "fa", model: "gemini-3.1-flash-lite" });
    expect(events[1]).toMatchObject({ lang: "fa" });
  });

  it("logs nothing for English, which needs no translation", async () => {
    const events = await capture(async () => {
      await translateText({ I18N: fakeKv() }, okRouter, "Hello", "en");
    });
    expect(events).toHaveLength(0);
  });
});
