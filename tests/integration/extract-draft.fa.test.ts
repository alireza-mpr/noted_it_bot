import { describe, expect, it } from "vitest";
import { expectExtraction, LIVE_TEST_TIMEOUT_MS, type ExtractionCase } from "./expect-extraction";

// A title in Persian script: the model must not translate it.
const PERSIAN_TITLE = expect.stringMatching(/[؀-ۿ]/);

// Persian messages, and the parts of the extraction result we expect.
const CASES: ExtractionCase[] = [
  [
    // "Tomorrow at 8pm: lunch at my mother-in-law's". A relative date writes
    // no calendar; Persian text does not make it Solar Hijri.
    "فردا ساعت ۸ شب: صرف نهار منزل مادرزن",
    {
      ok: true,
      draft: {
        writtenInCalendar: "gregory",
        date: { kind: "relative", relativeDate: { kind: "days-from-today", days: 1 } },
        time: { kind: "timed", start: { hour: 20, minute: 0 } },
        title: PERSIAN_TITLE,
      },
    },
  ],
  [
    // "Tonight dinner with Sara at 8".
    "امشب ساعت ۸ شام با سارا",
    {
      ok: true,
      draft: {
        date: { kind: "relative", relativeDate: { kind: "days-from-today", days: 0 } },
        time: { kind: "timed", start: { hour: 20, minute: 0 } },
        title: PERSIAN_TITLE,
      },
    },
  ],
  [
    // "At 1, Sadaf restaurant Melbourne, lunch with friends": a time with no
    // date. "Lunch" makes 1 mean 13:00.
    "ساعت ۱ \nرستوران صدف ملبورن\nنهار با دوستان",
    {
      ok: true,
      draft: {
        date: null,
        time: { kind: "timed", start: { hour: 13, minute: 0 } },
        timeZone: "Australia/Melbourne",
        repeat: null,
        title: PERSIAN_TITLE,
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
        date: { kind: "written", writtenDate: { year: null, month: 9, day: 27, weekday: "SU" } },
        time: { kind: "timed", start: { hour: 17, minute: 0 }, end: { hour: 19, minute: 0 } },
        // Nunawading is a Melbourne suburb, but the message never says
        // "Melbourne": some models place it, some play safe with null. Both
        // are fine for users, so which model answered must not fail this.
        timeZone: expect.toBeOneOf(["Australia/Melbourne", null]),
        title: PERSIAN_TITLE,
        location: "Nunawading Community Hub | اتاق شماره دو",
      },
    },
  ],
  [
    // A book review in Tehran: the streets (Karimkhan, Iranshahr) are only in
    // Tehran, but the message never names the city.
    `📚 نقد و بررسی کتاب «ایدئالیسم تحلیلی»

در این نشست، کتاب ایدئالیسم تحلیلی اثر برناردو کاستروپ با حضور مترجم کتاب بررسی خواهد شد.

🗓 یکشنبه ۵ مهر ۱۴۰۵ | ساعت ۱۸
📍 «فضای در عین حال»
خیابان کریمخان، ایرانشهر، سمندریان، پلاک ۳۱۲۳`,
    {
      ok: true,
      draft: {
        writtenInCalendar: "persian",
        // The weekday is not checked: models often leave it out here.
        date: { kind: "written", writtenDate: { year: 1405, month: 7, day: 5 } },
        time: { kind: "timed", start: { hour: 18, minute: 0 } },
        timeZone: "Asia/Tehran",
      },
    },
  ],
  [
    // No year, but the written weekday ("شنبه", Saturday) pins it. Notting
    // Hill is in London and in Melbourne, so it alone must not pick London;
    // the dollar price may point a model to Melbourne.
    "🎲 گیم‌نایت شنبه ۲۶ سپتامبر\n\n در\n Notting Hill Neighbourhood House \n\nبا بوردگیم، بازی‌های گروهی و فضای بازی برای بچه‌ها.\n\n🕕 ساعت ۶:۰۰ تا ۹:۳۰ شب\n\nبرای این برنامه فعلاً فقط سالن اصلی با ظرفیت حدود ۴۰ نفر رزرو شده.\n\nتا سه‌شنبه ۲۲ سپتامبر بر اساس تعداد ثبت‌نام‌های قطعی تصمیم می‌گیریم که برنامه فقط در سالن اصلی برگزار بشه یا در صورت بیشتر بودن تعداد شرکت‌کننده‌ها، دو اتاق جانبی رو هم به رزرو اضافه کنیم.\n\n💰 هزینه ثبت‌نام:\n برای افراد بالای ۵ سال، ۸ دلار",
    {
      ok: true,
      draft: {
        writtenInCalendar: "gregory",
        date: { kind: "written", writtenDate: { year: null, month: 9, day: 26, weekday: "SA" } },
        time: { kind: "timed", start: { hour: 18, minute: 0 }, end: { hour: 21, minute: 30 } },
        timeZone: expect.toBeOneOf(["Australia/Melbourne", null]),
        title: PERSIAN_TITLE,
        // An English place name in a Persian message stays in English.
        location: "Notting Hill Neighbourhood House",
      },
    },
  ],
  // Weekly sessions with no start date ("Shahnameh reading, Thursday nights
  // from 7:30pm"). The wording varies, but all mean: weekly on Thursday at
  // 19:30, never ending. The title's wording and the time zone are not
  // checked: the models vary on both. The title stays in Persian.
  ...[
    "جلسه هفتگی شاهنامه خوانی پنجشنبه شبها\nاز ساعت 7:30 شب",
    "جلسه هفتگی شاهنامه خوانی هر پنجشنبه\nاز ساعت 7:30 شب",
    "سلسله جلسات شاهنامه خوانی هر پنجشنبه شبها\nاز ساعت 7:30",
  ].map((messageText): ExtractionCase => [
    messageText,
    {
      ok: true,
      draft: {
        title: PERSIAN_TITLE,
        date: null,
        time: { kind: "timed", start: { hour: 19, minute: 30 } },
        repeat: { pattern: { frequency: "weekly", interval: 1, weekdays: ["TH"] }, end: { kind: "never" } },
      },
    },
  ]),
];

describe("extractDraft, with the real models: Persian messages", () => {
  it.each(CASES)("reads: %s", { timeout: LIVE_TEST_TIMEOUT_MS }, expectExtraction);
});
