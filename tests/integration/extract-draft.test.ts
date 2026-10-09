import { describe, expect, it } from "vitest";
import { extractDraft, type ExtractionResult } from "../../src/adapters/models/extraction/extract-draft";
import { expectExtraction, liveRouter, LIVE_TEST_TIMEOUT_MS, type ExtractionCase } from "./expect-extraction";

// English messages, and the parts of the extraction result we expect. The
// Persian ones are in extract-draft.fa.test.ts.
const CASES: ExtractionCase[] = [
  [
    // A relative date with no time: an all-day event.
    "Tonight dinner with Sam",
    {
      ok: true,
      draft: {
        date: { kind: "relative", relativeDate: { kind: "days-from-today", days: 0 } },
        time: { kind: "all-day" },
        repeat: null,
      },
    },
  ],
  [
    // A single event on a named weekday is a relative date, not a repeat.
    "Standup next Friday 10am",
    {
      ok: true,
      draft: {
        date: { kind: "relative", relativeDate: { kind: "weekday", weekday: "FR", week: "next" } },
        time: { kind: "timed", start: { hour: 10, minute: 0 } },
        repeat: null,
      },
    },
  ],
  [
    "Dinner with Sam on Friday at 7pm",
    {
      ok: true,
      draft: {
        date: { kind: "relative", relativeDate: { kind: "weekday", weekday: "FR", week: "this" } },
        time: { kind: "timed", start: { hour: 19, minute: 0 } },
        repeat: null,
      },
    },
  ],
  [
    // A relative date the bot does not read yet.
    "Brunch with Sam in two weeks",
    { ok: false, reason: "no-event" },
  ],
  [
    "Let's catch up 19 Sep, 8pm at the usual cafe",
    {
      ok: true,
      draft: {
        writtenInCalendar: "gregory",
        date: { kind: "written", writtenDate: { month: 9, day: 19 } },
        time: { kind: "timed", start: { hour: 20, minute: 0 } },
      },
    },
  ],
  [
    // A start date, weekly, and an end date without a year.
    "Book club every Sunday 5-7pm at the library, starting 27 Sep until 29 Nov",
    {
      ok: true,
      draft: {
        date: { kind: "written", writtenDate: { month: 9, day: 27 } },
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
        date: { kind: "written", writtenDate: { month: 10, day: 3 } },
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
        date: { kind: "written", writtenDate: { month: 12, day: 5 } },
        time: { kind: "timed", start: { hour: 19, minute: 0 } },
        repeat: {
          pattern: { frequency: "monthly", dayOfMonth: { kind: "weekday-of-month", week: 1, weekdays: ["FR"] } },
          end: { kind: "never" },
        },
      },
    },
  ],
  [
    // A list of separate dates is not a repeat.
    "Workshop on 27 Sep and again on 4 Oct, 10am",
    { ok: true, draft: { repeat: null } },
  ],
];

describe("extractDraft, with the real models", () => {
  it.each(CASES)("reads: %s", { timeout: LIVE_TEST_TIMEOUT_MS }, expectExtraction);

  it("finds no dated event in a message about the past", { timeout: LIVE_TEST_TIMEOUT_MS }, async () => {
    // "last night" is relative, so the model may answer date_kind "relative"
    // or "none". Either way, no date is read, so no calendar event is made.
    const extractionResult: ExtractionResult = await extractDraft(liveRouter(), "Thanks for coming to my party last night!");

    const readsNoDate = extractionResult.ok ? extractionResult.draft.date === null : extractionResult.reason === "no-event";
    expect(readsNoDate).toBe(true);
  });
});
