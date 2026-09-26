import type { QuotaLimitScope } from "../quotaLimit/quotaLimitScope";
import { GeminiClient } from "../providers/gemini/geminiClient";
import { GroqClient } from "../providers/groq/groqClient";
import type { ProviderConfig } from "../providers/ProviderConfig";
import type {
  ProviderFailure,
  ProviderRateLimit,
  ProviderRequest,
  ProviderResult,
  ProviderClient,
} from "../providers/providerClient";
import { GeminiUsageRepository } from "../repositories/geminiUsageRepository";
import { GroqUsageRepository } from "../repositories/groqUsageRepository";
import { RouterLog } from "./routerLog";

export interface UsageRepository {
  selectAvailableModels(now: Date): Promise<ProviderConfig[]>;

  recordUsage(
    model: ProviderConfig,
    tokens: number,
    now: Date,
    rateLimit?: ProviderRateLimit,
  ): Promise<void>;

  markQuotaExhausted(
    model: ProviderConfig,
    quotaLimitScope: QuotaLimitScope,
    now: Date,
    retryAfterSeconds?: number,
  ): Promise<void>;

  recordError(model: ProviderConfig, message: string, now: Date): Promise<void>;
}

// A provider whose usage is metered: the client calls its models, the
// usage repository says which are still available and records what was used.
export interface MeteredProvider {
  providerClient: ProviderClient;
  usageRepository: UsageRepository;
}

export class Router {
  constructor(
    private readonly log: RouterLog,
    private readonly meteredProviders: MeteredProvider[],
  ) {}

  async generate(request: ProviderRequest): Promise<ProviderResult> {
    const { log, meteredProviders } = this;
    let lastFailure: ProviderFailure = {
      kind: "rateLimited",
      detail: "no model is under its usage limits",
    };

    try {
      for (const { providerClient, usageRepository } of meteredProviders) {
        const models = await usageRepository.selectAvailableModels(new Date());
        log.listed(models);

        for (const model of models) {
          log.attempted(model);
          const answer = await providerClient.call(model, request);

          if (answer.result === "ok") {
            await usageRepository.recordUsage(
              model,
              answer.totalTokens,
              new Date(),
              answer.rateLimit,
            );
            log.succeeded(model, answer.totalTokens);
            return answer;
          }

          const { failure } = answer;
          lastFailure = failure;

          if (failure.kind === "rateLimited") {
            const quotaLimitScope = failure.quotaLimitScope ?? "minute";
            await usageRepository.markQuotaExhausted(
              model,
              quotaLimitScope,
              new Date(),
              failure.retryAfterSeconds,
            );
            await usageRepository.recordError(
              model,
              log.rateLimited(model, quotaLimitScope),
              new Date(),
            );
            continue;
          }

          if (failure.kind === "unauthorized") {
            // A bad API key breaks every model of this provider, so give up on
            // it and try the next provider.
            await usageRepository.recordError(
              model,
              log.failed(model, failure),
              new Date(),
            );
            break;
          }

          // Anything else says nothing about this provider's other models (a
          // retired model, a 503, an empty answer), so skip just this one.
          await usageRepository.recordError(
            model,
            failure.kind === "unavailable"
              ? log.unavailable(model, failure)
              : log.failed(model, failure),
            new Date(),
          );
        }
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
  GROQ_API_KEY: string;
  USAGE_DB: D1Database;
  // new provider-specific configs will be added here
}

export function createRouter(env: RouterEnv): Router {
  return new Router(new RouterLog(), [
    {
      providerClient: new GeminiClient(env.GEMINI_API_KEY),
      usageRepository: new GeminiUsageRepository(env.USAGE_DB),
    },
    {
      providerClient: new GroqClient(env.GROQ_API_KEY),
      usageRepository: new GroqUsageRepository(env.USAGE_DB),
    },
  ]);
}
