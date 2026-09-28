import { describe, expect, it } from "vitest";
import { translate } from "../../../src/i18n/translation";
import { captionOf } from "../../../src/output/caption";
import { timeZoneNamed } from "../../../src/generic/date-time/time-zone";
import { calendarEventWith } from "./calendar-event-with";

const DAILY = { pattern: { frequency: "daily", interval: 1 }, end: { kind: "never" } } as const;

// Returns the English caption of an event with the given fields changed.
function englishCaptionOf(overrides: Parameters<typeof calendarEventWith>[0] = {}): string {
  return captionOf(calendarEventWith(overrides), "en", null);
}

describe("captionOf: the summary and the link", () => {
  it("starts with the title and the date and time", () => {
    const caption = englishCaptionOf({ title: "Game night" });
    expect(caption.startsWith("📌 Game night\n🗓️ Wed, Sep 23 8:00 PM–9:00 PM\n\n🔔 ")).toBe(true);
  });

  it("escapes HTML in the title", () => {
    expect(englishCaptionOf({ title: "<b>Tom & Jerry</b>" })).toContain("📌 &lt;b&gt;Tom &amp; Jerry&lt;/b&gt;");
  });

  it("links to Google Calendar, with & escaped in the link", () => {
    const caption = englishCaptionOf();
    expect(caption).toMatch(/<a href="https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&amp;text=Event&amp;/);
    expect(caption).toContain(">here</a>");
  });

  it("adds the repeat line and the repeat note for a repeating event", () => {
    const caption = englishCaptionOf({ repeat: DAILY });
    expect(caption).toContain("\n🔁 Repeats every day\n");
    expect(caption).toContain(translate("REPEAT_NOTE", "en"));
  });
});

describe("captionOf: the notes", () => {
  it("says when the written weekday does not match the date", () => {
    // 20 Jan 2030 is a Sunday.
    const caption = englishCaptionOf({ date: { year: 2030, month: 1, day: 20 }, wrongWeekday: "MO" });
    expect(caption).toContain("The message says Monday, but Jan 20, 2030 is a Sunday. Check the date.");
  });

  it("says when the date has passed, and only then", () => {
    expect(englishCaptionOf({ inPast: true })).toContain("this date has already passed");
    expect(englishCaptionOf()).not.toContain("this date has already passed");
  });

  it("says when the event is all day, with no time zone note", () => {
    const caption = englishCaptionOf({ time: { kind: "all-day" }, timeZone: { kind: "floating" } });
    expect(caption).toContain(translate("ALL_DAY_NOTE", "en"));
    expect(caption).not.toContain("🌎");
  });

  it("has no time zone note when the message gives the time zone", () => {
    expect(englishCaptionOf()).not.toContain("🌎");
  });

  it("names the user's time zone when it was used", () => {
    const caption = englishCaptionOf({ timeZone: { kind: "from-user", timeZone: timeZoneNamed("Europe/London") } });
    expect(caption).toContain("so I used yours, Europe/London. To change it, send /tz.");
  });

  it("explains floating times and points to /tz", () => {
    expect(englishCaptionOf({ timeZone: { kind: "floating" } })).toContain(
      "so the time is as written, in your calendar's own time zone. To set yours, send /tz.",
    );
  });
});

describe("captionOf: the quota line", () => {
  it("is left out when no quota is in use", () => {
    expect(englishCaptionOf()).not.toContain("🔢");
  });

  it("ends the caption with the remaining quota", () => {
    expect(captionOf(calendarEventWith(), "en", 4).endsWith("🔢 You have 4 remaining request(s) for today.")).toBe(true);
  });
});

describe("captionOf in Persian (the bugs from the screenshot)", () => {
  // The radio programme from the screenshot: every day at 20:00.
  const persianCaption = captionOf(calendarEventWith({ title: "برنامه جام جهان‌نما", repeat: DAILY }), "fa", 9974);

  it("writes the repeat line in Persian", () => {
    expect(persianCaption).toContain("\n🔁 هر روز تکرار می‌شود\n");
    expect(persianCaption).not.toContain("Repeats");
  });

  it("writes the quota number in Persian digits", () => {
    expect(persianCaption).toContain("۹٬۹۷۴");
    expect(persianCaption).not.toContain("9974");
  });

  it("has no Latin letters or digits in the summary", () => {
    const summary = persianCaption.split("\n\n")[0];
    expect(summary).not.toMatch(/[A-Za-z0-9]/);
  });

  it("names the weekdays of a wrong weekday in Persian, with the Gregorian date", () => {
    // 20 Jan 2030 is a Sunday.
    const caption = captionOf(calendarEventWith({ date: { year: 2030, month: 1, day: 20 }, wrongWeekday: "MO" }), "fa", null);

    expect(caption).toContain("دوشنبه");
    expect(caption).toContain("یکشنبه");
    expect(caption).toContain("۲۰۳۰");
  });
});
