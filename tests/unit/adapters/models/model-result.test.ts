import { describe, expect, it } from "vitest";
import { timeoutFailureOf } from "../../../../src/adapters/models/model-result";

describe("timeoutFailureOf", () => {
  it("turns a timeout into an unavailable failure", () => {
    const timeoutError = new DOMException("The operation timed out.", "TimeoutError");

    expect(timeoutFailureOf(timeoutError, 12_000)).toEqual({
      ok: false,
      kind: "unavailable",
      httpStatus: null,
      detail: "no answer within 12s",
    });
  });

  it("gives null for any other error", () => {
    expect(timeoutFailureOf(new TypeError("fetch failed"), 12_000)).toBeNull();
    expect(timeoutFailureOf("plain", 12_000)).toBeNull();
  });
});
