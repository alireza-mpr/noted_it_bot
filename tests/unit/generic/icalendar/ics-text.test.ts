import { describe, expect, it } from "vitest";
import { escapeIcsText, foldIcsLine } from "../../../../src/generic/icalendar/ics-text";

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma and newline", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });
});

describe("foldIcsLine", () => {
  const octetsOf = (text: string) => new TextEncoder().encode(text).length;
  const unfold = (folded: string) => folded.replace(/\r\n /g, "");

  it("keeps a line of 75 octets or less", () => {
    const line = `SUMMARY:${"a".repeat(67)}`;
    expect(foldIcsLine(line)).toBe(line);
  });

  it("folds a long line into lines of at most 75 octets, and unfolding gives it back", () => {
    const line = `SUMMARY:${"a".repeat(200)}`;
    const folded = foldIcsLine(line);
    expect(folded.split("\r\n").every((foldedLine) => octetsOf(foldedLine) <= 75)).toBe(true);
    expect(unfold(folded)).toBe(line);
  });

  it("never splits a character that takes several octets", () => {
    // Each Persian letter takes 2 octets in UTF-8.
    const line = `SUMMARY:${"جلسه شاهنامه خوانی ".repeat(10)}`;
    const folded = foldIcsLine(line);
    expect(folded).not.toContain("�");
    expect(folded.split("\r\n").every((foldedLine) => octetsOf(foldedLine) <= 75)).toBe(true);
    expect(unfold(folded)).toBe(line);
  });
});
