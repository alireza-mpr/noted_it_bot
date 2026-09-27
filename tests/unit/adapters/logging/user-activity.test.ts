import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setLogAttribute } from "../../../../src/adapters/logging/log-session";
import { logUserActivity } from "../../../../src/adapters/logging/user-activity";
import { axiomEventsOf } from "./axiom-events-of";

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("logUserActivity", () => {
  it("logs one event named after the activity, with its attributes and the session's", async () => {
    const logEvents = await axiomEventsOf(() => {
      setLogAttribute("user.id", 42);
      logUserActivity("time_zone_set", { "user_activity.via": "command" });
    });

    expect(logEvents).toEqual([
      expect.objectContaining({
        severityText: "INFO",
        eventName: "user_activity.time_zone_set",
        "scope.name": "user-activity",
        "user_activity.via": "command",
        "user.id": 42,
      }),
    ]);
  });
});
