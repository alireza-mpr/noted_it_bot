import type { ProviderConfig } from "../ProviderConfig";
import type { ProviderRequest, ProviderResult, ProviderClient } from "../providerClient";
import { parseGroqResponse } from "./groqResponse";
import { toJsonSchema } from "./jsonSchema";

const DEFAULT_TIMEOUT_MS = 12_000;

export class GroqClient implements ProviderClient {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async call(model: ProviderConfig, request: ProviderRequest): Promise<ProviderResult> {
    try {
      const response = await fetch(`${model.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: model.model,
          messages: [
            ...(request.systemPrompt
              ? [{ role: "system", content: request.systemPrompt }]
              : []),
            { role: "user", content: request.userPrompt },
          ],
          temperature: request.temperature ?? 0,
          reasoning_effort: "medium",
          ...(request.responseSchema !== undefined && {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "response",
                strict: true,
                schema: toJsonSchema(request.responseSchema as Parameters<typeof toJsonSchema>[0]),
              },
            },
          }),
        }),
      });
      return parseGroqResponse(
        model.id,
        response.status,
        await response.text(),
        response.headers,
      );
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
