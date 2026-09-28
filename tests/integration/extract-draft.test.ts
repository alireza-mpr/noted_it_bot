import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { D1CountedModelUsageStore } from "../../src/adapters/database/d1-counted-model-usage-store";
import { D1RetryAfterModelUsageStore } from "../../src/adapters/database/d1-retry-after-model-usage-store";
import { extractDraft, type ExtractionResult } from "../../src/adapters/models/extraction/extract-draft";
import { GeminiClient } from "../../src/adapters/models/providers/gemini-client";
import { GroqClient } from "../../src/adapters/models/providers/groq-client";
import { GEMINI_DAY_TIME_ZONE, GEMINI_MODELS, GROQ_MODELS } from "../../src/adapters/models/providers/model-list";
import { Router } from "../../src/adapters/models/router";
import type { Env } from "../../src/config/env";

// Each case is a message, and the parts of the extraction result we expect.
// The match is partial (toMatchObject): fields left out (e.g. the title
// wording, the confidence) are not checked. These call the real Gemini API,
// and use the dev quota.
const CASES: [messageText: string, expectedResult: object][] = [
  [
    // "Tomorrow at 8pm: lunch at my mother-in-law's". A relative date writes
    // no calendar; Persian text does not make it Solar Hijri.
    "فردا ساعت ۸ شب: صرف نهار منزل مادرزن",
    { ok: false, reason: "no-event", detail: "a relative date" },
  ],
  [
    "Let's catch up 19 Sep, 8pm at the usual cafe",
    {
      ok: true,
      draft: {
        writtenInCalendar: "gregory",
        date: { month: 9, day: 19 },
        time: { kind: "timed", start: { hour: 20, minute: 0 } },
      },
    },
  ],
  [
    `جلسه حضوری گفتگو با کتاب: کتاب "من تو ما "، با شهرام شاهی

یکشنبه ۲۷ سپتامبر از ۵ تا ۷ عصر.

♦️محل برگزاری با فضای باز و سرپوشیده امن برای بچه ها : Nunawading Community Hub | اتاق شماره دو

در دورهمی های گفت‌وگو با کتاب، میهمانان تجربه زیسته خود را با کتاب هایی که معرفی و بررسی می کنند با ما در میان می نهند.

این برنامه با حمایت استودیو سپیدسار برگزار می شود.`,
    {
      ok: true,
      draft: {
        writtenInCalendar: "gregory",
        date: { year: null, month: 9, day: 27, weekday: "SU" },
        time: { kind: "timed", start: { hour: 17, minute: 0 }, end: { hour: 19, minute: 0 } },
        // Nunawading is a Melbourne suburb, but the message never says
        // "Melbourne": some models place it, some play safe with null. Both
        // are fine for users, so which model answered must not fail this.
        timeZone: expect.toBeOneOf(["Australia/Melbourne", null]),
        location: "Nunawading Community Hub | اتاق شماره دو",
      },
    },
  ],
  [
    // No year, but the written weekday ("شنبه", Saturday) pins it. The place
    // names no city, so the time zone is not checked.
    "🎲 گیم‌نایت شنبه ۲۶ سپتامبر\n\n در\n Notting Hill Neighbourhood House \n\nبا بوردگیم، بازی‌های گروهی و فضای بازی برای بچه‌ها.\n\n🕕 ساعت ۶:۰۰ تا ۹:۳۰ شب\n\nبرای این برنامه فعلاً فقط سالن اصلی با ظرفیت حدود ۴۰ نفر رزرو شده.\n\nتا سه‌شنبه ۲۲ سپتامبر بر اساس تعداد ثبت‌نام‌های قطعی تصمیم می‌گیریم که برنامه فقط در سالن اصلی برگزار بشه یا در صورت بیشتر بودن تعداد شرکت‌کننده‌ها، دو اتاق جانبی رو هم به رزرو اضافه کنیم.\n\n💰 هزینه ثبت‌نام:\n برای افراد بالای ۵ سال، ۸ دلار",
    {
      ok: true,
      draft: {
        writtenInCalendar: "gregory",
        date: { year: null, month: 9, day: 26, weekday: "SA" },
        time: { kind: "timed", start: { hour: 18, minute: 0 }, end: { hour: 21, minute: 30 } },
        location: "Notting Hill Neighbourhood House",
      },
    },
  ],
  [
    // A start date, weekly, and an end date without a year.
    "Book club every Sunday 5-7pm at the library, starting 27 Sep until 29 Nov",
    {
      ok: true,
      draft: {
        date: { month: 9, day: 27 },
        time: { kind: "timed", start: { hour: 17, minute: 0 }, end: { hour: 19, minute: 0 } },
        repeat: {
          pattern: { frequency: "weekly", interval: 1, weekdays: ["SU"] },
          end: { kind: "until", date: { year: null, month: 11, day: 29 } },
        },
      },
    },
  ],
  [
    // No start date: a pattern only, and it never ends.
    "Yoga every Tuesday at 6pm",
    {
      ok: true,
      draft: {
        writtenInCalendar: "gregory",
        date: null,
        time: { kind: "timed", start: { hour: 18, minute: 0 } },
        repeat: { pattern: { frequency: "weekly", interval: 1, weekdays: ["TU"] }, end: { kind: "never" } },
      },
    },
  ],
  [
    // Every 2 weeks, ending after a number of times.
    "Sprint retro every 2 weeks from 3 Oct, 2pm, 6 sessions",
    {
      ok: true,
      draft: {
        date: { month: 10, day: 3 },
        time: { kind: "timed", start: { hour: 14, minute: 0 } },
        repeat: { pattern: { frequency: "weekly", interval: 2 }, end: { kind: "after", times: 6 } },
      },
    },
  ],
  [
    // Monthly on a weekday of a week.
    "Community meetup: first Friday of every month, 7pm, starting 5 Dec",
    {
      ok: true,
      draft: {
        date: { month: 12, day: 5 },
        time: { kind: "timed", start: { hour: 19, minute: 0 } },
        repeat: {
          pattern: { frequency: "monthly", dayOfMonth: { kind: "weekday-of-month", week: 1, weekdays: ["FR"] } },
          end: { kind: "never" },
        },
      },
    },
  ],
  // Persian weekly sessions with no start date ("Shahnameh reading, Thursday
  // nights from 7:30pm"). The wording varies, but all mean: weekly on
  // Thursday at 19:30, never ending. The title and the time zone are not
  // checked: the models vary on both.
  ...[
    "جلسه هفتگی شاهنامه خوانی پنجشنبه شبها\nاز ساعت 7:30 شب",
    "جلسه هفتگی شاهنامه خوانی هر پنجشنبه\nاز ساعت 7:30 شب",
    "سلسله جلسات شاهنامه خوانی هر پنجشنبه شبها\nاز ساعت 7:30",
  ].map((messageText): [string, object] => [
    messageText,
    {
      ok: true,
      draft: {
        date: null,
        time: { kind: "timed", start: { hour: 19, minute: 30 } },
        repeat: { pattern: { frequency: "weekly", interval: 1, weekdays: ["TH"] }, end: { kind: "never" } },
      },
    },
  ]),
  [
    // A list of separate dates is not a repeat.
    "Workshop on 27 Sep and again on 4 Oct, 10am",
    { ok: true, draft: { repeat: null } },
  ],
];

