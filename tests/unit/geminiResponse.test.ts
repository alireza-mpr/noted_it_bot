import { describe, expect, it } from "vitest";
import { parseGeminiResponse } from "../../src/lib/providers/gemini/geminiResponse";
import { GEMINI_503_UNAVAILABLE } from "./fixtures/gemini503Unavailable";

const DETAIL =
  "UNAVAILABLE: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.";

describe("parseGeminiResponse", () => {
  it("treats the real 503 as unavailable, not rate limited", () => {
    const { httpStatus, body } = GEMINI_503_UNAVAILABLE;

    expect(parseGeminiResponse(httpStatus, body)).toEqual({
      result: "failed",
      failure: { kind: "unavailable", httpStatus: 503, detail: DETAIL },
    });
  });

  it("goes by Google's UNAVAILABLE status even under another HTTP status", () => {
    expect(parseGeminiResponse(500, GEMINI_503_UNAVAILABLE.body)).toMatchObject(
      {
        result: "failed",
        failure: { kind: "unavailable", httpStatus: 500 },
      },
    );
  });
});
