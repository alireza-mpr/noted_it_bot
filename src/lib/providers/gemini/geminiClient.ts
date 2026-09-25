import type { ProviderConfig } from "../ProviderConfig";
import { parseGeminiResponse } from "./geminiResponse";
import type { LlmRequest, LlmResult, ProviderClient } from "../providerClient";

export class GeminiClient implements ProviderClient {
  constructor(private readonly apiKey: string) {}

  async call(model: ProviderConfig, request: LlmRequest): Promise<LlmResult> {
    const response = await fetch(
      `${model.baseUrl}/models/${model.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
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
  }
}
