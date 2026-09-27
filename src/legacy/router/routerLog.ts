import type { ProviderConfig } from "../providers/ProviderConfig";
import type { QuotaLimitScope } from "../quotaLimit/quotaLimitScope";
import type { ProviderFailure } from "../providers/providerClient";
import { Logger } from "../logging/logger";

const LOGGER = "routerLog";

export class RouterLog {
  constructor(private readonly logger: Logger = new Logger(LOGGER)) {}

  listed(models: ProviderConfig[]): void {
    this.logger.info("available models", {
      models: models.map((model) => model.id),
    });
  }

  attempted(model: ProviderConfig): void {
    this.logger.info("attempting model", { model: model.id });
  }

  succeeded(model: ProviderConfig, tokens: number): void {
    this.logger.info("model succeeded", { model: model.id, tokens });
  }

  rateLimited(model: ProviderConfig, quotaLimitScope: QuotaLimitScope): string {
    this.logger.warn("model rate limited", {
      model: model.id,
      quotaLimitScope,
    });
    return `rate limited (${quotaLimitScope} quota)`;
  }

  unavailable(model: ProviderConfig, failure: ProviderFailure): string {
    this.logger.warn("model unavailable", this.failureFields(model, failure));
    return `unavailable (HTTP ${failure.httpStatus ?? "n/a"}): ${failure.detail}`;
  }

  failed(model: ProviderConfig, failure: ProviderFailure): string {
    this.logger.error("model failed", this.failureFields(model, failure));
    return `failed with HTTP ${failure.httpStatus ?? "n/a"}: ${failure.detail}`;
  }

  noModelSucceeded(): void {
    this.logger.error("no model succeeded");
  }

  private failureFields(model: ProviderConfig, failure: ProviderFailure) {
    return {
      model: model.id,
      httpStatus: failure.httpStatus ?? null,
      detail: failure.detail,
    };
  }
}
