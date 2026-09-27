import { describe, expect, it } from "vitest";
import { truncateText } from "../../../../src/generic/text/truncate-text";

describe("truncateText", () => {
  it("keeps a text that is not too long", () => {
    expect(truncateText("abc", 3)).toBe("abc");
  });

  it("cuts a long text, and says how many characters were cut", () => {
    expect(truncateText("abcdefghij", 3)).toBe("abc…[truncated 7 chars]");
  });
});
