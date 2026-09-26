import type { ProviderConfig } from "../providers/ProviderConfig";
import type { QuotaLimitScope } from "../quotaLimit/quotaLimitScope";
import type { ProviderFailure } from "../providers/providerClient";
import { Logger } from "../logging/logger";

const LOGGER = "routerLog";

export class RouterLog {
  constructor(private readonly logger: Logger = new Logger(LOGGER)) {}

  listed(models: ProviderConfig[]): void {
    const ids = models.map((model) => model.id);
    this.logger.info(`available models: ${ids.join(", ") || "none"}`, {
      models: ids,
    });
  }

  attempted(model: ProviderConfig): void {
    this.logger.info(`attempting ${model.id}`, { model: model.id });
  }

  succeeded(model: ProviderConfig, tokens: number): void {
    this.logger.info(`${model.id} succeeded, ${tokens} tokens`, {
      model: model.id,
      tokens,
    });
  }

  rateLimited(model: ProviderConfig, quotaLimitScope: QuotaLimitScope): string {
    return this.modelEvent(
      "warn",
      model,
      `rate limited (${quotaLimitScope} quota)`,
    );
  }

  unavailable(model: ProviderConfig, failure: ProviderFailure): string {
    return this.modelEvent(
      "warn",
      model,
      `unavailable (HTTP ${failure.httpStatus ?? "n/a"}): ${failure.detail}`,
    );
  }

  failed(model: ProviderConfig, failure: ProviderFailure): string {
    return this.modelEvent(
      "error",
      model,
      `failed with HTTP ${failure.httpStatus ?? "n/a"}: ${failure.detail}`,
    );
  }

  noModelSucceeded(): void {
    this.logger.error("no model succeeded");
  }

  private modelEvent(
    level: "warn" | "error",
    model: ProviderConfig,
    event: string,
  ): string {
    this.logger[level](`${model.id} ${event}`, { model: model.id });
    return event;
  }
}
