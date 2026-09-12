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
      start_time: "17:00:00",
      end_time: "19:00:00",
      timezone_hint: "Australia/Melbourne",
      location: "Nunawading Community Hub | اتاق شماره دو",
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
