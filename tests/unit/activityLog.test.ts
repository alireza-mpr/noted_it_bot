import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/legacy/env";
import { runLogSession } from "../../src/legacy/logging/logger";
import type { Router } from "../../src/legacy/router/router";
import { updateHandler } from "../../src/legacy/telegram/messageHandlers/updateHandler";
import { TelegramClient } from "../../src/legacy/telegram/telegramClient";
import { handleTzPage } from "../../src/legacy/web/tzRoutes";
import { OPEN_TOKEN_TTL_MS, signTzToken } from "../../src/legacy/web/tzToken";

type Event = Record<string, unknown>;

const SECRET = "test-secret-value";
const NOW = 1_800_000_000_000;

// Runs fn in a log session and returns the events that would go to Axiom.
// Telegram calls get telegramResponse.
async function axiomEvents(
  fn: () => Promise<unknown>,
  telegramResponse: () => Response = () => new Response('{"ok":true}'),
): Promise<Event[]> {
  let sent: Event[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).includes("api.telegram.org")) {
        return telegramResponse();
      }
      sent = JSON.parse(init.body as string);
      return new Response("{}");
    }),
  );
  const pending: Promise<unknown>[] = [];
  await runLogSession(
    { AXIOM_TOKEN: "t" },
    { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
    async () => {
      await fn();
    },
  );
  await Promise.all(pending);
  return sent;
}

const activities = (events: Event[]) => events.filter((e) => e.message === "user activity");

function membershipUpdate(status: string, username?: string): Request {
  return new Request("https://bot.example/", {
    method: "POST",
    body: JSON.stringify({
      update_id: 1,
      my_chat_member: {
        chat: { id: 42, type: "private" },
        from: { id: 42, first_name: "Alice", ...(username && { username }) },
        new_chat_member: { status },
      },
    }),
  });
}

const handle = (request: Request) =>
  updateHandler(request, {} as Env, {} as Router, new TelegramClient("token"));

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("user activity", () => {
  it("logs a block with the user's id, username and first name", async () => {
    const events = await axiomEvents(() => handle(membershipUpdate("kicked", "alice")));
    expect(activities(events)).toEqual([
      expect.objectContaining({
        activity: "bot_blocked",
        via: "membership",
        userId: 42,
        username: "alice",
        firstName: "Alice",
        chatId: 42,
      }),
    ]);
  });

  it("logs an unblock, with a null username when the user has none", async () => {
    const events = await axiomEvents(() => handle(membershipUpdate("member")));
    expect(activities(events)).toEqual([
      expect.objectContaining({ activity: "bot_unblocked", userId: 42, username: null, firstName: "Alice" }),
    ]);
  });

  it("logs a send refused because the user blocked the bot", async () => {
    const events = await axiomEvents(
      () => new TelegramClient("token").sendMessage(42, "hi"),
      () => new Response(JSON.stringify({ ok: false, description: "Forbidden: bot was blocked by the user" }), { status: 403 }),
    );
    expect(activities(events)).toEqual([expect.objectContaining({ activity: "bot_blocked", via: "send_refused" })]);
  });

  it("warns on any other failed send without calling it a block", async () => {
    const events = await axiomEvents(
      () => new TelegramClient("token").sendMessage(42, "hi"),
      () => new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 }),
    );
    expect(activities(events)).toEqual([]);
    expect(events).toEqual([
      expect.objectContaining({ level: "warn", message: "telegram send failed", status: 400, method: "sendMessage" }),
    ]);
  });

  it("carries the username and first name from the /tz token into the page's logs", async () => {
    const token = await signTzToken(SECRET, {
      uid: 42,
      username: "alice",
      firstName: "Alice",
      lang: "en",
      purpose: "open",
      exp: NOW + OPEN_TOKEN_TTL_MS,
    });
    const events = await axiomEvents(() =>
      handleTzPage(
        new Request(`https://bot.example/tz?token=${encodeURIComponent(token)}`),
        { WEBHOOK_SECRET: SECRET, USAGE_DB: {} as D1Database },
        NOW,
      ),
    );
    expect(activities(events)).toEqual([
      expect.objectContaining({ activity: "tz_page_opened", userId: 42, username: "alice", firstName: "Alice" }),
    ]);
  });
});
