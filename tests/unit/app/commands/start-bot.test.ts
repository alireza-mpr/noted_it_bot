import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startBot } from "../../../../src/app/commands/start-bot";
import type { SupportedLanguage } from "../../../../src/domain/user/supported-language";
import { axiomEventsOf } from "../../adapters/logging/axiom-events-of";
import { FakeReplier } from "../fake-replier";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Returns the one reply to /start.
async function startReplyOf(dailyQuota: number | null, language: SupportedLanguage): Promise<string> {
  const fakeReplier = new FakeReplier();
  await startBot(dailyQuota, fakeReplier, language);
  expect(fakeReplier.texts).toHaveLength(1);
  return fakeReplier.texts[0];
}

describe("startBot", () => {
  it("ends with the daily quota", async () => {
    const startReply = await startReplyOf(7, "en");

    expect(startReply).toMatch(/^Heya! I am Noted bot/);
    expect(startReply.endsWith("\n\n🎁 On the free plan, you can send up to 7 requests a day.")).toBe(true);
  });

  it("writes the daily quota in the reply language's digits", async () => {
    expect(await startReplyOf(5, "fa")).toContain("روزانه تا ۵ درخواست");
  });

  it("leaves the quota note out when the daily quota is off", async () => {
    expect(await startReplyOf(null, "en")).not.toContain("🎁");
  });

  it("logs that the user started the bot", async () => {
    const logEvents = await axiomEventsOf(() => startReplyOf(5, "en"));

    expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual(["user_activity.bot_started"]);
  });
});
