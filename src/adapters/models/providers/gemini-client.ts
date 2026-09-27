import type { Model } from "../model";
import {
  timeoutFailureOf,
  type ModelRequest,
  type ModelResult,
} from "../model-result";
import type { ProviderClient } from "../provider-client";
import { parseGeminiResponse } from "./gemini-response";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 12_000;

// Represents a client for Gemini's API.
export class GeminiClient implements ProviderClient {
  constructor(
    private readonly geminiApiKey: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  // Sends the request to the model, and returns its answer or why there is
  // none.
  async call(model: Model, modelRequest: ModelRequest): Promise<ModelResult> {
    try {
      const response = await fetch(
        `${GEMINI_API_URL}/models/${model.name}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.geminiApiKey,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
          body: JSON.stringify(geminiRequestBodyOf(modelRequest)),
        },
      );
      return parseGeminiResponse(model, response.status, await response.text());
    } catch (error) {
      const timeoutFailure = timeoutFailureOf(error, this.timeoutMs);
      if (timeoutFailure === null) {
        throw error;
      }
      return timeoutFailure;
    }
  }
}

function geminiRequestBodyOf(modelRequest: ModelRequest) {
  return {
    ...(modelRequest.systemPrompt !== null && {
      systemInstruction: { parts: [{ text: modelRequest.systemPrompt }] },
    }),
    contents: [{ role: "user", parts: [{ text: modelRequest.userPrompt }] }],
    generationConfig: {
      // The least random answer: the same message gives the same draft.
      temperature: 0,
      ...(modelRequest.responseSchema !== null && {
        responseMimeType: "application/json",
        responseSchema: modelRequest.responseSchema,
      }),
    },
  };
}
