import type { ProviderConfig } from "./ProviderConfig";
import type { ProviderLimits } from "./ProviderLimits";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function gemini(model: string, limits: ProviderLimits): ProviderConfig {
  return {
    id: model,
    envSecretName: "GEMINI_API_KEY",
    baseUrl: GEMINI_BASE_URL,
    model,
    limits,
  };
}

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

function groq(model: string, limits: ProviderLimits): ProviderConfig {
  return {
    id: `groq-${model.split("/")[1]}`,
    envSecretName: "GROQ_API_KEY",
    baseUrl: GROQ_BASE_URL,
    model,
    limits,
  };
}

// The try order within each provider. The router tries Gemini's list first,
// then Groq's.
export const GEMINI_MODELS: ProviderConfig[] = [
  gemini("gemini-3.1-flash-lite", { rpm: 15, tpm: 250_000, rpd: 500 }),
  gemini("gemini-3.5-flash-lite", { rpm: 15, tpm: 250_000, rpd: 500 }),
  gemini("gemini-3.8-flash", { rpm: 5, tpm: 250_000, rpd: 20 }),
  gemini("gemini-3.7-flash", { rpm: 5, tpm: 250_000, rpd: 20 }),
  gemini("gemini-3.6-flash", { rpm: 5, tpm: 250_000, rpd: 20 }),
  gemini("gemini-3.5-flash", { rpm: 5, tpm: 250_000, rpd: 20 }),
  gemini("gemini-3-flash-preview", { rpm: 5, tpm: 250_000, rpd: 20 }),
];

export const GROQ_MODELS: ProviderConfig[] = [
  groq("openai/gpt-oss-120b", { rpm: 30, tpm: 8_000, rpd: 1_000, tpd: 200_000 }),
  groq("openai/gpt-oss-20b", { rpm: 30, tpm: 8_000, rpd: 1_000, tpd: 200_000 }),
];
