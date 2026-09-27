import type { Model } from "./model";

// Represents what the bot asks a model. A null responseSchema asks for free
// text.
export interface ModelRequest {
  systemPrompt: string | null;
  userPrompt: string;
  responseSchema: ResponseSchema | null;
}

// Represents the shape of a JSON answer, in the OpenAPI schema format that
// Gemini uses, e.g. { type: "STRING", nullable: true }.
export interface ResponseSchema {
  type: string;
  nullable?: boolean;
  enum?: readonly string[];
  properties?: Readonly<Record<string, ResponseSchema>>;
  items?: ResponseSchema;
  required?: readonly string[];
  propertyOrdering?: readonly string[];
}

// Represents a model's answer: its text, not parsed yet.
export interface ModelAnswer {
  ok: true;
  model: Model;
  text: string;
  totalTokens: number;
  dailyRequests: DailyRequests | null;
}

// Represents the daily request count that a provider reports after a call
// (only Groq does). Only the usage table shows it.
export interface DailyRequests {
  remaining: number;
  limit: number;
}

// Represents the window of a model limit.
export type LimitWindow = "minute" | "day";

// Represents why a model gave no answer. The detail is for the logs and the
// usage table.
export type ModelFailure =
  | {
      ok: false;
      kind: "rate-limited";
      limitWindow: LimitWindow | null;
      retryAfterSeconds: number | null;
      httpStatus: number;
      detail: string;
    }
  | {
      ok: false;
      kind:
        | "unavailable"
        | "bad-request"
        | "unauthorized"
        | "empty-answer"
        | "server-error"
        | "internal";
      httpStatus: number | null;
      detail: string;
    };

// Represents a model's answer, or why there is none.
export type ModelResult = ModelAnswer | ModelFailure;

// Returns the failure kind of an HTTP error status that has no kind of its
// own (i.e. not a 429 or a 503).
export function failureKindOf(
  httpStatus: number,
): "unauthorized" | "server-error" | "bad-request" {
  if (httpStatus === 401 || httpStatus === 403) {
    return "unauthorized";
  }
  return httpStatus >= 500 ? "server-error" : "bad-request";
}

// Returns the failure of a request that got no answer within timeoutMs, or
// null if the error is not a timeout.
export function timeoutFailureOf(
  error: unknown,
  timeoutMs: number,
): ModelFailure | null {
  const isTimeout =
    error instanceof Object && "name" in error && error.name === "TimeoutError";
  return isTimeout
    ? {
        ok: false,
        kind: "unavailable",
        httpStatus: null,
        detail: `no answer within ${timeoutMs / 1000}s`,
      }
    : null;
}
