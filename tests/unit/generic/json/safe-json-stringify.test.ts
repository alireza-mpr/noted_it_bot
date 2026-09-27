import { describe, expect, it } from "vitest";
import { safeJsonStringify } from "../../../../src/generic/json/safe-json-stringify";

describe("safeJsonStringify", () => {
  it("returns the JSON text of a value", () => {
    expect(safeJsonStringify({ userId: 42 })).toBe('{"userId":42}');
  });

  it("returns plain text when the value has no JSON form", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;

    expect(safeJsonStringify(undefined)).toBe("undefined");
    expect(safeJsonStringify(10n)).toBe("10");
    expect(safeJsonStringify(cycle)).toBe("[object Object]");
  });
});
