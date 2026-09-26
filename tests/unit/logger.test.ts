import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  currentCorrelationId,
  describeError,
  Logger,
  runLogSession,
  setLogField,
} from "../../src/logging/logger";

interface Sent {
  url: string;
  headers: Record<string, string>;
  events: Record<string, unknown>[];
}

function fakeCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    settled: () => Promise.all(pending),
  };
}

function stubIngest(response: () => Response | Promise<Response> = () => new Response("{}")) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({
        url,
        headers: init.headers as Record<string, string>,
        events: JSON.parse(init.body as string),
      });
      return response();
    }),
  );
  return sent;
}

const ENV = { AXIOM_TOKEN: "test-token", APP_VERSION: "1.2.3" };

const consoleLines: { method: string; line: string }[] = [];

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((line: string) => {
      consoleLines.push({ method, line });
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleLines.length = 0;
});

describe("runLogSession", () => {
  it("sends every event of one session in a single batch sharing one correlationId", async () => {
    const sent = stubIngest();
    const ctx = fakeCtx();
    const logger = new Logger("testLogger");

    await runLogSession(ENV, ctx, async () => {
      logger.info("first");
      await Promise.resolve();
      logger.warn("second", { model: "m1" });
      logger.error("third");
    });
    await ctx.settled();

    expect(sent).toHaveLength(1);
    const { events } = sent[0];
    expect(events.map((e) => e.message)).toEqual(["first", "second", "third"]);
    expect(events.map((e) => e.level)).toEqual(["info", "warn", "error"]);
    expect(new Set(events.map((e) => e.correlationId)).size).toBe(1);
    expect(events[1]).toMatchObject({ source: "testLogger", model: "m1", service: "noted-it-bot", version: "1.2.3" });
    expect(typeof events[0]._time).toBe("string");
  });

  it("posts to the app-logs dataset with the bearer token", async () => {
    const sent = stubIngest();
    const ctx = fakeCtx();

    await runLogSession(ENV, ctx, async () => new Logger("t").info("hi"));
    await ctx.settled();

    expect(sent[0].url).toBe("https://us-east-1.aws.edge.axiom.co/v1/ingest/app-logs");
    expect(sent[0].headers.Authorization).toBe("Bearer test-token");
    expect(sent[0].headers["Content-Type"]).toBe("application/json");
  });

  it("keeps concurrent sessions apart, each with its own correlationId", async () => {
    const sent = stubIngest();
    const ctx = fakeCtx();
    const logger = new Logger("t");

    const session = (name: string) =>
      runLogSession(ENV, ctx, async () => {
        logger.info(`${name}-start`);
        await new Promise((resolve) => setTimeout(resolve, name === "a" ? 10 : 1));
        logger.info(`${name}-end`);
        return currentCorrelationId();
      });
    const [idA, idB] = await Promise.all([session("a"), session("b")]);
    await ctx.settled();

    expect(idA).not.toBe(idB);
    expect(sent).toHaveLength(2);
    for (const { events } of sent) {
      const prefix = String(events[0].message)[0];
      expect(events.map((e) => e.message)).toEqual([`${prefix}-start`, `${prefix}-end`]);
      expect(new Set(events.map((e) => e.correlationId)).size).toBe(1);
    }
    expect(new Set(sent.map((s) => s.events[0].correlationId))).toEqual(new Set([idA, idB]));
  });

  it("adds fields set with setLogField to events logged after it", async () => {
    const sent = stubIngest();
    const ctx = fakeCtx();
    const logger = new Logger("t");

    await runLogSession(ENV, ctx, async () => {
      logger.info("before");
      setLogField("userId", 42);
      logger.info("after");
    });
    await ctx.settled();

    expect(sent[0].events[0]).not.toHaveProperty("userId");
    expect(sent[0].events[1]).toMatchObject({ userId: 42 });
  });

  it("prints every line to the console as JSON carrying the same correlationId", async () => {
    stubIngest();
    const ctx = fakeCtx();
    const logger = new Logger("testLogger");

    const id = await runLogSession(ENV, ctx, async () => {
      logger.info("one", { model: "m1" });
      logger.warn("two");
      logger.error("three");
      return currentCorrelationId();
    });
    await ctx.settled();

    expect(consoleLines.map((l) => l.method)).toEqual(["info", "warn", "error"]);
    const parsed = consoleLines.map((l) => JSON.parse(l.line));
    expect(parsed[0]).toMatchObject({ level: "info", source: "testLogger", message: "one", model: "m1", correlationId: id });
    expect(new Set(parsed.map((p) => p.correlationId))).toEqual(new Set([id]));
  });

  it("describeError keeps the stack of an Error and stringifies anything else", () => {
    expect(String(describeError(new Error("boom")).error)).toContain("boom");
    expect(describeError(new Error("boom")).error).toContain("Error");
    expect(describeError("plain")).toEqual({ error: "plain" });
    expect(describeError({ a: 1 })).toEqual({ error: "[object Object]" });
  });

  it("logs an Error passed as a field without breaking serialization", async () => {
    const sent = stubIngest();
    const ctx = fakeCtx();

    await runLogSession(ENV, ctx, async () => {
      new Logger("t").error("failed", describeError(new Error("boom")));
    });
    await ctx.settled();

    expect(sent[0].events[0]).toMatchObject({ level: "error", message: "failed" });
    expect(String(sent[0].events[0].error)).toContain("boom");
  });

  it("truncates very large strings", async () => {
    const sent = stubIngest();
    const ctx = fakeCtx();

    await runLogSession(ENV, ctx, async () => {
      new Logger("t").info("x".repeat(50_000), { big: "y".repeat(50_000) });
    });
    await ctx.settled();

    const [event] = sent[0].events;
    expect(String(event.message).length).toBeLessThan(10_100);
    expect(String(event.big).length).toBeLessThan(10_100);
    expect(String(event.message)).toContain("truncated");
  });

  it("sends nothing without a token or without events", async () => {
    const sent = stubIngest();
    const ctx = fakeCtx();

    await runLogSession({ APP_VERSION: "x" }, ctx, async () => new Logger("t").info("no token"));
    await runLogSession(ENV, ctx, async () => {});
    await ctx.settled();

    expect(sent).toHaveLength(0);
  });

  it("returns the result and never throws when Axiom fails", async () => {
    stubIngest(() => new Response("nope", { status: 500 }));
    const ctx = fakeCtx();
    const result = await runLogSession(ENV, ctx, async () => {
      new Logger("t").info("hi");
      return "reply";
    });
    await expect(ctx.settled()).resolves.toBeDefined();
    expect(result).toBe("reply");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const ctx2 = fakeCtx();
    await runLogSession(ENV, ctx2, async () => new Logger("t").info("hi"));
    await expect(ctx2.settled()).resolves.toBeDefined();
  });

  it("still flushes and rethrows when the handler throws", async () => {
    const sent = stubIngest();
    const ctx = fakeCtx();

    await expect(
      runLogSession(ENV, ctx, async () => {
        new Logger("t").error("about to fail");
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
    await ctx.settled();

    expect(sent[0].events[0]).toMatchObject({ message: "about to fail" });
  });

  it("does not send events logged outside any session", async () => {
    const sent = stubIngest();
    const ctx = fakeCtx();

    new Logger("t").info("outside");
    await runLogSession(ENV, ctx, async () => new Logger("t").info("inside"));
    await ctx.settled();

    expect(sent[0].events.map((e) => e.message)).toEqual(["inside"]);
  });
});
