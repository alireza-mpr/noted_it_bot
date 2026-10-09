import { env } from "cloudflare:test";
import { expect } from "vitest";
import { D1CountedModelUsageStore } from "../../src/adapters/database/d1-counted-model-usage-store";
import { D1RetryAfterModelUsageStore } from "../../src/adapters/database/d1-retry-after-model-usage-store";
import { extractDraft } from "../../src/adapters/models/extraction/extract-draft";
import { GeminiClient } from "../../src/adapters/models/providers/gemini-client";
import { GroqClient } from "../../src/adapters/models/providers/groq-client";
import { GEMINI_DAY_TIME_ZONE, GEMINI_MODELS, GROQ_MODELS } from "../../src/adapters/models/providers/model-list";
import { Router } from "../../src/adapters/models/router";
import type { Env } from "../../src/config/env";

// Live calls, with thinking, can take longer than vitest's 5 s default.
export const LIVE_TEST_TIMEOUT_MS = 60_000;

// Represents one live test case: a message, and the parts of the extraction
// result we expect. The match is partial (toMatchObject): fields left out
// (e.g. the title wording, the confidence) are not checked.
export type ExtractionCase = [messageText: string, expectedResult: object];

// Sends the message to the real models, and checks the parts of the result
// we expect. It calls the real Gemini API, and uses the dev quota.
export async function expectExtraction(messageText: string, expectedResult: object): Promise<void> {
  let firstTries = 0;
  const extractionResult = await extractDraft(liveRouter(), messageText, async () => {
    firstTries++;
  });

  expect(extractionResult).toMatchObject(expectedResult);
  // Once, just before the first model is tried, however many it takes.
  expect(firstTries).toBe(1);
}

// Returns a router with the real providers, which counts usage in the dev
// database, like the dev bot.
export function liveRouter(): Router {
  const testEnv = env as unknown as Pick<Env, "GEMINI_API_KEY" | "GROQ_API_KEY" | "USAGE_DB">;
  return new Router([
    {
      providerClient: new GeminiClient(testEnv.GEMINI_API_KEY),
      modelUsageStore: new D1CountedModelUsageStore(testEnv.USAGE_DB, GEMINI_MODELS, GEMINI_DAY_TIME_ZONE),
    },
    {
      providerClient: new GroqClient(testEnv.GROQ_API_KEY),
      modelUsageStore: new D1RetryAfterModelUsageStore(testEnv.USAGE_DB, GROQ_MODELS),
    },
  ]);
}
