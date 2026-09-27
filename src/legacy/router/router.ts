import { GeminiClient } from "../providers/gemini/geminiClient";
import { GroqClient } from "../providers/groq/groqClient";
import type { ProviderConfig } from "../providers/ProviderConfig";
import type {
  ProviderSuccess,
  ProviderClient,
  ProviderFailure,
  ProviderRequest,
  ProviderResult,
} from "../providers/providerClient";
import { GeminiUsageRepository } from "../repositories/geminiUsageRepository";
import { GroqUsageRepository } from "../repositories/groqUsageRepository";
import { RouterLog } from "./routerLog";
import { describeError, Logger } from "../logging/logger";

const logger = new Logger("router");

// Counts a provider's model usage. Each provider stores what it needs.
export interface UsageRepository {
  // The models that are still under their limits, in try order.
  selectAvailableModels(now: Date): Promise<ProviderConfig[]>;
  recordSuccess(model: ProviderConfig, answer: ProviderSuccess, now: Date): Promise<void>;
  // `message` is the text stored as the model's last error.
  recordFailure(model: ProviderConfig, failure: ProviderFailure, message: string, now: Date): Promise<void>;
}

// A provider whose usage we count: the client calls its models, and the usage
// repository says which models are still available and records usage.
export interface MeteredProvider {
  providerClient: ProviderClient;
  usageRepository: UsageRepository;
}

export class Router {
  constructor(
    private readonly log: RouterLog,
    private readonly meteredProviders: MeteredProvider[],
  ) {}

  // Logs a failure and returns the text to store as the model's last error.
  private describeFailure(model: ProviderConfig, failure: ProviderFailure): string {
    if (failure.kind === "rateLimited") {
      return this.log.rateLimited(model, failure.quotaLimitScope ?? "minute");
    }
    return failure.kind === "unavailable" ? this.log.unavailable(model, failure) : this.log.failed(model, failure);
  }

  // Tries each provider's available models in order, until one answers.
  // onModelFound runs once, just before the first model is tried, so the
  // caller can tell the user that work has started. It is not called when no
  // model is available.
  async generate(request: ProviderRequest, onModelFound?: () => Promise<void>): Promise<ProviderResult> {
    let lastFailure: ProviderFailure = { ok: false, kind: "rateLimited", detail: "no model is under its usage limits" };
    let notified = false;

    try {
      for (const { providerClient, usageRepository } of this.meteredProviders) {
        const models = await usageRepository.selectAvailableModels(new Date());
        this.log.listed(models);

        for (const model of models) {
          if (!notified) {
            notified = true;
            await onModelFound?.();
          }
          this.log.attempted(model);
          const answer = await providerClient.call(model, request);

          if (answer.ok) {
            await usageRepository.recordSuccess(model, answer, new Date());
            this.log.succeeded(model, answer.totalTokens);
            return answer;
          }

          lastFailure = answer;
          await usageRepository.recordFailure(model, answer, this.describeFailure(model, answer), new Date());
          // A bad API key breaks every model of this provider, so try the next
          // provider. Any other error says nothing about this provider's other
          // models (for example a removed model, a 503, or an empty answer), so
          // try its next model.
          if (answer.kind === "unauthorized") {
            break;
          }
        }
      }

      this.log.noModelSucceeded();
      return lastFailure;
    } catch (err) {
      logger.error("threw", describeError(err));
      return { ok: false, kind: "internal", detail: String(err) };
    }
  }
}

export interface RouterEnv {
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
  USAGE_DB: D1Database;
  // add new provider-specific settings here
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
