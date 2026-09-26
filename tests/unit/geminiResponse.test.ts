import { describe, expect, it } from "vitest";
import { parseGeminiResponse } from "../../src/lib/providers/gemini/geminiResponse";
import { GEMINI_503_UNAVAILABLE } from "./fixtures/gemini503Unavailable";

const MODEL = "gemini-3.1-flash-lite";

const DETAIL =
  "UNAVAILABLE: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.";

describe("parseGeminiResponse", () => {
  it("treats the real 503 as unavailable, not rate limited", () => {
    const { httpStatus, body } = GEMINI_503_UNAVAILABLE;

    expect(parseGeminiResponse(MODEL, httpStatus, body)).toEqual({
      result: "failed",
      failure: { kind: "unavailable", httpStatus: 503, detail: DETAIL },
    });
  });

  it("goes by Google's UNAVAILABLE status even under another HTTP status", () => {
    expect(
      parseGeminiResponse(MODEL, 500, GEMINI_503_UNAVAILABLE.body),
    ).toMatchObject({
      result: "failed",
      failure: { kind: "unavailable", httpStatus: 500 },
    });
  });

  it("names the model on a successful answer", () => {
    const body = JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Pong" }] } }],
      usageMetadata: { totalTokenCount: 7 },
    });

    expect(parseGeminiResponse(MODEL, 200, body)).toEqual({
      result: "ok",
      model: MODEL,
      text: "Pong",
      totalTokens: 7,
    });
  });
});
