import { describe, expect, it } from "vitest";
import { describeModelFailure, timeoutFailureOf } from "../../../../src/adapters/models/model-result";

describe("describeModelFailure", () => {
  it("names the limit window of a rate limit", () => {
    expect(
      describeModelFailure({
        ok: false,
        kind: "rate-limited",
        limitWindow: "day",
        retryAfterSeconds: null,
        httpStatus: 429,
        detail: "quota",
      }),
    ).toBe("rate limited (day limit)");
  });

  it("names the retry time of a rate limit without a window", () => {
    expect(
      describeModelFailure({
        ok: false,
        kind: "rate-limited",
        limitWindow: null,
        retryAfterSeconds: 2,
        httpStatus: 429,
        detail: "quota",
      }),
    ).toBe("rate limited (retry after 2s)");
  });

  it("names the kind, the HTTP status and the detail of any other failure", () => {
    expect(describeModelFailure({ ok: false, kind: "unavailable", httpStatus: 503, detail: "busy" })).toBe(
      "unavailable (HTTP 503): busy",
    );
    expect(describeModelFailure({ ok: false, kind: "unavailable", httpStatus: null, detail: "no answer within 12s" })).toBe(
      "unavailable (HTTP n/a): no answer within 12s",
    );
  });
});

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
