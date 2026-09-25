import type { QuotaLimitScope } from "../quotaLimit/quotaLimitScope";
import type { ProviderConfig } from "./ProviderConfig";

export interface LlmRequest {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  responseSchema?: unknown;
}

interface FailureDetails {
  httpStatus?: number;
  detail: string;
}

export type LlmFailure =
  | (FailureDetails & {
      kind: "rateLimited";
      quotaLimitScope?: QuotaLimitScope;
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

export type LlmResult =
  | { result: "ok"; text: string; totalTokens: number }
  | { result: "failed"; failure: LlmFailure };

// What the Telegram handlers depend on: ask for an answer, whichever model gives it.
export interface LlmClient {
  generate(request: LlmRequest): Promise<LlmResult>;
}

// What the router depends on: one call to one specific model.
export interface ProviderClient {
  call(model: ProviderConfig, request: LlmRequest): Promise<LlmResult>;
}
