import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "../../../../src/generic/encoding/base64-url";

describe("base64url", () => {
  it("writes bytes as URL-safe text with no padding, and reads them back", () => {
    const bytes = new Uint8Array([251, 255, 191, 0, 1]);
    const base64UrlText = toBase64Url(bytes);

    expect(base64UrlText).toBe("-_-_AAE");
    expect(fromBase64Url(base64UrlText)).toEqual(bytes);
  });

  it("gives null for text that is not base64url", () => {
    expect(fromBase64Url("a+b/c")).toBeNull();
    expect(fromBase64Url("abc=")).toBeNull();
    expect(fromBase64Url("a")).toBeNull();
  });
});
