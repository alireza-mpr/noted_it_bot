export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
}

// Gemini occasionally returns 503 ("high demand") or 429 (rate limited) for
// requests that would otherwise succeed — retry those with backoff instead
// of failing the whole request on a transient blip.
export const GEMINI_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  retryableStatusCodes: [429, 503],
};

// "Full jitter" backoff (AWS Architecture Blog): delay is a random value
// between 0 and the exponential cap, which spreads out retries from many
// concurrent callers instead of having them all retry in lockstep.
export function computeBackoffDelayMs(
  attempt: number,
  config: RetryConfig,
  random: () => number = Math.random,
): number {
  const cap = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** attempt);
  return Math.round(random() * cap);
}

// Retries a fetch on retryable status codes with backoff+jitter between
// attempts. Returns the last response if every attempt is exhausted.
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  config: RetryConfig = GEMINI_RETRY_CONFIG,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Response> {
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(input, init);

    if (response.ok || !config.retryableStatusCodes.includes(response.status)) {
      return response;
    }
    if (attempt >= config.maxRetries) {
      return response;
    }
    await sleep(computeBackoffDelayMs(attempt, config));
  }
}
