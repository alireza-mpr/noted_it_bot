import { describe, expect, it } from "vitest";
import { eventUidOf } from "../../../../src/domain/calendar-event/event-uid-rule";

describe("eventUidOf", () => {
  it("gives the same UID for the same message, ignoring spaces around it", async () => {
    expect(await eventUidOf("  Game night, Sat 26 Sep\n")).toBe(await eventUidOf("Game night, Sat 26 Sep"));
  });

  it("gives different UIDs for different messages", async () => {
    expect(await eventUidOf("Game night, Sat 26 Sep")).not.toBe(await eventUidOf("Game night, Sat 3 Oct"));
  });

  it("is a SHA-256 hex hash with the bot's domain", async () => {
    expect(await eventUidOf("Game night")).toMatch(/^[0-9a-f]{64}@notedit$/);
  });
});
