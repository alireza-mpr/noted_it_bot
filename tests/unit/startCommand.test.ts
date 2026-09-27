import { beforeAll, describe, expect, it, vi } from "vitest";
import { appConfig } from "../../src/legacy/appConfig/appConfig";
import { startCommandHandler } from "../../src/legacy/telegram/commands/startCommandHandler";
import { Replier } from "../../src/legacy/telegram/replier";
import type { TelegramClient } from "../../src/legacy/telegram/telegramClient";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

async function startReply(lang: string, config = appConfig): Promise<string> {
  const sent: string[] = [];
  const telegram = { sendMessage: async (_chatId: number, text: string) => void sent.push(text) };
  await startCommandHandler(new Replier(telegram as unknown as TelegramClient, 7, lang), config);
  expect(sent).toHaveLength(1);
  return sent[0];
}

describe("/start", () => {
  it("ends with the daily quota from appConfig", async () => {
    const reply = await startReply("en", { ...appConfig, enforceUserDailyQuota: true, dailyQuota: 7 });
    expect(reply).toMatch(/^Heya! I am Noted bot/);
    expect(reply.endsWith("\n\n🎁 On the free plan, you can send up to 7 requests a day.")).toBe(true);
  });

  it("fills the quota into a translated note", async () => {
    const reply = await startReply("fa", { ...appConfig, enforceUserDailyQuota: true, dailyQuota: 5 });
    expect(reply).toContain("روزانه تا 5 درخواست");
  });

  it("leaves the note out when the quota is off", async () => {
    const reply = await startReply("en", { ...appConfig, enforceUserDailyQuota: false });
    expect(reply).not.toContain("🎁");
  });
});
