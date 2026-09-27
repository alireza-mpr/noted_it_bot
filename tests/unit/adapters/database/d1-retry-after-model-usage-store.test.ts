import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1RetryAfterModelUsageStore } from "../../../../src/adapters/database/d1-retry-after-model-usage-store";
import type { Model } from "../../../../src/adapters/models/model";
import type { ModelFailure } from "../../../../src/adapters/models/model-result";
import { modelAnswerOf } from "../models/model-answer-of";

const TEST_DB = (env as unknown as { TEST_DB: D1Database }).TEST_DB;
const LIMITS = { requestsPerMinute: 30, tokensPerMinute: 8_000, requestsPerDay: 1_000 };
const FIRST_MODEL: Model = { provider: "groq", name: "first-model", limits: LIMITS };
const SECOND_MODEL: Model = { provider: "groq", name: "second-model", limits: LIMITS };
const NOW_MS = 1_800_000_000_000;

const at = (ms: number) => new Date(ms);
const namesOf = (models: readonly Model[]) => models.map((model) => model.name);

function rateLimitedWithRetryAfter(retryAfterSeconds: number | null): ModelFailure {
  return { ok: false, kind: "rate-limited", limitWindow: null, retryAfterSeconds, httpStatus: 429, detail: "slow down" };
}

// Returns the model's row as it is stored.
function storedRow(model: Model) {
  return TEST_DB.prepare("SELECT remainingRequests, limitRequests, lastError FROM groq_usage WHERE model = ?")
    .bind(model.name)
    .first();
}

describe("D1RetryAfterModelUsageStore", () => {
  let modelUsageStore: D1RetryAfterModelUsageStore;

  beforeEach(async () => {
    await TEST_DB.exec("DROP TABLE IF EXISTS groq_usage");
    modelUsageStore = new D1RetryAfterModelUsageStore(TEST_DB, [FIRST_MODEL, SECOND_MODEL]);
  });

  it("offers every model, in order, before any use", async () => {
    expect(namesOf(await modelUsageStore.availableModels(at(NOW_MS)))).toEqual(["first-model", "second-model"]);
  });

  it("skips a model until its retry-after has passed", async () => {
    await modelUsageStore.recordFailure(FIRST_MODEL, rateLimitedWithRetryAfter(5), at(NOW_MS));

    expect(namesOf(await modelUsageStore.availableModels(at(NOW_MS + 4_999)))).toEqual(["second-model"]);
    expect(namesOf(await modelUsageStore.availableModels(at(NOW_MS + 5_000)))).toEqual([
      "first-model",
      "second-model",
    ]);
  });

  it("waits 60 seconds when a 429 gives no retry-after", async () => {
    await modelUsageStore.recordFailure(FIRST_MODEL, rateLimitedWithRetryAfter(null), at(NOW_MS));

    expect(namesOf(await modelUsageStore.availableModels(at(NOW_MS + 59_999)))).toEqual(["second-model"]);
    expect(namesOf(await modelUsageStore.availableModels(at(NOW_MS + 60_000)))).toContain("first-model");
  });

  it("keeps the daily request count when a later answer reports none", async () => {
    await modelUsageStore.recordAnswer(
      { ...modelAnswerOf(FIRST_MODEL), dailyRequests: { remaining: 999, limit: 1000 } },
      at(NOW_MS),
    );
    await modelUsageStore.recordAnswer(modelAnswerOf(FIRST_MODEL), at(NOW_MS + 1));

    expect(await storedRow(FIRST_MODEL)).toMatchObject({ remainingRequests: 999, limitRequests: 1000 });
  });

  it("stores any other failure as the last error, and keeps the model available", async () => {
    await modelUsageStore.recordFailure(
      FIRST_MODEL,
      { ok: false, kind: "server-error", httpStatus: 500, detail: "oops" },
      at(NOW_MS),
    );

    expect(await storedRow(FIRST_MODEL)).toMatchObject({ lastError: "server-error (HTTP 500): oops" });
    expect(namesOf(await modelUsageStore.availableModels(at(NOW_MS)))).toContain("first-model");
  });
});
