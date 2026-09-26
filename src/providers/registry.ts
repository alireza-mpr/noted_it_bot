import type { ProviderConfig } from "./ProviderConfig";
import type { ProviderLimits } from "./ProviderLimits";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function gemini(model: string, limits: ProviderLimits): ProviderConfig {
  return {
    id: model,
    kind: "gemini",
    envSecretName: "GEMINI_API_KEY",
    baseUrl: GEMINI_BASE_URL,
    model,
    limits,
  };
}

export const PROVIDERS: ProviderConfig[] = [
  gemini("gemini-3.1-flash-lite", { rpm: 15, tpm: 250_000, rpd: 500 }),
  gemini("gemini-3.5-flash-lite", { rpm: 15, tpm: 250_000, rpd: 500 }),
  {
    id: "groq-gpt-oss-120b",
    kind: "groq",
    envSecretName: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    limits: { rpm: 30, tpm: 8_000, rpd: 1_000, tpd: 200_000 },
  },
  gemini("gemini-3.8-flash", { rpm: 5, tpm: 250_000, rpd: 20 }),
  gemini("gemini-3.7-flash", { rpm: 5, tpm: 250_000, rpd: 20 }),
  gemini("gemini-3.6-flash", { rpm: 5, tpm: 250_000, rpd: 20 }),
  gemini("gemini-3.5-flash", { rpm: 5, tpm: 250_000, rpd: 20 }),
  gemini("gemini-3-flash-preview", { rpm: 5, tpm: 250_000, rpd: 20 }),
];

export const GEMINI_MODELS = PROVIDERS.filter(
  (provider) => provider.kind === "gemini",
);
