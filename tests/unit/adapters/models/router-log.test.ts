import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GEMINI_MODELS, GROQ_MODELS } from "../../../../src/adapters/models/providers/model-list";
import {
  logModelAnswered,
  logModelFailed,
  logModelsListed,
  logModelTried,
  logNoModelAnswered,
  logRouterFailed,
} from "../../../../src/adapters/models/router-log";
import { axiomEventsOf } from "../logging/axiom-events-of";
import { modelAnswerOf } from "./model-answer-of";

const GEMINI_MODEL = GEMINI_MODELS[0];
const GROQ_MODEL = GROQ_MODELS[0];

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("router log events", () => {
  it("use fixed event names, with the data in attributes", async () => {
    const logEvents = await axiomEventsOf(() => {
      logModelsListed([GEMINI_MODEL, GROQ_MODEL]);
      logModelTried(GEMINI_MODEL);
      logModelAnswered(modelAnswerOf(GEMINI_MODEL, 812));
      logModelFailed(GEMINI_MODEL, {
        ok: false,
        kind: "rate-limited",
        limitWindow: "day",
        retryAfterSeconds: null,
        httpStatus: 429,
        detail: "quota",
      });
      logModelFailed(GEMINI_MODEL, { ok: false, kind: "unavailable", httpStatus: 503, detail: "high demand" });
      logModelFailed(GEMINI_MODEL, { ok: false, kind: "bad-request", httpStatus: null, detail: "bad schema" });
      logNoModelAnswered();
      logRouterFailed(new Error("boom"));
    });

    expect(logEvents.map((logEvent) => [logEvent.severityText, logEvent.eventName])).toEqual([
      ["INFO", "router.models_listed"],
      ["INFO", "router.model_tried"],
      ["INFO", "router.model_answered"],
      ["WARN", "router.model_failed"],
      ["WARN", "router.model_failed"],
      ["ERROR", "router.model_failed"],
      ["ERROR", "router.no_model_answered"],
      ["ERROR", "router.failed"],
    ]);
    expect(logEvents[0]).toMatchObject({ "router.available_models": ["gemini-3.1-flash-lite", "openai/gpt-oss-120b"] });
    expect(logEvents[1]).toMatchObject({
      "gen_ai.provider.name": "gcp.gemini",
      "gen_ai.request.model": "gemini-3.1-flash-lite",
    });
    expect(logEvents[2]).toMatchObject({ "gen_ai.usage.input_tokens": 811, "gen_ai.usage.output_tokens": 1 });
    expect(logEvents[3]).toMatchObject({
      "router.failure_kind": "rate-limited",
      "router.limit_window": "day",
      "http.response.status_code": 429,
    });
    expect(logEvents[4]).toMatchObject({
      "router.failure_kind": "unavailable",
      "http.response.status_code": 503,
      "router.failure_detail": "high demand",
    });
    expect(logEvents[5]).toMatchObject({ "router.failure_kind": "bad-request", "http.response.status_code": null });
    expect(logEvents[7]).toMatchObject({ "exception.message": "boom" });
  });
});
