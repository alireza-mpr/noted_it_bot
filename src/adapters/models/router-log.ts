import {
  exceptionAttributesOf,
  type LogAttributes,
} from "../logging/log-event";
import { Logger } from "../logging/logger";
import type { Model } from "./model";
import type { ModelAnswer, ModelFailure } from "./model-result";

const LOGGER = new Logger<RouterEventName>("router");
// A developer must act on these, e.g. a bad schema or a bad API key. The
// router handles every other failure by trying the next model.
const ERROR_FAILURE_KINDS: ReadonlySet<ModelFailure["kind"]> = new Set([
  "bad-request",
  "unauthorized",
  "internal",
]);

// Logs the models of one provider that are not used up, in try order.
export function logModelsListed(models: readonly Model[]): void {
  LOGGER.info("router.models_listed", {
    "router.available_models": models.map((model) => model.name),
  });
}

// Logs that the router tries a model.
export function logModelTried(model: Model): void {
  LOGGER.info("router.model_tried", modelAttributesOf(model));
}

// Logs a model's answer, with its token counts.
export function logModelAnswered(modelAnswer: ModelAnswer): void {
  LOGGER.info("router.model_answered", {
    ...modelAttributesOf(modelAnswer.model),
    "gen_ai.usage.input_tokens": modelAnswer.inputTokens,
    "gen_ai.usage.output_tokens": modelAnswer.outputTokens,
  });
}

// Logs why a model gave no answer: as an error if a developer must act, else
// as a warning.
export function logModelFailed(model: Model, modelFailure: ModelFailure): void {
  const logAttributes: LogAttributes = {
    ...modelAttributesOf(model),
    "router.failure_kind": modelFailure.kind,
    "http.response.status_code": modelFailure.httpStatus,
    "router.failure_detail": modelFailure.detail,
    ...(modelFailure.kind === "rate-limited" && {
      "router.limit_window": modelFailure.limitWindow,
      "router.retry_after_seconds": modelFailure.retryAfterSeconds,
    }),
  };
  if (ERROR_FAILURE_KINDS.has(modelFailure.kind)) {
    LOGGER.error("router.model_failed", logAttributes);
  } else {
    LOGGER.warn("router.model_failed", logAttributes);
  }
}

// Logs that no model answered.
export function logNoModelAnswered(): void {
  LOGGER.error("router.no_model_answered");
}

// Logs an error that the router did not expect.
export function logRouterFailed(error: unknown): void {
  LOGGER.error("router.failed", exceptionAttributesOf(error));
}

// Represents the router's event names.
type RouterEventName =
  | "router.models_listed"
  | "router.model_tried"
  | "router.model_answered"
  | "router.model_failed"
  | "router.no_model_answered"
  | "router.failed";

function modelAttributesOf(model: Model): LogAttributes {
  return {
    "gen_ai.provider.name": model.provider,
    "gen_ai.request.model": model.name,
  };
}
