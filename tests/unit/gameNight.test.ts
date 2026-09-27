import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Router } from "../../src/legacy/router/router";
import { eventMessageHandler } from "../../src/legacy/telegram/messageHandlers/eventMessageHandler";
import { Replier } from "../../src/legacy/telegram/replier";
import type { TelegramClient } from "../../src/legacy/telegram/telegramClient";
import { translateStatic } from "../../src/legacy/translation/translate";

// The message as a user forwarded it on Sunday 27 September 2026.
const MESSAGE =
  "🎲 گیم‌نایت شنبه ۲۶ سپتامبر\n\n در\n Notting Hill Neighbourhood House \n\nبا بوردگیم، بازی‌های گروهی و فضای بازی برای بچه‌ها.\n\n🕕 ساعت ۶:۰۰ تا ۹:۳۰ شب\n\nبرای این برنامه فعلاً فقط سالن اصلی با ظرفیت حدود ۴۰ نفر رزرو شده.\n\nتا سه‌شنبه ۲۲ سپتامبر بر اساس تعداد ثبت‌نام‌های قطعی تصمیم می‌گیریم که برنامه فقط در سالن اصلی برگزار بشه یا در صورت بیشتر بودن تعداد شرکت‌کننده‌ها، دو اتاق جانبی رو هم به رزرو اضافه کنیم.\n\nاگر قصد شرکت دارید، لطفاً ثبت‌نامتون رو تا سه‌شنبه قطعی کنید تا بتونیم فضای مناسب رو بر اساس تعداد نهایی هماهنگ کنیم.\n\n💰 هزینه ثبت‌نام:\n برای افراد بالای ۵ سال، ۸ دلار\n\n🍽 سفارش شام از منوی \nDoner House\n\n💳 واریز هزینه ثبت‌نام و شام به PayID:\n\n0435015839\n\nممنون از همراهی‌تون 🌿";

// The provider's answer to it, exactly as returned (before the weekday field existed).
const PROVIDER_RESPONSE =
  '{"title":"گیم‌نایت","calendar":"Gregorian","date_kind":"absolute","year":null,"month":9,"day":26,"start_time":"18:00","end_time":"21:30","timezone_hint":null,"location":"Notting Hill Neighbourhood House","recurrence":null,"confidence":1}';

// Runs the message through the handler with a router that answers `response`,
// as a Persian user with no /tz zone, and returns the .ics and caption sent.
async function send(response: string) {
  const router = {
    generate: async (request: { userPrompt: string }, onModelFound?: () => Promise<void>) => {
      expect(request.userPrompt).toBe(MESSAGE);
      await onModelFound?.();
      return { ok: true, model: "m", text: response, totalTokens: 1 };
    },
  } as unknown as Router;
  const documents: { content: string; caption: string }[] = [];
  const telegram = {
    sendMessage: async () => {},
    sendDocument: async (_chatId: number, _name: string, content: string, caption: string) =>
      void documents.push({ content, caption }),
  } as unknown as TelegramClient;

  await eventMessageHandler(MESSAGE, router, new Replier(telegram, 7, "fa"), 4, null);
  expect(documents).toHaveLength(1);
  return documents[0];
}

const fa = (id: Parameters<typeof translateStatic>[0]) => translateStatic(id, "fa");

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the game night message, forwarded on 27 September 2026", () => {
  it("with the exact provider response: 26 Sep 2026, not 2027, and says it has passed", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-27T02:00:00Z") });
    const { content, caption } = await send(PROVIDER_RESPONSE);

    // No zone in the message and none set with /tz, so floating 18:00, which a
    // Melbourne calendar shows as 18:00 on the 26th (not 04:00 on the 27th).
    // No year, no weekday, so this year.
    expect(content).toContain("DTSTART:20260926T180000");
    expect(content).toContain("DTEND:20260926T213000");
    expect(caption).toContain(fa("PAST_EVENT_NOTE"));
    expect(caption).toContain(fa("TZ_FLOATING_NOTE"));
    expect(caption).not.toContain("🤔 ");
  });

  it("with the weekday the model now returns (SA): the same date, and no mismatch", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-27T02:00:00Z") });
    const withWeekday = PROVIDER_RESPONSE.replace('"day":26,', '"day":26,"weekday":"SA",');
    const { content, caption } = await send(withWeekday);

    expect(content).toContain("DTSTART:20260926T180000");
    expect(caption).toContain(fa("PAST_EVENT_NOTE"));
    expect(caption).not.toContain("🤔 ");
  });

  it("a week before, it's a future event with no past-date note", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-19T02:00:00Z") });
    const { content, caption } = await send(PROVIDER_RESPONSE);

    expect(content).toContain("DTSTART:20260926T180000");
    expect(caption).not.toContain(fa("PAST_EVENT_NOTE"));
  });
});
