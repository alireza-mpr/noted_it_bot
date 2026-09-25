import type { ProviderConfig } from "../lib/providers/ProviderConfig";
import type { QuotaLimitScope } from "../lib/quotaLimit/quotaLimitScope";
import type { LlmFailure } from "../lib/providers/providerClient";
import { dateTimeAest } from "../lib/time/dateTimeAest";

const LOGGER = "routerLog";

type Level = "log" | "warn" | "error";

export class RouterLog {
  listed(models: ProviderConfig[]): void {
    this.write(
      "log",
      `available models: ${models.map((model) => model.id).join(", ") || "none"}`,
    );
  }

  attempted(model: ProviderConfig): void {
    this.write("log", `attempting ${model.id}`);
  }

  succeeded(model: ProviderConfig, tokens: number): void {
    this.write("log", `${model.id} succeeded, ${tokens} tokens`);
  }

  rateLimited(model: ProviderConfig, quotaLimitScope: QuotaLimitScope): string {
    return this.modelEvent(
      "warn",
      model,
      `rate limited (${quotaLimitScope} quota)`,
    );
  }

  unavailable(model: ProviderConfig, failure: LlmFailure): string {
    return this.modelEvent(
      "warn",
      model,
      `unavailable (HTTP ${failure.httpStatus ?? "n/a"}): ${failure.detail}`,
    );
  }

  failed(model: ProviderConfig, failure: LlmFailure): string {
    return this.modelEvent(
      "error",
      model,
      `failed with HTTP ${failure.httpStatus ?? "n/a"}: ${failure.detail}`,
    );
  }

  noModelSucceeded(): void {
    this.write("error", "no model succeeded");
  }

  private modelEvent(
    level: Level,
    model: ProviderConfig,
    event: string,
  ): string {
    this.write(level, `${model.id} ${event}`);
    return event;
  }

  private write(level: Level, message: string): void {
    console[level](
      JSON.stringify({
        logger: LOGGER,
        time: { date_time_aest: dateTimeAest(new Date()) },
        message,
      }),
    );
  }
}
