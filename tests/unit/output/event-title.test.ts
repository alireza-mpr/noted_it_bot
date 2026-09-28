import { describe, expect, it } from "vitest";
import { calendarFileOf } from "../../../src/output/calendar-file";
import { captionOf } from "../../../src/output/caption";
import { eventTitleOf } from "../../../src/output/event-title";
import { googleCalendarLinkOf } from "../../../src/output/google-calendar-link";
import { calendarEventWith } from "./calendar-event-with";

const UNTITLED_EVENT = calendarEventWith({ title: null });

describe("eventTitleOf", () => {
  it("keeps the title from the message", () => {
    expect(eventTitleOf(calendarEventWith({ title: "Game night" }), "fa")).toBe("Game night");
  });

  it("says Event in the reply language when the message gives no name", () => {
    expect(eventTitleOf(UNTITLED_EVENT, "en")).toBe("Event");
    expect(eventTitleOf(UNTITLED_EVENT, "fa")).toBe("رویداد");
  });

  it("gives the same title to the caption, the calendar file and the link", () => {
    expect(captionOf(UNTITLED_EVENT, "fa", null)).toContain("📌 رویداد");
    expect(calendarFileOf(UNTITLED_EVENT, "fa", new Date()).content).toContain("SUMMARY:رویداد");
    expect(new URL(googleCalendarLinkOf(UNTITLED_EVENT, "fa")).searchParams.get("text")).toBe("رویداد");
  });
});
