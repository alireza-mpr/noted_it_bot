import { vi } from "vitest";
import type { LogEvent } from "../../../../src/adapters/logging/log-event";
import { runLogSession } from "../../../../src/adapters/logging/log-session";
import { flatRecordOf } from "./flat-record-of";

// Returns the log events that a log session around run sends to Axiom, with
// their dotted names flat again (e.g. "user.id"). Stubs fetch: call
// vi.unstubAllGlobals() after each test.
export async function axiomEventsOf(run: () => unknown): Promise<LogEvent[]> {
  let axiomEvents: LogEvent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      axiomEvents = JSON.parse(init.body as string).map(flatRecordOf);
      return new Response("{}");
    }),
  );
  const pendingPromises: Promise<unknown>[] = [];
  await runLogSession(
    { AXIOM_TOKEN: "test-token", APP_VERSION: "1.2.3" },
    {
      waitUntil: (promise: Promise<unknown>) =>
        void pendingPromises.push(promise),
    },
    async () => {
      await run();
    },
  );
  await Promise.all(pendingPromises);
  return axiomEvents;
}
