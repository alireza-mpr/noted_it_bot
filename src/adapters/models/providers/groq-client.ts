import type { Model } from "../model";
import {
  timeoutFailureOf,
  type ModelRequest,
  type ModelResult,
} from "../model-result";
import type { ProviderClient } from "../provider-client";
import { toGroqJsonSchema } from "./groq-json-schema";
import { parseGroqResponse } from "./groq-response";

const GROQ_API_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TIMEOUT_MS = 12_000;

// Represents a client for Groq's API.
export class GroqClient implements ProviderClient {
  constructor(
    private readonly groqApiKey: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  // Sends the request to the model, and returns its answer or why there is
  // none.
  async call(model: Model, modelRequest: ModelRequest): Promise<ModelResult> {
    try {
      const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.groqApiKey}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify(groqRequestBodyOf(model, modelRequest)),
      });
      return parseGroqResponse(
        model,
        response.status,
        await response.text(),
        response.headers,
      );
    } catch (error) {
      const timeoutFailure = timeoutFailureOf(error, this.timeoutMs);
      if (timeoutFailure === null) {
        throw error;
      }
      return timeoutFailure;
    }
  }
}

function groqRequestBodyOf(model: Model, modelRequest: ModelRequest) {
  return {
    model: model.name,
    messages: [
      ...(modelRequest.systemPrompt !== null
        ? [{ role: "system", content: modelRequest.systemPrompt }]
        : []),
      { role: "user", content: modelRequest.userPrompt },
    ],
    // The least random answer: the same message gives the same draft.
    temperature: 0,
    reasoning_effort: "medium",
    ...(modelRequest.responseSchema !== null && {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "response",
          strict: true,
          schema: toGroqJsonSchema(modelRequest.responseSchema),
        },
      },
    }),
  };
}
