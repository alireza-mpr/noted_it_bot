import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { D1CountedModelUsageStore } from "../../src/adapters/database/d1-counted-model-usage-store";
import type { Model } from "../../src/adapters/models/model";
import type { ModelFailure, ModelRequest, ModelResult } from "../../src/adapters/models/model-result";
import type { ProviderClient } from "../../src/adapters/models/provider-client";
import { GeminiClient } from "../../src/adapters/models/providers/gemini-client";
import { GEMINI_DAY_TIME_ZONE, GEMINI_MODELS } from "../../src/adapters/models/providers/model-list";
import { Router } from "../../src/adapters/models/router";
import type { Env } from "../../src/config/env";

// Not part of `npm test` or CI: it burns through quota on purpose. Run it on
// demand with `npm run test:quota-fill`.
//
// It sends the same small prompt through the real Router, against the real
// Gemini API and the real dev D1 usage table. The calls start 50 to 200 ms
// apart, without waiting for each other. Many calls read the usage counts
// before earlier ones have recorded their use, so they pick the same first
// model, and most get a real 429 back. It checks that the Router recovers by
// moving on to the next model instead of failing.
//
// With enough calls, every model fills up. Calls that then find no model left
// may fail as rate-limited or unavailable. Any other failure, or a wrong
// reply, is a bug. The number of calls is QUOTA_FILL_CALLS: 100 by default,
// e.g. `QUOTA_FILL_CALLS=150 npm run test:quota-fill` for more.

// The failures that running out of models looks like, not a bug.
const EXHAUSTED_FAILURE_KINDS: readonly ModelFailure["kind"][] = ["rate-limited", "unavailable"];
const PING_REQUEST: ModelRequest = {
  systemPrompt: null,
  userPrompt: "Reply with Pong nothing else",
  responseSchema: null,
};
const MIN_GAP_MS = 50;
const MAX_GAP_MS = 200;

// Represents one try of one model, within one call.
interface ModelTry {
  callNumber: number;
  modelName: string;
  outcome: string;
}

// Represents a provider client that passes each call to the real client, and
// records every try, also the ones the Router recovers from, so the run shows
// where it moved on.
class RecordingClient implements ProviderClient {
  constructor(
    private readonly providerClient: ProviderClient,
    private readonly callNumber: number,
    private readonly modelTries: ModelTry[],
  ) {}

  async call(model: Model, modelRequest: ModelRequest): Promise<ModelResult> {
    const modelResult = await this.providerClient.call(model, modelRequest);
    this.modelTries.push({
      callNumber: this.callNumber,
      modelName: model.name,
      outcome: modelResult.ok ? "ok" : `${modelResult.kind}${modelResult.httpStatus ?? ""}`,
    });
    return modelResult;
  }
}

describe("quota fill (manual)", () => {
  it(
    "moves on to the next model as models fill up, and only gives up once none is left",
    { timeout: 10 * 60_000 },
    async () => {
      const { GEMINI_API_KEY, USAGE_DB, QUOTA_FILL_CALLS } = env as unknown as Env & { QUOTA_FILL_CALLS: string };
      const callCount = Number(QUOTA_FILL_CALLS);
      const geminiClient = new GeminiClient(GEMINI_API_KEY);
      const modelUsageStore = new D1CountedModelUsageStore(USAGE_DB, GEMINI_MODELS, GEMINI_DAY_TIME_ZONE);
      const modelTries: ModelTry[] = [];

      // The calls start one after another with a short random gap, without
      // waiting for each other, so they overlap a lot, but their answers do
      // not all arrive at once.
      const pendingResults: Promise<ModelResult>[] = [];
      for (let callNumber = 1; callNumber <= callCount; callNumber++) {
        const providerClient = new RecordingClient(geminiClient, callNumber, modelTries);
        pendingResults.push(new Router([{ providerClient, modelUsageStore }]).ask(PING_REQUEST));
        if (callNumber < callCount) {
          await sleep(randomBetween(MIN_GAP_MS, MAX_GAP_MS));
        }
      }
      const modelResults = await Promise.all(pendingResults);

      const replyTexts = modelResults.flatMap((modelResult) => (modelResult.ok ? [modelResult.text.trim()] : []));
      const failureKinds = modelResults.flatMap((modelResult) => (modelResult.ok ? [] : [modelResult.kind]));
      const answeredBy = countBy(
        modelTries.filter((modelTry) => modelTry.outcome === "ok"),
        (modelTry) => modelTry.modelName,
      );
      const movedOnFrom = countBy(
        modelTries.filter((modelTry) => modelTry.outcome !== "ok"),
        (modelTry) => `${modelTry.modelName} ${modelTry.outcome}`,
      );
      const summary = [
        `${callCount} calls, ${replyTexts.length} answered, ${failureKinds.length} failed${
          failureKinds.length > 0 ? ` (${countTextOf(countBy(failureKinds, (failureKind) => failureKind))})` : ""
        }`,
        `answered by: ${countTextOf(answeredBy)}`,
        `moved on from: ${countTextOf(movedOnFrom) || "nothing"}`,
      ].join("\n");
      console.log(`\n${summary}\n`);

      expect(
        failureKinds.filter((failureKind) => !EXHAUSTED_FAILURE_KINDS.includes(failureKind)),
        summary,
      ).toEqual([]);
      expect(
        replyTexts.filter((replyText) => !/^pong\W*$/i.test(replyText)),
        summary,
      ).toEqual([]);
      expect(answeredBy.length, summary).toBeGreaterThan(1);
    },
  );
});

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Returns how often each key occurs, in the order the keys first occur.
function countBy<Item>(items: Item[], keyOf: (item: Item) => string): [string, number][] {
  const countByKey = new Map<string, number>();
  for (const item of items) {
    countByKey.set(keyOf(item), (countByKey.get(keyOf(item)) ?? 0) + 1);
  }
  return [...countByKey];
}

// Returns the counts as text, e.g. "gemini-3.1-flash-lite x12, gemini-3.5-flash-lite x3".
function countTextOf(counts: [string, number][]): string {
  return counts.map(([key, count]) => `${key} x${count}`).join(", ");
}
