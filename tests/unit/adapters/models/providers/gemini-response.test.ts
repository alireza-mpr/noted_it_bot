import { describe, expect, it } from "vitest";
import { GEMINI_MODELS } from "../../../../../src/adapters/models/providers/model-list";
import { parseGeminiResponse } from "../../../../../src/adapters/models/providers/gemini-response";
import { GEMINI_503_UNAVAILABLE } from "../../../fixtures/gemini503Unavailable";

const MODEL = GEMINI_MODELS[0];

const DETAIL =
  "UNAVAILABLE: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.";

const quotaError = (quotaId: string) =>
  JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", details: [{ violations: [{ quotaId }] }] } });

describe("parseGeminiResponse", () => {
  it("treats the real 503 as unavailable, not rate limited", () => {
    const { httpStatus, body } = GEMINI_503_UNAVAILABLE;

    expect(parseGeminiResponse(MODEL, httpStatus, body)).toEqual({
      ok: false,
      kind: "unavailable",
      httpStatus: 503,
      detail: DETAIL,
    });
  });

  it("goes by Google's UNAVAILABLE status even under another HTTP status", () => {
    expect(parseGeminiResponse(MODEL, 500, GEMINI_503_UNAVAILABLE.body)).toMatchObject({
      ok: false,
      kind: "unavailable",
      httpStatus: 500,
    });
  });

  it("reads the limit window of a 429 from the quota id", () => {
    expect(parseGeminiResponse(MODEL, 429, quotaError("GenerateRequestsPerDayPerProjectPerModel"))).toMatchObject({
      kind: "rate-limited",
      limitWindow: "day",
    });
    expect(parseGeminiResponse(MODEL, 429, quotaError("GenerateRequestsPerMinutePerProjectPerModel"))).toMatchObject({
      kind: "rate-limited",
      limitWindow: "minute",
    });
  });

  it("names the model and the tokens on a successful answer, with thinking as output", () => {
    const body = JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Pong" }] } }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, thoughtsTokenCount: 2, totalTokenCount: 7 },
    });

    expect(parseGeminiResponse(MODEL, 200, body)).toEqual({
      ok: true,
      model: MODEL,
      text: "Pong",
      inputTokens: 3,
      outputTokens: 3,
      totalTokens: 7,
      dailyRequests: null,
    });
  });
});
