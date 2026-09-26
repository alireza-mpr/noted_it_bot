import type { QuotaLimitScope } from "../quotaLimit/quotaLimitScope";
import type { ProviderConfig } from "./ProviderConfig";

export interface ProviderRequest {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  responseSchema?: unknown;
}

interface FailureDetails {
  httpStatus?: number;
  detail: string;
}

export type ProviderFailure =
  | (FailureDetails & {
      kind: "rateLimited";
      quotaLimitScope?: QuotaLimitScope;
      retryAfterSeconds?: number;
    })
  | (FailureDetails & {
      kind:
        | "unavailable"
        | "badRequest"
        | "unauthorized"
        | "emptyResponse"
        | "serverError"
        | "internal";
    });

export type ProviderResult =
  | { result: "ok"; model: string; text: string; totalTokens: number }
  | { result: "failed"; failure: ProviderFailure };

// What the router depends on: one call to one specific model.
export interface ProviderClient {
  call(
    model: ProviderConfig,
    request: ProviderRequest,
  ): Promise<ProviderResult>;
}
