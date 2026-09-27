import { describe, expect, it } from "vitest";
import {
  wrongGuessNotesOfOneOffEvent,
  wrongGuessNotesOfRepeatingEvent,
} from "../../../../src/domain/calendar-event/wrong-guess-rule";

// 20 Jan 2026 is a Tuesday.
const TUE_JAN_20_2026 = { year: 2026, month: 1, day: 20 };

describe("wrongGuessNotesOfOneOffEvent", () => {
  it("keeps a written weekday that does not match the date", () => {
    expect(wrongGuessNotesOfOneOffEvent("MO", TUE_JAN_20_2026, TUE_JAN_20_2026).wrongWeekday).toBe("MO");
  });

  it("has no wrong weekday when it matches, or when none is written", () => {
    expect(wrongGuessNotesOfOneOffEvent("TU", TUE_JAN_20_2026, TUE_JAN_20_2026).wrongWeekday).toBeNull();
    expect(wrongGuessNotesOfOneOffEvent(null, TUE_JAN_20_2026, TUE_JAN_20_2026).wrongWeekday).toBeNull();
  });

  it("is in the past only before today", () => {
    expect(wrongGuessNotesOfOneOffEvent(null, TUE_JAN_20_2026, { year: 2026, month: 1, day: 21 }).inPast).toBe(true);
    expect(wrongGuessNotesOfOneOffEvent(null, TUE_JAN_20_2026, TUE_JAN_20_2026).inPast).toBe(false);
  });
});

describe("wrongGuessNotesOfRepeatingEvent", () => {
  it("has no notes", () => {
    expect(wrongGuessNotesOfRepeatingEvent()).toEqual({ wrongWeekday: null, inPast: false });
  });
});
