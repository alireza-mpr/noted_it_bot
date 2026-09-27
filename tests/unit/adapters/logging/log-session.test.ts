import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  currentTraceId,
  runLogSession,
  setLogAttribute,
} from "../../../../src/adapters/logging/log-session";
import { Logger } from "../../../../src/adapters/logging/logger";

interface AxiomRequest {
  url: string;
  headers: Record<string, string>;
  logEvents: Record<string, unknown>[];
}

const LOG_SESSION_ENV = { AXIOM_TOKEN: "test-token", APP_VERSION: "1.2.3" };

const consoleLines: string[] = [];

function fakeExecutionContext() {
  const pendingPromises: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: Promise<unknown>) => void pendingPromises.push(promise),
    settled: () => Promise.all(pendingPromises),
  };
}

function stubAxiom(
  respond: () => Response | Promise<Response> = () => new Response("{}"),
): AxiomRequest[] {
  const axiomRequests: AxiomRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      axiomRequests.push({
        url,
        headers: init.headers as Record<string, string>,
        logEvents: JSON.parse(init.body as string),
      });
      return respond();
    }),
  );
  return axiomRequests;
}

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((line: string) => {
      consoleLines.push(line);
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleLines.length = 0;
});

describe("runLogSession", () => {
  it("sends every event of one session in a single batch sharing one traceId", async () => {
    const axiomRequests = stubAxiom();
    const executionContext = fakeExecutionContext();
    const logger = new Logger<string>("test-scope");

    await runLogSession(LOG_SESSION_ENV, executionContext, async () => {
      logger.info("test.first");
      await Promise.resolve();
      logger.warn("test.second", { "gen_ai.request.model": "m1" });
      logger.error("test.third");
    });
    await executionContext.settled();

    expect(axiomRequests).toHaveLength(1);
    const { logEvents } = axiomRequests[0];
    expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual(["test.first", "test.second", "test.third"]);
    expect(logEvents.map((logEvent) => logEvent.severityText)).toEqual(["INFO", "WARN", "ERROR"]);
    expect(logEvents.map((logEvent) => logEvent.severityNumber)).toEqual([9, 13, 17]);
    expect(new Set(logEvents.map((logEvent) => logEvent.traceId)).size).toBe(1);
    expect(logEvents[1]).toMatchObject({
      "scope.name": "test-scope",
      "gen_ai.request.model": "m1",
      "service.name": "noted-it-bot",
      "service.version": "1.2.3",
    });
    expect(typeof logEvents[0]._time).toBe("string");
  });

  it("uses an OpenTelemetry trace id: 32 lowercase hex characters", async () => {
    const traceId = await runLogSession({}, fakeExecutionContext(), async () => currentTraceId());

    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("posts to the app-logs dataset with the bearer token", async () => {
    const axiomRequests = stubAxiom();
    const executionContext = fakeExecutionContext();

    await runLogSession(LOG_SESSION_ENV, executionContext, async () => new Logger<string>("t").info("test.hi"));
    await executionContext.settled();

    expect(axiomRequests[0].url).toBe("https://us-east-1.aws.edge.axiom.co/v1/ingest/app-logs");
    expect(axiomRequests[0].headers.Authorization).toBe("Bearer test-token");
    expect(axiomRequests[0].headers["Content-Type"]).toBe("application/json");
  });

  it("keeps concurrent sessions apart, each with its own traceId", async () => {
    const axiomRequests = stubAxiom();
    const executionContext = fakeExecutionContext();
    const logger = new Logger<string>("t");

    const runSession = (name: string) =>
      runLogSession(LOG_SESSION_ENV, executionContext, async () => {
        logger.info(`${name}.start`);
        await new Promise((resolve) => setTimeout(resolve, name === "a" ? 10 : 1));
        logger.info(`${name}.end`);
        return currentTraceId();
      });
    const [traceIdA, traceIdB] = await Promise.all([runSession("a"), runSession("b")]);
    await executionContext.settled();

    expect(traceIdA).not.toBe(traceIdB);
    expect(axiomRequests).toHaveLength(2);
    for (const { logEvents } of axiomRequests) {
      const name = String(logEvents[0].eventName)[0];
      expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual([`${name}.start`, `${name}.end`]);
      expect(new Set(logEvents.map((logEvent) => logEvent.traceId)).size).toBe(1);
    }
    expect(new Set(axiomRequests.map((axiomRequest) => axiomRequest.logEvents[0].traceId))).toEqual(
      new Set([traceIdA, traceIdB]),
    );
  });

  it("numbers events with an increasing seq, even when they share the same _time", async () => {
    const axiomRequests = stubAxiom();
    const executionContext = fakeExecutionContext();
    const logger = new Logger<string>("t");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T09:00:00.000Z"));

    try {
      await runLogSession(LOG_SESSION_ENV, executionContext, async () => {
        for (const name of ["a", "b", "c", "d"]) logger.info(`test.${name}`);
      });
      await runLogSession(LOG_SESSION_ENV, executionContext, async () => logger.info("test.other_request"));
    } finally {
      vi.useRealTimers();
    }
    await executionContext.settled();

    const [firstLogEvents, secondLogEvents] = axiomRequests.map((axiomRequest) => axiomRequest.logEvents);
    expect(new Set(firstLogEvents.map((logEvent) => logEvent._time)).size).toBe(1);
    expect(firstLogEvents.map((logEvent) => logEvent["log_session.seq"])).toEqual([1, 2, 3, 4]);
    expect(firstLogEvents.map((logEvent) => logEvent.eventName)).toEqual(["test.a", "test.b", "test.c", "test.d"]);
    expect(secondLogEvents.map((logEvent) => logEvent["log_session.seq"])).toEqual([1]);
    expect(consoleLines.map((consoleLine) => JSON.parse(consoleLine)["log_session.seq"])).toEqual([1, 2, 3, 4, 1]);
  });

  it("adds attributes set with setLogAttribute to events logged after it", async () => {
    const axiomRequests = stubAxiom();
    const executionContext = fakeExecutionContext();
    const logger = new Logger<string>("t");

    await runLogSession(LOG_SESSION_ENV, executionContext, async () => {
      logger.info("test.before");
      setLogAttribute("user.id", 42);
      logger.info("test.after");
    });
    await executionContext.settled();

    expect(axiomRequests[0].logEvents[0]).not.toHaveProperty("user.id");
    expect(axiomRequests[0].logEvents[1]).toMatchObject({ "user.id": 42 });
  });

  it("sends nothing without a token or without events", async () => {
    const axiomRequests = stubAxiom();
    const executionContext = fakeExecutionContext();

    await runLogSession({ APP_VERSION: "x" }, executionContext, async () =>
      new Logger<string>("t").info("test.no_token"),
    );
    await runLogSession(LOG_SESSION_ENV, executionContext, async () => {});
    await executionContext.settled();

    expect(axiomRequests).toHaveLength(0);
  });

  it("returns the result and never throws when Axiom fails", async () => {
    stubAxiom(() => new Response("nope", { status: 500 }));
    const failingExecutionContext = fakeExecutionContext();
    const reply = await runLogSession(LOG_SESSION_ENV, failingExecutionContext, async () => {
      new Logger<string>("t").info("test.hi");
      return "reply";
    });
    await expect(failingExecutionContext.settled()).resolves.toBeDefined();
    expect(reply).toBe("reply");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const throwingExecutionContext = fakeExecutionContext();
    await runLogSession(LOG_SESSION_ENV, throwingExecutionContext, async () => new Logger<string>("t").info("test.hi"));
    await expect(throwingExecutionContext.settled()).resolves.toBeDefined();
  });

  it("still sends and rethrows when the function throws", async () => {
    const axiomRequests = stubAxiom();
    const executionContext = fakeExecutionContext();

    await expect(
      runLogSession(LOG_SESSION_ENV, executionContext, async () => {
        new Logger<string>("t").error("test.about_to_fail");
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
    await executionContext.settled();

    expect(axiomRequests[0].logEvents[0]).toMatchObject({ eventName: "test.about_to_fail" });
  });

  it("does not send events logged outside any session", async () => {
    const axiomRequests = stubAxiom();
    const executionContext = fakeExecutionContext();

    new Logger<string>("t").info("test.outside");
    await runLogSession(LOG_SESSION_ENV, executionContext, async () => new Logger<string>("t").info("test.inside"));
    await executionContext.settled();

    expect(axiomRequests[0].logEvents.map((logEvent) => logEvent.eventName)).toEqual(["test.inside"]);
  });

  it("has no trace id outside a session", () => {
    expect(currentTraceId()).toBeNull();
  });
});
