import { describe, expect, it } from "vitest";
import { formatNumber } from "../../../../src/generic/intl/localized-number";

describe("formatNumber", () => {
  it("writes the number in the language's digits", () => {
    expect(formatNumber(9974, "en")).toBe("9,974");
    expect(formatNumber(9974, "fa")).toBe("۹٬۹۷۴");
  });
});
