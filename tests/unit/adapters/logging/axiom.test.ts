import { afterEach, describe, expect, it, vi } from "vitest";
import { sendToAxiom } from "../../../../src/adapters/logging/axiom";
import type { LogEvent } from "../../../../src/adapters/logging/log-event";

const LOG_EVENT: LogEvent = {
  _time: "2026-09-28T02:00:00.000Z",
  severityText: "INFO",
  severityNumber: 9,
  eventName: "user_activity.bot_started",
  traceId: "0123456789abcdef0123456789abcdef",
  "scope.name": "user-activity",
  "service.name": "noted-it-bot",
  "service.version": "1.0.0",
  "log_session.seq": 1,
  "user.id": 42,
  "telegram.chat.id": 42,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendToAxiom", () => {
  it("sends each dotted name as nested fields, which Axiom's filters can find", async () => {
    let sentBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = init.body as string;
        return new Response("{}");
      }),
    );

    await sendToAxiom("test-token", [LOG_EVENT]);

    expect(JSON.parse(sentBody)).toEqual([
      {
        _time: "2026-09-28T02:00:00.000Z",
        severityText: "INFO",
        severityNumber: 9,
        eventName: "user_activity.bot_started",
        traceId: "0123456789abcdef0123456789abcdef",
        scope: { name: "user-activity" },
        service: { name: "noted-it-bot", version: "1.0.0" },
        log_session: { seq: 1 },
        user: { id: 42 },
        telegram: { chat: { id: 42 } },
      },
    ]);
  });
});
