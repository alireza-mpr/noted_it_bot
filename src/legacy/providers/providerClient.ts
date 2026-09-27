import type { QuotaLimitScope } from "../quotaLimit/quotaLimitScope";
import type { ProviderConfig } from "./ProviderConfig";

export interface ProviderRequest {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  responseSchema?: unknown;
}

interface FailureDetails {
  ok: false;
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

// What a provider reports about its daily request limit after a call. It is
// only shown in the usage table. The router does not use it.
export interface ProviderRateLimit {
  remainingRequests: number;
  limitRequests: number;
}

export interface ProviderSuccess {
  ok: true;
  model: string;
  text: string;
  totalTokens: number;
  rateLimit?: ProviderRateLimit;
}

export type ProviderResult = ProviderSuccess | ProviderFailure;

// What the router needs: one call to one specific model.
export interface ProviderClient {
  call(
    model: ProviderConfig,
    request: ProviderRequest,
  ): Promise<ProviderResult>;
}
