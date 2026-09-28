import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { showVersion } from "../../../../src/app/commands/show-version";
import { axiomEventsOf } from "../../adapters/logging/axiom-events-of";
import { FakeReplier } from "../fake-replier";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("showVersion", () => {
  it("replies with the running version, and logs the request", async () => {
    const fakeReplier = new FakeReplier();

    const logEvents = await axiomEventsOf(() => showVersion("0.2.41-beta-1a2b3c4", fakeReplier));

    expect(fakeReplier.texts).toEqual(["0.2.41-beta-1a2b3c4"]);
    expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual(["user_activity.version_requested"]);
  });
});
