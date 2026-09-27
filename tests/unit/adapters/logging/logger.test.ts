import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exceptionAttributesOf } from "../../../../src/adapters/logging/log-event";
import { currentTraceId } from "../../../../src/adapters/logging/log-session";
import { Logger } from "../../../../src/adapters/logging/logger";
import { axiomEventsOf } from "./axiom-events-of";

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

describe("Logger", () => {
  it("prints every line to the console as JSON carrying the same traceId", async () => {
    const logger = new Logger<string>("test-scope");
    let traceId: string | null = null;

    await axiomEventsOf(() => {
      logger.info("test.one", { "gen_ai.request.model": "m1" });
      logger.warn("test.two");
      logger.error("test.three");
      traceId = currentTraceId();
    });

    expect(consoleLines.map((consoleLine) => consoleLine.method)).toEqual(["info", "warn", "error"]);
    const printedEvents = consoleLines.map((consoleLine) => JSON.parse(consoleLine.line));
    expect(printedEvents[0]).toMatchObject({
      severityText: "INFO",
      eventName: "test.one",
      "scope.name": "test-scope",
      "gen_ai.request.model": "m1",
      traceId,
    });
    expect(new Set(printedEvents.map((printedEvent) => printedEvent.traceId))).toEqual(new Set([traceId]));
  });

  it("prints a line outside a log session, without seq or traceId", () => {
    new Logger<string>("t").info("test.outside", { "user.id": 42 });

    expect(JSON.parse(consoleLines[0].line)).toEqual({
      severityText: "INFO",
      eventName: "test.outside",
      "scope.name": "t",
      "user.id": 42,
    });
  });

  it("logs exception attributes at the top level of the event", async () => {
    const logEvents = await axiomEventsOf(() => {
      new Logger<string>("t").error("test.failed", exceptionAttributesOf(new Error("boom")));
    });

    expect(logEvents[0]).toMatchObject({
      severityText: "ERROR",
      eventName: "test.failed",
      "exception.type": "Error",
      "exception.message": "boom",
    });
    expect(String(logEvents[0]["exception.stacktrace"])).toContain("boom");
  });

  it("truncates very large strings", async () => {
    const logEvents = await axiomEventsOf(() => {
      new Logger<string>("t").info("test.big", { "extraction.message_text": "y".repeat(50_000) });
    });

    const messageText = String(logEvents[0]["extraction.message_text"]);
    expect(messageText.length).toBeLessThan(10_100);
    expect(messageText).toContain("truncated");
  });
});
