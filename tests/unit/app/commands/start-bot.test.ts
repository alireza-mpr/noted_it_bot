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
async function startReplyOf(firstName: string, language: SupportedLanguage): Promise<string> {
  const fakeReplier = new FakeReplier();
  await startBot(firstName, fakeReplier, language);
  expect(fakeReplier.texts).toHaveLength(1);
  return fakeReplier.texts[0];
}

describe("startBot", () => {
  it("greets the user by first name, gives an example to try, and points to /help", async () => {
    expect(await startReplyOf("Alice", "en")).toBe(
      [
        "Hi Alice! 👋 I'm Noted 😊",
        "",
        "📆 Forward me any message about an event (like a meeting or a get-together with friends), or just type it here, and I'll quickly turn it into a calendar event you can add with one tap.",
        "",
        '🚀 Try it now, e.g. send me "Dinner with Sam, 19 Sep, 8pm, Olive Tree Restaurant".',
        "💡 By the way, you can also try /help to see how I work, and all the other cool things I can do.",
      ].join("\n"),
    );
  });

  it("replies in the reply language, with a local example", async () => {
    const startReply = await startReplyOf("سارا", "fa");

    expect(startReply).toMatch(/^سلام سارا\. 👋 من ربات Noted هستم\. 😊/);
    expect(startReply).toContain("«شام با سارا، ۱۹ سپتامبر، ساعت ۸ شب»");
  });

  it("leaves the daily quota to /help", async () => {
    expect(await startReplyOf("Alice", "en")).not.toContain("🎁");
  });

  it("logs that the user started the bot", async () => {
    const logEvents = await axiomEventsOf(() => startReplyOf("Alice", "en"));

    expect(logEvents.map((logEvent) => logEvent.eventName)).toEqual(["user_activity.bot_started"]);
  });
});
