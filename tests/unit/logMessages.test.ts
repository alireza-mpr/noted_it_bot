import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runLogSession } from "../../src/logging/logger";
import { UserQuotaPolicyLogger } from "../../src/policy/userQuotaPolicyLogger";
import type { ProviderConfig } from "../../src/providers/ProviderConfig";
import { RouterLog } from "../../src/router/routerLog";

type Event = Record<string, unknown>;

const MODEL = { id: "gemini-3.1-flash-lite" } as ProviderConfig;

async function capture(fn: () => void | Promise<void>): Promise<Event[]> {
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
    async () => {
      await fn();
    },
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

describe("RouterLog", () => {
  it("logs fixed messages with the data in fields", async () => {
    const log = new RouterLog();
    const events = await capture(() => {
      log.listed([MODEL, { id: "groq-gpt-oss-120b" } as ProviderConfig]);
      log.attempted(MODEL);
      log.succeeded(MODEL, 812);
      log.rateLimited(MODEL, "day");
      log.unavailable(MODEL, { ok: false, kind: "unavailable", httpStatus: 503, detail: "high demand" });
      log.failed(MODEL, { ok: false, kind: "badRequest", detail: "bad schema" });
      log.noModelSucceeded();
    });

    expect(events.map((e) => [e.level, e.message])).toEqual([
      ["info", "available models"],
      ["info", "attempting model"],
      ["info", "model succeeded"],
      ["warn", "model rate limited"],
      ["warn", "model unavailable"],
      ["error", "model failed"],
      ["error", "no model succeeded"],
    ]);
    expect(events[0]).toMatchObject({ models: ["gemini-3.1-flash-lite", "groq-gpt-oss-120b"] });
    expect(events[1]).toMatchObject({ model: "gemini-3.1-flash-lite" });
    expect(events[2]).toMatchObject({ model: "gemini-3.1-flash-lite", tokens: 812 });
    expect(events[3]).toMatchObject({ model: "gemini-3.1-flash-lite", quotaLimitScope: "day" });
    expect(events[4]).toMatchObject({ model: "gemini-3.1-flash-lite", httpStatus: 503, detail: "high demand" });
    expect(events[5]).toMatchObject({ httpStatus: null, detail: "bad schema" });
    for (const e of events) {
      expect(String(e.message)).not.toMatch(/gemini|groq|812|503|high demand/);
    }
  });

  it("still returns the descriptive text the usage tables store as lastError", () => {
    const log = new RouterLog();
    expect(log.rateLimited(MODEL, "minute")).toBe("rate limited (minute quota)");
    expect(log.unavailable(MODEL, { ok: false, kind: "unavailable", httpStatus: 503, detail: "busy" })).toBe(
      "unavailable (HTTP 503): busy",
    );
    expect(log.failed(MODEL, { ok: false, kind: "badRequest", detail: "nope" })).toBe(
      "failed with HTTP n/a: nope",
    );
  });
});

describe("policy loggers", () => {
  it("logs an exhausted quota with a fixed message and a userId field", async () => {
    const events = await capture(() => new UserQuotaPolicyLogger().exhausted(42));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: "warn",
      source: "userQuotaPolicyLogger",
      message: "daily quota exhausted",
      userId: 42,
    });
  });

});
