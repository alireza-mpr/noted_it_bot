import type { ExtractedEvent } from "../../../src/lib/extractedEvents/extractedEvent";

// A forwarded Persian message: a radio programme on Wednesday 1 Mehr 1405
// (= 23 Sep 2026), "every night at 20:00 Iran time", with a rerun at 21:30.
export const PERSIAN_RADIO_MESSAGE = `📻 پادکست برنامه جام جهان‌نما، چهارشنبه ۱ مهر ۱۴۰۵
 
این برنامه رادیویی را می‌توانید هر شب ساعت ۲۰ به وقت ایران، روی موج متوسط ۷۰۲ کیلوهرتز و موج کوتاه ۹۴۶۵ کیلوهرتز بشنوید.
تکرار برنامه را هم می‌توانید ساعت ۲۱:۳۰ روی موج متوسط ۷۰۲ کیلوهرتز و موج کوتاه ۵۳۹۵ کیلوهرتز گوش کنید.`;

// What gemini-3.1-flash-lite returned for that message with our prompt and
// schema (2026-09-26): the Gregorian date, the stated 20:00 and Asia/Tehran,
// and a daily repeat. Only the fields below were recorded from the response;
// `title`, `location` and the unused recurrence fields (null/never) are filled
// in by hand, so this is not a byte-for-byte capture.
export const GEMINI_3_1_FLASH_LITE_RADIO_EVENT: ExtractedEvent = {
  title: "جام جهان‌نما",
  calendar: "gregorian",
  date_kind: "absolute",
  year: 2026,
  month: 9,
  day: 23,
  start_time: "20:00",
  end_time: null,
  timezone_hint: "Asia/Tehran",
  location: null,
  recurrence: {
    frequency: "daily",
    interval: 1,
    weekdays: null,
    ordinal: null,
    month_day: null,
    end_kind: "never",
    until_year: null,
    until_month: null,
    until_day: null,
    count: null,
  },
  confidence: 0.9,
};

// What gemini-3.5-flash-lite returned in some runs for the same message: the
// Jalali date copied as written (1 Mehr 1405) and labelled "persian", with the
// stated 20:00 and a daily repeat. Same hand-filled fields as above.
export const GEMINI_3_5_FLASH_LITE_JALALI_RADIO_EVENT: ExtractedEvent = {
  ...GEMINI_3_1_FLASH_LITE_RADIO_EVENT,
  calendar: "persian",
  year: 1405,
  month: 7,
  day: 1,
};
