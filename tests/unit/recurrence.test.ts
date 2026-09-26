import { describe, expect, it } from "vitest";
import { buildCalendarEvent } from "../../src/lib/extractedEvents/calendarEvent";
import {
  describeRecurrence,
  recurrenceProblem,
} from "../../src/lib/extractedEvents/recurrence";
import type {
  ExtractedEvent,
  Recurrence,
} from "../../src/lib/extractedEvents/extractedEvent";

// Fixed "now": Monday 21 Sep 2026, 12:00 Melbourne (AEST, UTC+10).
const MON_NOON = new Date("2026-09-21T02:00:00Z");
// Thursday 24 Sep 2026, 17:00 and 20:00 Melbourne.
const THU_5PM = new Date("2026-09-24T07:00:00Z");
const THU_8PM = new Date("2026-09-24T10:00:00Z");

function rec(overrides: Partial<Recurrence> = {}): Recurrence {
  return {
    frequency: "weekly",
    interval: 1,
    weekdays: ["TH"],
    ordinal: null,
    month_day: null,
    end_kind: "never",
    until_year: null,
    until_month: null,
    until_day: null,
    count: null,
    ...overrides,
  };
}

// A weekly Thursday 19:30 pattern with no stated start date, by default.
function event(overrides: Partial<ExtractedEvent> = {}): ExtractedEvent {
  return {
    title: "Shahnameh reading",
    calendar: "gregorian",
    date_kind: "weekday",
    year: null,
    month: null,
    day: null,
    start_time: "19:30",
    end_time: null,
    timezone_hint: "Australia/Melbourne",
    location: null,
    recurrence: rec(),
    confidence: 0.95,
    ...overrides,
  };
}

// Stated start date of 24 Sep 2026 (a Thursday).
const dated = { date_kind: "absolute" as const, year: 2026, month: 9, day: 24 };

function build(e: ExtractedEvent, now = MON_NOON) {
  const built = buildCalendarEvent(e, "uid@test", "en", now);
  expect(built).not.toBeNull();
  return built!;
}

describe("recurring events: first occurrence", () => {
  it("weekday-only pattern starts on the next matching day from today", () => {
    const built = build(event());
    expect(built.icsContent).toContain(
      "DTSTART;TZID=Australia/Melbourne:20260924T193000",
    );
    expect(built.icsContent).toContain(
      "DTEND;TZID=Australia/Melbourne:20260924T203000",
    );
    expect(built.icsContent).toContain("RRULE:FREQ=WEEKLY;BYDAY=TH");
  });

  it("counts today if the event hasn't started yet", () => {
    expect(build(event(), THU_5PM).icsContent).toContain(
      "DTSTART;TZID=Australia/Melbourne:20260924T193000",
    );
  });

  it("skips to next week if today's occurrence has already started", () => {
    expect(build(event(), THU_8PM).icsContent).toContain(
      "DTSTART;TZID=Australia/Melbourne:20261001T193000",
    );
  });

  it("moves a stated start date that doesn't fit the pattern to the next date that does", () => {
    // 26 Sep 2026 is a Saturday; the pattern is Thursdays.
    const built = build(event({ ...dated, day: 26 }));
    expect(built.icsContent).toContain(
      "DTSTART;TZID=Australia/Melbourne:20261001T193000",
    );
  });

  it("monthly on an ordinal weekday finds the next matching month", () => {
    // 5 Dec 2026 is a Saturday, so the first Friday on/after it is 1 Jan 2027.
    const built = build(
      event({
        ...dated,
        month: 12,
        day: 5,
        recurrence: rec({ frequency: "monthly", weekdays: ["FR"], ordinal: 1 }),
      }),
    );
    expect(built.icsContent).toContain(
      "DTSTART;TZID=Australia/Melbourne:20270101T193000",
    );
    expect(built.icsContent).toContain("RRULE:FREQ=MONTHLY;BYDAY=1FR");
  });

  it("monthly on a day of the month, with no stated start", () => {
    const built = build(
      event({
        recurrence: rec({
          frequency: "monthly",
          weekdays: null,
          month_day: 15,
        }),
      }),
    );
    expect(built.icsContent).toContain(
      "DTSTART;TZID=Australia/Melbourne:20261015T193000",
    );
    expect(built.icsContent).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=15");
  });
});

