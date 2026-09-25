import { describe, expect, it, vi } from "vitest";
import { computeBackoffDelayMs, fetchWithRetry, type RetryConfig } from "../src/config/retry";

const CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  retryableStatusCodes: [429, 503],
};

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({ status }), { status });
}

describe("computeBackoffDelayMs", () => {
  it("scales the cap exponentially with attempt, capped at maxDelayMs", () => {
    // random() = 1 always picks the cap itself, isolating the exponential curve.
    const random = () => 1;
    expect(computeBackoffDelayMs(0, CONFIG, random)).toBe(500);
    expect(computeBackoffDelayMs(1, CONFIG, random)).toBe(1000);
    expect(computeBackoffDelayMs(2, CONFIG, random)).toBe(2000);
    expect(computeBackoffDelayMs(4, CONFIG, random)).toBe(8000); // 500*2^4=8000, at the cap
    expect(computeBackoffDelayMs(10, CONFIG, random)).toBe(8000); // would blow past cap uncapped
  });

  it("is a random value between 0 and the cap (full jitter)", () => {
    expect(computeBackoffDelayMs(2, CONFIG, () => 0)).toBe(0);
    expect(computeBackoffDelayMs(2, CONFIG, () => 0.5)).toBe(1000); // half of the 2000 cap
  });
});

describe("fetchWithRetry", () => {
  it("returns immediately on a successful response, without sleeping", async () => {
    const ok = jsonResponse(200);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry("https://example.test", {}, CONFIG, sleep);

    expect(response).toBe(ok);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not retry a non-retryable status", async () => {
    const badRequest = jsonResponse(400);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(badRequest));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry("https://example.test", {}, CONFIG, sleep);

    expect(response).toBe(badRequest);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("retries a retryable status up to maxRetries, then gives up", async () => {
    const overloaded = jsonResponse(503);
    const fetchMock = vi.fn().mockResolvedValue(overloaded);
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry("https://example.test", {}, CONFIG, sleep);

    expect(response).toBe(overloaded);
    expect(fetchMock).toHaveBeenCalledTimes(CONFIG.maxRetries + 1); // initial attempt + retries
    expect(sleep).toHaveBeenCalledTimes(CONFIG.maxRetries);
    vi.unstubAllGlobals();
  });

  it("stops retrying as soon as a later attempt succeeds", async () => {
    const overloaded = jsonResponse(503);
    const ok = jsonResponse(200);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(overloaded)
      .mockResolvedValueOnce(overloaded)
      .mockResolvedValueOnce(ok);
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry("https://example.test", {}, CONFIG, sleep);

    expect(response).toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
