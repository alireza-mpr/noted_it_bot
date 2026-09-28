import { describe, expect, it } from "vitest";
import { formatTimeSpan, formatTimeUntil } from "../../../../src/generic/intl/localized-time-span";

const NOW = new Date("2026-09-28T10:00:00Z");
const minutesLater = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe("formatTimeSpan", () => {
  it("writes a span of time in the language", () => {
    expect(formatTimeSpan(3, "day", "en")).toBe("3 days");
    expect(formatTimeSpan(3, "day", "fa")).toBe("۳ روز");
  });
});

describe("formatTimeUntil", () => {
  it("writes hours and minutes in the language", () => {
    expect(formatTimeUntil(NOW, minutesLater(125), "en")).toBe("2 hours, 5 minutes");
    expect(formatTimeUntil(NOW, minutesLater(125), "fa")).toMatch(/^۲ ساعت.*۵ دقیقه$/);
  });

  it("leaves out zero minutes, but not a time under an hour", () => {
    expect(formatTimeUntil(NOW, minutesLater(120), "en")).toBe("2 hours");
    expect(formatTimeUntil(NOW, minutesLater(5), "en")).toBe("5 minutes");
  });

  it("rounds up to the next minute, and never goes below zero", () => {
    expect(formatTimeUntil(NOW, new Date(NOW.getTime() + 1_000), "en")).toBe("1 minute");
    expect(formatTimeUntil(NOW, minutesLater(-3), "en")).toBe("0 minutes");
  });
});
