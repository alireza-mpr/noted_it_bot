import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { extractEvent, type Env } from "../src/index";
import type { ExtractedEvent } from "../src/interfaces/extracted_event";

// Each case is a message and the fields we expect back from extractEvent.
// Only list the fields you actually want to assert on — the match is partial
// (toMatchObject), so omitted fields (e.g. title wording, exact confidence)
// aren't checked. These hit the real Gemini API; add your own cases below.
const cases: [message: string, expected: Partial<ExtractedEvent>][] = [
  [
    "Let's catch up 19 Sep, 8pm at the usual cafe",
    {
      calendar: "gregorian",
      date_kind: "absolute",
      month: 9,
      day: 19,
      start_time: "20:00:00",
    },
  ],
  [
    "Thanks for coming to my party last night!",
    {
      date_kind: "none",
      year: null,
      month: null,
      day: null,
    },
  ],
  [
    "جلسه حضوری گفتگو با کتاب: کتاب "من تو ما "، با شهرام شاهی 

یکشنبه ۲۷ سپتامبر از ۵ تا ۷ عصر.

♦️محل برگزاری با فضای باز و سرپوشیده امن برای بچه ها : Nunawading Community Hub | اتاق شماره دو


در دورهمی های گفت‌وگو با کتاب، میهمانان تجربه زیسته خود را با کتاب هایی که معرفی و بررسی می کنند با ما در میان می نهند. 

کتاب «من تو ما» اثر یرواند آبراهامیان، پژوهشی تاریخی درباره من تو مای ۲۸ مرداد ۱۳۳۲ و سرنگونی دولت محمد مصدق است. آبراهامیان در این کتاب با تکیه بر اسناد تاریخی، نقش منافع نفتی، دولت‌های بریتانیا و آمریکا و تحولات سیاسی داخلی ایران را در شکل‌گیری و اجرای من تو ما بررسی می‌کند.

برای حضور حتما ثبت نام کنید و لطفا از ساعت ۴:۵۰ آنجا باشید.


این برنامه با حمایت استودیو سپیدسار برگزار می شود.",
    {
      date_kind: "none",
      year: null,
      month: null,
      day: null,
    },
  ],
];

describe("extractEvent", () => {
  it.each(cases)("extracts from: %s", async (message, expected) => {
    const downstream = await extractEvent(env as unknown as Env, message);
    expect(downstream.result).toBe("ok");

    const parsed = JSON.parse(downstream.message) as ExtractedEvent;
    expect(parsed).toMatchObject(expected);
  });
});
