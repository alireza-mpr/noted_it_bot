// Represents a company that runs models behind an API. The values are
// OpenTelemetry's names (gen_ai.provider.name).
export type Provider = "gcp.gemini" | "groq";

// Represents a model's free limits. A model at a limit is used up until the
// limit's minute or day ends.
export interface ModelLimits {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay: number;
}

// Represents one model of a provider. Its name is the provider's name for it,
// e.g. "openai/gpt-oss-120b".
export interface Model {
  provider: Provider;
  name: string;
  limits: ModelLimits;
}
