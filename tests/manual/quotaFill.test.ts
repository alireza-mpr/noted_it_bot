import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { GeminiClient } from "../../src/lib/providers/gemini/geminiClient";
import type { ProviderConfig } from "../../src/lib/providers/ProviderConfig";
import type {
  ProviderClient,
  ProviderRequest,
  ProviderResult,
} from "../../src/lib/providers/providerClient";
import { GeminiUsageRepository } from "../../src/repositories/geminiUsageRepository";
import { Router, type RouterEnv } from "../../src/router/router";
import { RouterLog } from "../../src/router/routerLog";

// Not part of `npm test` or CI: it deliberately burns through quota.
// Run it on demand with `npm run test:quota-fill`.
//
// It sends the same trivial prompt through the real Router, against the real
// Gemini API and the real dev D1 usage table, calls started 50 to 200 ms
// apart, without waiting for each to finish. Many calls read the usage counts
// before earlier ones have recorded their use, so they pick the same first
// model and most get a real 429 back. It checks that the Router
// recovers from that by moving on to the next model instead of failing.
//
// With enough calls every model fills up. Calls that find no model left may
// then fail with rateLimited, unavailable or badRequest; any other kind of
// failure, or a wrong reply, is a bug. The number of calls is QUOTA_FILL_CALLS, set to 100
// by `npm run test:quota-fill`; override it with e.g.
// `QUOTA_FILL_CALLS=150 npm run test:quota-fill`.

// Failures that are what running out of models looks like, not a bug.
// badRequest is here because the registry keeps retired models (404) on
// purpose for smoke testing, so a run that exhausts the chain ends on them;
// the "skipped past" line of the summary still shows every one.
const EXHAUSTED_KINDS = ["rateLimited", "unavailable", "badRequest"];
const REQUEST: ProviderRequest = { userPrompt: "Reply with Pong nothing else" };

interface Attempt {
  call: number;
  model: string;
  outcome: string;
}

// Delegates to the real client and records every attempt, including the ones
// the Router recovers from, so the run shows where it moved on.
class RecordingClient implements ProviderClient {
  constructor(
    private readonly inner: ProviderClient,
    private readonly callNumber: number,
    private readonly attempts: Attempt[],
  ) {}

  async call(
    model: ProviderConfig,
    request: ProviderRequest,
  ): Promise<ProviderResult> {
    const answer = await this.inner.call(model, request);
    this.attempts.push({
      call: this.callNumber,
      model: model.id,
      outcome:
        answer.result === "ok"
          ? "ok"
          : `${answer.failure.kind}${answer.failure.httpStatus ?? ""}`,
    });
    return answer;
  }
}

const MIN_GAP_MS = 50;
const MAX_GAP_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  }
  return [...counts];
}

describe("quota fill (manual)", () => {
  it(
    "moves on to the next model as models fill up, and only gives up once none is left",
    { timeout: 10 * 60_000 },
    async () => {
      const { GEMINI_API_KEY, GEMINI_USAGE_DB, QUOTA_FILL_CALLS } =
        env as unknown as RouterEnv & { QUOTA_FILL_CALLS: string };
      const calls = Number(QUOTA_FILL_CALLS);
      const geminiClient = new GeminiClient(GEMINI_API_KEY);
      const usageRepository = new GeminiUsageRepository(GEMINI_USAGE_DB);
      const attempts: Attempt[] = [];

      // Start the calls one after another with a short random gap, without
      // waiting for each to finish, so they overlap heavily but their answers
      // don't all land at once.
      const pending: ReturnType<Router["generate"]>[] = [];
      for (let call = 1; call <= calls; call++) {
        const providerClient = new RecordingClient(
          geminiClient,
          call,
          attempts,
        );
        pending.push(
          new Router(new RouterLog(), [
            { providerClient, usageRepository },
          ]).generate(REQUEST),
        );
        if (call < calls) {
          await sleep(randomBetween(MIN_GAP_MS, MAX_GAP_MS));
        }
      }
      const answers = await Promise.all(pending);

      const replies: string[] = [];
      const failureKinds: string[] = [];
      for (const answer of answers) {
        if (answer.result === "ok") {
          replies.push(answer.text.trim());
        } else {
          failureKinds.push(answer.failure.kind);
        }
      }

      const answeredBy = countBy(
        attempts.filter((attempt) => attempt.outcome === "ok"),
        (attempt) => attempt.model,
      );
      const recoveredFrom = countBy(
        attempts.filter((attempt) => attempt.outcome !== "ok"),
        (attempt) => `${attempt.model} ${attempt.outcome}`,
      );
      const summary = [
        `${calls} calls, ${replies.length} answered, ${failureKinds.length} failed${
          failureKinds.length
            ? ` (${countBy(failureKinds, (kind) => kind)
                .map(([kind, n]) => `${kind} x${n}`)
                .join(", ")})`
            : ""
        }`,
        `answered by: ${answeredBy.map(([model, n]) => `${model} x${n}`).join(", ")}`,
        `skipped past: ${
          recoveredFrom.map(([what, n]) => `${what} x${n}`).join("; ") ||
          "nothing"
        }`,
      ].join("\n");
      console.log(`\n${summary}\n`);

      expect(
        failureKinds.filter((kind) => !EXHAUSTED_KINDS.includes(kind)),
        summary,
      ).toEqual([]);
      expect(
        replies.filter((reply) => !/^pong\W*$/i.test(reply)),
        summary,
      ).toEqual([]);
      expect(answeredBy.length, summary).toBeGreaterThan(1);
    },
  );
});
