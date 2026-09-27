import { describe, expect, it } from "vitest";
import { fillPlaceholders } from "../../../../src/generic/text/fill-placeholders";

describe("fillPlaceholders", () => {
  it("fills every placeholder with its value", () => {
    expect(fillPlaceholders("{0} says {1}, not {0}", ["Ali", "hi"])).toBe("Ali says hi, not Ali");
  });

  it("never searches an inserted value again", () => {
    expect(fillPlaceholders("{0} and {1}", ["{1}", "x"])).toBe("{1} and x");
  });

  it("keeps a placeholder that has no value", () => {
    expect(fillPlaceholders("{0} and {1}", ["a"])).toBe("a and {1}");
  });
});
