import type { Env } from "../../../config/env";
import { D1CountedModelUsageStore } from "../../database/d1-counted-model-usage-store";
import { D1RetryAfterModelUsageStore } from "../../database/d1-retry-after-model-usage-store";
import type { RoutedProvider } from "../router";
import { GeminiClient } from "./gemini-client";
import { GroqClient } from "./groq-client";
import { GEMINI_DAY_TIME_ZONE, GEMINI_MODELS, GROQ_MODELS } from "./model-list";

// Returns the providers the router tries, in order: Gemini, then Groq. Each
// has the store of its model usage.
export function routedProvidersOf(
  env: Pick<Env, "GEMINI_API_KEY" | "GROQ_API_KEY" | "USAGE_DB">,
): RoutedProvider[] {
  return [
    {
      providerClient: new GeminiClient(env.GEMINI_API_KEY),
      modelUsageStore: new D1CountedModelUsageStore(
        env.USAGE_DB,
        GEMINI_MODELS,
        GEMINI_DAY_TIME_ZONE,
      ),
    },
    {
      providerClient: new GroqClient(env.GROQ_API_KEY),
      modelUsageStore: new D1RetryAfterModelUsageStore(env.USAGE_DB, GROQ_MODELS),
    },
  ];
}
