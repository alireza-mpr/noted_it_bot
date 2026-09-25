import type { QuotaLimitScope } from "../lib/quotaLimit/quotaLimitScope";
import { GeminiClient } from "../lib/providers/gemini/geminiClient";
import type { ProviderConfig } from "../lib/providers/ProviderConfig";
import type {
  LlmClient,
  LlmFailure,
  LlmRequest,
  LlmResult,
  ProviderClient,
} from "../lib/providers/providerClient";
import { GeminiUsageRepository } from "../repositories/geminiUsageRepository";
import { RouterLog } from "./routerLog";

export interface UsageRepository {
  selectAvailableModels(now: Date): Promise<ProviderConfig[]>;
  recordUsage(model: ProviderConfig, tokens: number, now: Date): Promise<void>;
  markQuotaExhausted(
    model: ProviderConfig,
    quotaLimitScope: QuotaLimitScope,
    now: Date,
  ): Promise<void>;
  recordError(model: ProviderConfig, message: string, now: Date): Promise<void>;
}

export class Router implements LlmClient {
  constructor(
    private readonly repository: UsageRepository,
    private readonly client: ProviderClient,
    private readonly log: RouterLog,
  ) {}

  async generate(request: LlmRequest): Promise<LlmResult> {
    const { repository, client, log } = this;
    let lastFailure: LlmFailure = {
      kind: "rateLimited",
      detail: "no model is under its usage limits",
    };

    try {
      const models = await repository.selectAvailableModels(new Date());
      log.listed(models);

      for (const model of models) {
        log.attempted(model);
        const answer = await client.call(model, request);

        if (answer.result === "ok") {
          await repository.recordUsage(model, answer.totalTokens, new Date());
          log.succeeded(model, answer.totalTokens);
          return answer;
        }

        const { failure } = answer;
        if (failure.kind === "rateLimited") {
          const quotaLimitScope = failure.quotaLimitScope ?? "minute";
          await repository.markQuotaExhausted(
            model,
            quotaLimitScope,
            new Date(),
          );
          await repository.recordError(
            model,
            log.rateLimited(model, quotaLimitScope),
            new Date(),
          );
          lastFailure = failure;
          continue;
        }

        if (failure.kind === "unavailable") {
          await repository.recordError(
            model,
            log.unavailable(model, failure),
            new Date(),
          );
          lastFailure = failure;
          continue;
        }

        await repository.recordError(
          model,
          log.failed(model, failure),
          new Date(),
        );
        return answer;
      }

      log.noModelSucceeded();
      return { result: "failed", failure: lastFailure };
    } catch (err) {
      console.error("Router: threw", err);
      return {
        result: "failed",
        failure: { kind: "internal", detail: String(err) },
      };
    }
  }
}

export interface RouterEnv {
  GEMINI_API_KEY: string;
  GEMINI_USAGE_DB: D1Database;
}

export function createRouter(env: RouterEnv): Router {
  return new Router(
    new GeminiUsageRepository(env.GEMINI_USAGE_DB),
    new GeminiClient(env.GEMINI_API_KEY),
    new RouterLog(),
  );
}
