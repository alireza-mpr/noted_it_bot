import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { extractEvent } from "../../src/extractedEvents/extractEvent";
import { createRouter, type RouterEnv } from "../../src/router/router";
import type {
  ExtractedEvent,
  Recurrence,
} from "../../src/extractedEvents/extractedEvent";

// Partial is shallow, so allow a partial recurrence object too.
type Expected = Omit<Partial<ExtractedEvent>, "recurrence"> & {
  recurrence?: Partial<Recurrence> | null;
};

// Each case is a message and the fields we expect back from extractEvent.
// Only list the fields you actually want to assert on — the match is partial
// (toMatchObject), so omitted fields (e.g. title wording, exact confidence)
// aren't checked. These hit the real Gemini API; add your own cases below.
const cases: [message: string, expected: Expected][] = [
  [
    // A relative date writes no calendar at all; being Persian text doesn't make it Solar Hijri.
    "فردا ساعت ۸ شب: صرف نهار منزل مادرزن",
    {
      calendar: null,
      date_kind: "relative",
      year: null,
      month: null,
      day: null,
      start_time: "20:00",
    },
  ],
  [
    "Let's catch up 19 Sep, 8pm at the usual cafe",
    {
      calendar: "gregorian",
      date_kind: "absolute",
      month: 9,
      day: 19,
      start_time: "20:00",
    },
  ],
  [
    // "last night" is a relative reference, so this could reasonably come
    // back as date_kind "relative" or "none" — either way no absolute date
    // should be resolved, which is the part that actually matters (it means
    // no calendar event gets built).
    "Thanks for coming to my party last night!",
    {
      calendar: null,
      year: null,
      month: null,
      day: null,
    },
  ],
  [
    `جلسه حضوری گفتگو با کتاب: کتاب "من تو ما "، با شهرام شاهی

یکشنبه ۲۷ سپتامبر از ۵ تا ۷ عصر.

♦️محل برگزاری با فضای باز و سرپوشیده امن برای بچه ها : Nunawading Community Hub | اتاق شماره دو

در دورهمی های گفت‌وگو با کتاب، میهمانان تجربه زیسته خود را با کتاب هایی که معرفی و بررسی می کنند با ما در میان می نهند.

این برنامه با حمایت استودیو سپیدسار برگزار می شود.`,
    {
      calendar: "gregorian",
      date_kind: "absolute",
      year: null,
      month: 9,
      day: 27,
      weekday: "SU",
      start_time: "17:00",
      end_time: "19:00",
      // Nunawading is a Melbourne suburb, but the message never says
      // "Melbourne": gemini-3.1-flash-lite places it, gemini-3.5-flash-lite
      // plays safe with null. Both are fine for users (null falls back to their
      // /tz zone or UTC, with a note), so which model answered mustn't fail this.
      timezone_hint: expect.toBeOneOf(["Australia/Melbourne", null]),
      location: "Nunawading Community Hub | اتاق شماره دو",
    },
  ],
  [
    // No year, but the stated weekday ("شنبه", Saturday) pins it. The place
    // names no city, so the time zone isn't checked.
    "🎲 گیم‌نایت شنبه ۲۶ سپتامبر\n\n در\n Notting Hill Neighbourhood House \n\nبا بوردگیم، بازی‌های گروهی و فضای بازی برای بچه‌ها.\n\n🕕 ساعت ۶:۰۰ تا ۹:۳۰ شب\n\nبرای این برنامه فعلاً فقط سالن اصلی با ظرفیت حدود ۴۰ نفر رزرو شده.\n\nتا سه‌شنبه ۲۲ سپتامبر بر اساس تعداد ثبت‌نام‌های قطعی تصمیم می‌گیریم که برنامه فقط در سالن اصلی برگزار بشه یا در صورت بیشتر بودن تعداد شرکت‌کننده‌ها، دو اتاق جانبی رو هم به رزرو اضافه کنیم.\n\n💰 هزینه ثبت‌نام:\n برای افراد بالای ۵ سال، ۸ دلار",
    {
      calendar: "gregorian",
      date_kind: "absolute",
      year: null,
      month: 9,
      day: 26,
      weekday: "SA",
      start_time: "18:00",
      end_time: "21:30",
      location: "Notting Hill Neighbourhood House",
    },
  ],

  // --- recurrence ---
  [
    // Explicit start, weekly, end date without a year.
    "Book club every Sunday 5-7pm at the library, starting 27 Sep until 29 Nov",
    {
      date_kind: "absolute",
      month: 9,
      day: 27,
      start_time: "17:00",
      end_time: "19:00",
      recurrence: {
        frequency: "weekly",
        interval: 1,
        weekdays: ["SU"],
        end_kind: "until",
        until_year: null,
        until_month: 11,
        until_day: 29,
      },
    },
  ],
  [
    // No start date: a pattern only, and never ends.
    "Yoga every Tuesday at 6pm",
    {
      calendar: null,
      date_kind: "weekday",
      year: null,
      month: null,
      day: null,
      start_time: "18:00",
      recurrence: {
        frequency: "weekly",
        interval: 1,
        weekdays: ["TU"],
        end_kind: "never",
      },
    },
  ],
  [
    // Every 2 weeks, ends after a count.
    "Sprint retro every 2 weeks from 3 Oct, 2pm, 6 sessions",
    {
      date_kind: "absolute",
      month: 10,
      day: 3,
      start_time: "14:00",
      recurrence: {
        frequency: "weekly",
        interval: 2,
        end_kind: "count",
        count: 6,
      },
    },
  ],
  [
    // Monthly on an ordinal weekday.
    "Community meetup: first Friday of every month, 7pm, starting 5 Dec",
    {
      month: 12,
      day: 5,
      start_time: "19:00",
      recurrence: {
        frequency: "monthly",
        weekdays: ["FR"],
        ordinal: 1,
        end_kind: "never",
      },
    },
  ],
  // Persian weekly sessions with no start date. Wording varies (with/without
  // "every", "weekly", "series of sessions") but all mean: weekly on Thursday
  // at 19:30, never ends. Title and timezone_hint are deliberately not
  // asserted — the model varies on both (an unset timezone falls back to
  // Melbourne in code anyway).
  ...[
    "جلسه هفتگی شاهنامه خوانی پنجشنبه شبها\nاز ساعت 7:30 شب",
    "جلسه هفتگی شاهنامه خوانی هر پنجشنبه\nاز ساعت 7:30 شب",
    "سلسله جلسات شاهنامه خوانی هر پنجشنبه شبها\nاز ساعت 7:30",
  ].map((message): [string, Expected] => [
    message,
    {
      date_kind: "weekday",
      year: null,
      month: null,
      day: null,
      start_time: "19:30",
      recurrence: {
        frequency: "weekly",
        interval: 1,
        weekdays: ["TH"],
        end_kind: "never",
      },
    },
  ]),
  [
    // A list of separate dates is NOT a recurrence.
    "Workshop on 27 Sep and again on 4 Oct, 10am",
    { recurrence: null },
  ],
];

// Gemini isn't always consistent about including seconds ("17:00" vs
// "17:00:00") even at temperature 0 — normalize to "HH:MM" before comparing
// so the test isn't flaky on a distinction we don't care about.
function normalizeTime(time: string | null): string | null {
  return time?.slice(0, 5) ?? time;
}

describe("extractEvent", () => {
  // Live Gemini calls (with thinking) can take longer than vitest's 5s default.
  it.each(cases)(
    "extracts from: %s",
    { timeout: 60_000 },
    async (message, expected) => {
      let notified = 0;
      const extraction = await extractEvent(
        createRouter(env as unknown as RouterEnv),
        message,
        async () => {
          notified++;
        },
      );
      expect(extraction.ok).toBe(true);
      // Once, right before the first model is tried, however many it takes.
      expect(notified).toBe(1);

      const parsed = (extraction as { event: ExtractedEvent }).event;
      const normalized = {
        ...parsed,
        // The calendar is a free string; the code lowercases it, so does the test.
        calendar: parsed.calendar?.toLowerCase() ?? null,
        start_time: normalizeTime(parsed.start_time),
        end_time: normalizeTime(parsed.end_time),
      };
      expect(normalized).toMatchObject(expected);
    },
  );
});
