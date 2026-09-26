import { describe, expect, it } from "vitest";
import { isGroqModelAvailable } from "../../src/repositories/groqUsageRepository";

const NOW = 1_000_000;

describe("isGroqModelAvailable", () => {
  it("offers a model that has no row yet", () => {
    expect(isGroqModelAvailable(undefined, NOW)).toBe(true);
  });

  it("offers a model that isn't waiting", () => {
    expect(isGroqModelAvailable({ retryAfterUntil: 0 }, NOW)).toBe(true);
  });

  it("skips a model until its retry-after has passed", () => {
    const waiting = { retryAfterUntil: NOW + 5_000 };

    expect(isGroqModelAvailable(waiting, NOW)).toBe(false);
    expect(isGroqModelAvailable(waiting, NOW + 4_999)).toBe(false);
    expect(isGroqModelAvailable(waiting, NOW + 5_000)).toBe(true);
  });
});