// Returns a router with the real providers, which counts usage in the dev
// database, like the dev bot.
function liveRouter(): Router {
  const testEnv = env as unknown as Pick<Env, "GEMINI_API_KEY" | "GROQ_API_KEY" | "USAGE_DB">;
  return new Router([
    {
      providerClient: new GeminiClient(testEnv.GEMINI_API_KEY),
      modelUsageStore: new D1CountedModelUsageStore(testEnv.USAGE_DB, GEMINI_MODELS, GEMINI_DAY_TIME_ZONE),
    },
    {
      providerClient: new GroqClient(testEnv.GROQ_API_KEY),
      modelUsageStore: new D1RetryAfterModelUsageStore(testEnv.USAGE_DB, GROQ_MODELS),
    },
  ]);
}

describe("extractDraft, with the real models", () => {
  // Live calls, with thinking, can take longer than vitest's 5 s default.
  it.each(CASES)("reads: %s", { timeout: 60_000 }, async (messageText, expectedResult) => {
    let firstTries = 0;
    const extractionResult = await extractDraft(liveRouter(), messageText, async () => {
      firstTries++;
    });

    expect(extractionResult).toMatchObject(expectedResult);
    // Once, just before the first model is tried, however many it takes.
    expect(firstTries).toBe(1);
  });

  it("finds no dated event in a message about the past", { timeout: 60_000 }, async () => {
    // "last night" is relative, so the model may answer date_kind "relative"
    // or "none". Either way, no date is read, so no calendar event is made.
    const extractionResult: ExtractionResult = await extractDraft(liveRouter(), "Thanks for coming to my party last night!");

    const readsNoDate = extractionResult.ok ? extractionResult.draft.date === null : extractionResult.reason === "no-event";
    expect(readsNoDate).toBe(true);
  });
});
