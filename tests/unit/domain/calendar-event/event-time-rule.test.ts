import { describe, expect, it } from "vitest";
import { eventTimeOf } from "../../../../src/domain/calendar-event/event-time-rule";

const EIGHT_PM = { hour: 20, minute: 0 };

describe("eventTimeOf", () => {
  it("makes an all-day event when the message states no start time", () => {
    expect(eventTimeOf(null, null)).toEqual({ kind: "all-day" });
    expect(eventTimeOf(null, EIGHT_PM)).toEqual({ kind: "all-day" });
  });

  it("keeps the start and end times the message states", () => {
    expect(eventTimeOf(EIGHT_PM, { hour: 21, minute: 30 })).toEqual({
      kind: "timed",
      start: EIGHT_PM,
      end: { hour: 21, minute: 30 },
    });
  });

  it("ends an hour later when the message states no end time", () => {
    expect(eventTimeOf(EIGHT_PM, null)).toEqual({ kind: "timed", start: EIGHT_PM, end: { hour: 21, minute: 0 } });
    expect(eventTimeOf({ hour: 23, minute: 30 }, null)).toMatchObject({ end: { hour: 0, minute: 30 } });
  });
});