describe("recurring events: rule and end condition", () => {
  it("open-ended series has neither UNTIL nor COUNT", () => {
    const rrule = build(event())
      .icsContent.split("\r\n")
      .find((l) => l.startsWith("RRULE:"))!;
    expect(rrule).not.toMatch(/UNTIL|COUNT/);
  });

  it("interval and count", () => {
    const built = build(
      event({ recurrence: rec({ interval: 2, end_kind: "count", count: 6 }) }),
    );
    expect(built.icsContent).toContain(
      "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;COUNT=6",
    );
  });

  it("timed series ends at the close of the last day, in UTC, with the year inferred", () => {
    // 29 Nov 2026 23:59 in Melbourne (AEDT, UTC+11) = 12:59 UTC.
    const built = build(
      event({
        ...dated,
        recurrence: rec({ end_kind: "until", until_month: 11, until_day: 29 }),
      }),
    );
    expect(built.icsContent).toContain("UNTIL=20261129T125900Z");
    expect(built.recurrence?.untilLabel).toContain("2026");
  });

  it("an end month earlier than the start rolls into the next year", () => {
    const built = build(
      event({
        ...dated,
        recurrence: rec({ end_kind: "until", until_month: 3, until_day: 1 }),
      }),
    );
    expect(built.icsContent).toContain("UNTIL=20270301T");
  });

  it("all-day series uses plain dates", () => {
    const built = build(
      event({
        ...dated,
        start_time: null,
        recurrence: rec({ end_kind: "until", until_month: 11, until_day: 29 }),
      }),
    );
    expect(built.allDay).toBe(true);
    expect(built.icsContent).toContain("DTSTART;VALUE=DATE:20260924");
    expect(built.icsContent).toContain("UNTIL=20261129");
    expect(built.icsContent).not.toContain("UNTIL=20261129T");
  });

  it("passes the rule to the Google link", () => {
    const url = new URL(build(event()).googleCalendarUrl);
    expect(url.searchParams.get("recur")).toBe("RRULE:FREQ=WEEKLY;BYDAY=TH");
  });

  it("keeps the same UID, so re-forwarding updates the series", () => {
    expect(build(event()).icsContent).toContain("UID:uid@test");
  });
});

describe("one-off events are unchanged", () => {
  it("has no RRULE and no recur parameter", () => {
    const built = build(event({ ...dated, recurrence: null }));
    expect(built.icsContent).not.toContain("RRULE");
    expect(new URL(built.googleCalendarUrl).searchParams.has("recur")).toBe(
      false,
    );
    expect(built.recurrence).toBeNull();
  });

  it("a weekday pattern without recurrence still builds nothing", () => {
    expect(
      buildCalendarEvent(event({ recurrence: null }), "u", "en", MON_NOON),
    ).toBeNull();
  });
});

describe("recurrenceProblem (decline conditions)", () => {
  it("is null for a valid recurring event and for a one-off", () => {
    expect(recurrenceProblem(event(), MON_NOON)).toBeNull();
    expect(
      recurrenceProblem(event({ ...dated, recurrence: null }), MON_NOON),
    ).toBeNull();
  });

  it("declines low confidence", () => {
    expect(recurrenceProblem(event({ confidence: 0.5 }), MON_NOON)).toMatch(
      /low confidence/,
    );
  });

  it("declines a pattern with no start date that doesn't say which days", () => {
    expect(
      recurrenceProblem(
        event({ recurrence: rec({ weekdays: null }) }),
        MON_NOON,
      ),
    ).not.toBeNull();
  });

  it("declines an invalid interval", () => {
    expect(
      recurrenceProblem(event({ recurrence: rec({ interval: 0 }) }), MON_NOON),
    ).not.toBeNull();
  });

  it("declines an end date before the first occurrence", () => {
    const e = event({
      ...dated,
      recurrence: rec({
        end_kind: "until",
        until_year: 2026,
        until_month: 9,
        until_day: 1,
      }),
    });
    expect(recurrenceProblem(e, MON_NOON)).toMatch(/before the first/);
  });

  it("declines a monthly weekday pattern with no ordinal", () => {
    const e = event({
      recurrence: rec({
        frequency: "monthly",
        weekdays: ["FR"],
        ordinal: null,
      }),
    });
    expect(recurrenceProblem(e, MON_NOON)).not.toBeNull();
  });

  it("buildCalendarEvent builds nothing for a declined pattern", () => {
    expect(
      buildCalendarEvent(event({ confidence: 0.5 }), "u", "en", MON_NOON),
    ).toBeNull();
  });
});

describe("describeRecurrence (English template, translated later)", () => {
  it("weekly on a weekday", () => {
    expect(describeRecurrence(rec())).toBe("Repeats every Thursday");
  });

  it("multiple weekdays, interval and until", () => {
    expect(
      describeRecurrence(
        rec({ interval: 2, weekdays: ["MO", "WE"], end_kind: "until" }),
      ),
    ).toBe("Repeats every 2 weeks on Monday and Wednesday, until {0}");
  });

  it("monthly ordinal weekday and count", () => {
    expect(
      describeRecurrence(
        rec({
          frequency: "monthly",
          weekdays: ["FR"],
          ordinal: 1,
          end_kind: "count",
          count: 4,
        }),
      ),
    ).toBe("Repeats on the first Friday of every month, 4 times");
  });

  it("monthly day of the month", () => {
    expect(
      describeRecurrence(
        rec({ frequency: "monthly", weekdays: null, month_day: 22 }),
      ),
    ).toBe("Repeats on the 22nd of every month");
  });
});
