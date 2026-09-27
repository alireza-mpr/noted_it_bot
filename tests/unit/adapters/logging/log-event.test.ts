import { describe, expect, it } from "vitest";
import { exceptionAttributesOf } from "../../../../src/adapters/logging/log-event";

describe("exceptionAttributesOf", () => {
  it("gives the type, message and stack trace of an Error", () => {
    const exceptionAttributes = exceptionAttributesOf(new TypeError("boom"));

    expect(exceptionAttributes).toMatchObject({
      "exception.type": "TypeError",
      "exception.message": "boom",
    });
    expect(String(exceptionAttributes["exception.stacktrace"])).toContain("TypeError: boom");
  });

  it("turns anything else into a message", () => {
    expect(exceptionAttributesOf("plain")).toEqual({ "exception.message": "plain" });
    expect(exceptionAttributesOf({ a: 1 })).toEqual({ "exception.message": "[object Object]" });
  });
});
