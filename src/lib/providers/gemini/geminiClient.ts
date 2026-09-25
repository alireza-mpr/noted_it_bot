import type { ProviderConfig } from "../ProviderConfig";
import { parseGeminiResponse } from "./geminiResponse";
import type { ProviderRequest, ProviderResult, ProviderClient } from "../providerClient";

const DEFAULT_TIMEOUT_MS = 12_000;

export class GeminiClient implements ProviderClient {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async call(model: ProviderConfig, request: ProviderRequest): Promise<ProviderResult> {
    try {
      const response = await fetch(
        `${model.baseUrl}/models/${model.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
          body: JSON.stringify({
            ...(request.systemPrompt && {
              systemInstruction: { parts: [{ text: request.systemPrompt }] },
            }),
            contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
            generationConfig: {
              temperature: request.temperature ?? 0,
              ...(request.responseSchema !== undefined && {
                responseMimeType: "application/json",
                responseSchema: request.responseSchema,
              }),
            },
          }),
        },
      );
      return parseGeminiResponse(response.status, await response.text());
    } catch (err) {
      if ((err as Error).name === "TimeoutError") {
        return {
          result: "failed",
          failure: {
            kind: "unavailable",
            detail: `no response within ${this.timeoutMs / 1000}s`,
          },
        };
      }
      throw err;
    }
  }
}
