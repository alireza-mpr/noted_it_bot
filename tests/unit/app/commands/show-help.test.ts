import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { showHelp } from "../../../../src/app/commands/show-help";
import type { SupportedLanguage } from "../../../../src/domain/user/supported-language";
import { axiomEventsOf } from "../../adapters/logging/axiom-events-of";
import { FakeReplier } from "../fake-replier";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Returns the one reply to /help. A null unitsPerDay means the daily quota is
// off.
async function helpReplyOf(
  unitsPerDay: number | null,
  language: SupportedLanguage,
  isDailyQuotaShown = true,
): Promise<string> {
  const fakeReplier = new FakeReplier();
  await showHelp(
    unitsPerDay === null ? { kind: "off" } : { kind: "limited", unitsPerDay },
    isDailyQuotaShown,
    fakeReplier,
    language,
  );
  expect(fakeReplier.texts).toHaveLength(1);
  return fakeReplier.texts[0];
}

describe("showHelp", () => {
  it("shows how the bot works and what the user can set, and ends with the daily quota", async () => {
    const helpReply = await helpReplyOf(7, "en");

    expect(helpReply).toMatch(/^Here's how I work 👇/);
    expect(helpReply).toContain("/tz");
    expect(helpReply).toContain("/lang");
    expect(helpReply.endsWith("\n\n🎁 On the free plan, you can send up to 7 requests a day.")).toBe(true);
  });

  it("writes the daily quota in the reply language's digits", async () => {
    expect(await helpReplyOf(5, "fa")).toContain("روزانه تا ۵ درخواست");
  });

  it("leaves the quota note out when the daily quota is off", async () => {
    expect(await helpReplyOf(null, "en")).not.toContain("🎁");
  });

  it("leaves the quota note out when the daily quota is hidden", async () => {
    expect(await helpReplyOf(10, "en", false)).not.toContain("🎁");
  });

  it("logs that the user asked for help", async () => {
    const logEvents = await axiomEventsOf(() => helpReplyOf(5, "en"));

    expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual(["user_activity.help_requested"]);
  });
});
