import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1CountedModelUsageStore } from "../../../../src/adapters/database/d1-counted-model-usage-store";
import type { Model } from "../../../../src/adapters/models/model";
import type { ModelFailure } from "../../../../src/adapters/models/model-result";
import { timeZoneNamed } from "../../../../src/generic/date-time/time-zone";
import { modelAnswerOf } from "../models/model-answer-of";

const TEST_DB = (env as unknown as { TEST_DB: D1Database }).TEST_DB;
const LIMITS = { requestsPerMinute: 2, tokensPerMinute: 100, requestsPerDay: 3 };
const FIRST_MODEL: Model = { provider: "gcp.gemini", name: "first-model", limits: LIMITS };
const SECOND_MODEL: Model = { provider: "gcp.gemini", name: "second-model", limits: LIMITS };
const NOON_UTC = new Date("2026-09-28T12:00:00Z");
// 23:59 on 27 Sep 2026 in Los Angeles (PDT, UTC-7); a minute later, a new
// Pacific day starts.
const LAST_PACIFIC_MINUTE = new Date("2026-09-28T06:59:00Z");
const NEXT_PACIFIC_DAY = new Date("2026-09-28T07:00:00Z");

const secondsAfter = (moment: Date, seconds: number) => new Date(moment.getTime() + seconds * 1000);
const namesOf = (models: readonly Model[]) => models.map((model) => model.name);

function rateLimitedFor(limitWindow: "minute" | "day"): ModelFailure {
  return { ok: false, kind: "rate-limited", limitWindow, retryAfterSeconds: null, httpStatus: 429, detail: "quota" };
}

describe("D1CountedModelUsageStore", () => {
  let modelUsageStore: D1CountedModelUsageStore;

  beforeEach(async () => {
    await TEST_DB.exec("DROP TABLE IF EXISTS gemini_usage");
    modelUsageStore = new D1CountedModelUsageStore(
      TEST_DB,
      [FIRST_MODEL, SECOND_MODEL],
      timeZoneNamed("America/Los_Angeles"),
    );
  });

  it("offers every model, in order, before any use", async () => {
    expect(namesOf(await modelUsageStore.availableModels(NOON_UTC))).toEqual(["first-model", "second-model"]);
  });

  it("skips a model at its requests per minute, until the minute ends", async () => {
    await modelUsageStore.recordAnswer(modelAnswerOf(FIRST_MODEL), NOON_UTC);
    await modelUsageStore.recordAnswer(modelAnswerOf(FIRST_MODEL), secondsAfter(NOON_UTC, 1));

    expect(namesOf(await modelUsageStore.availableModels(secondsAfter(NOON_UTC, 30)))).toEqual(["second-model"]);
    expect(namesOf(await modelUsageStore.availableModels(secondsAfter(NOON_UTC, 60)))).toEqual([
      "first-model",
      "second-model",
    ]);
  });

  it("skips a model at its tokens per minute", async () => {
    await modelUsageStore.recordAnswer(modelAnswerOf(FIRST_MODEL, 100), NOON_UTC);

    expect(namesOf(await modelUsageStore.availableModels(secondsAfter(NOON_UTC, 30)))).toEqual(["second-model"]);
  });

  it("skips a model at its requests per day, until the Pacific day ends", async () => {
    for (const minutesBefore of [2, 1, 0]) {
      await modelUsageStore.recordAnswer(modelAnswerOf(FIRST_MODEL), secondsAfter(LAST_PACIFIC_MINUTE, -60 * minutesBefore));
    }

    expect(namesOf(await modelUsageStore.availableModels(secondsAfter(LAST_PACIFIC_MINUTE, 30)))).toEqual([
      "second-model",
    ]);
    expect(namesOf(await modelUsageStore.availableModels(NEXT_PACIFIC_DAY))).toContain("first-model");
  });

  it("treats a daily 429 as used up until the Pacific day ends", async () => {
    await modelUsageStore.recordFailure(FIRST_MODEL, rateLimitedFor("day"), secondsAfter(LAST_PACIFIC_MINUTE, -3600));

    expect(namesOf(await modelUsageStore.availableModels(LAST_PACIFIC_MINUTE))).toEqual(["second-model"]);
    expect(namesOf(await modelUsageStore.availableModels(NEXT_PACIFIC_DAY))).toContain("first-model");
  });

  it("treats any other 429 as used up until the minute ends", async () => {
    await modelUsageStore.recordFailure(FIRST_MODEL, rateLimitedFor("minute"), NOON_UTC);

    expect(namesOf(await modelUsageStore.availableModels(secondsAfter(NOON_UTC, 30)))).toEqual(["second-model"]);
    expect(namesOf(await modelUsageStore.availableModels(secondsAfter(NOON_UTC, 60)))).toContain("first-model");
  });

  it("stores any other failure as the last error, in Melbourne time, and keeps the model available", async () => {
    // 04:05:09 UTC is 14:05:09 in Melbourne (AEST, UTC+10).
    const failedAt = new Date("2026-09-28T04:05:09Z");
    await modelUsageStore.recordFailure(
      FIRST_MODEL,
      { ok: false, kind: "unavailable", httpStatus: 503, detail: "busy" },
      failedAt,
    );

    expect(
      await TEST_DB.prepare("SELECT lastError, lastErrorAest FROM gemini_usage WHERE model = ?").bind("first-model").first(),
    ).toEqual({ lastError: "unavailable (HTTP 503): busy", lastErrorAest: "2026-09-28 14:05:09" });
    expect(namesOf(await modelUsageStore.availableModels(failedAt))).toContain("first-model");
  });
});
