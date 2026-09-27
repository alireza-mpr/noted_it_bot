import { timeZoneNamed } from "../../../generic/date-time/time-zone";
import type { Model, ModelLimits } from "../model";

const GEMINI_LITE_LIMITS: ModelLimits = {
  requestsPerMinute: 15,
  tokensPerMinute: 250_000,
  requestsPerDay: 500,
};
const GEMINI_FLASH_LIMITS: ModelLimits = {
  requestsPerMinute: 5,
  tokensPerMinute: 250_000,
  requestsPerDay: 20,
};
const GROQ_LIMITS: ModelLimits = {
  requestsPerMinute: 30,
  tokensPerMinute: 8_000,
  requestsPerDay: 1_000,
};

// Represents the time zone of Gemini's day: its daily limits reset at
// midnight Pacific time.
export const GEMINI_DAY_TIME_ZONE = timeZoneNamed("America/Los_Angeles");

// Represents Gemini's models, in the order the router tries them. The router
// tries all of Gemini's models before Groq's.
export const GEMINI_MODELS: readonly Model[] = [
  { provider: "gcp.gemini", name: "gemini-3.1-flash-lite", limits: GEMINI_LITE_LIMITS },
  { provider: "gcp.gemini", name: "gemini-3.5-flash-lite", limits: GEMINI_LITE_LIMITS },
  { provider: "gcp.gemini", name: "gemini-3.8-flash", limits: GEMINI_FLASH_LIMITS },
  { provider: "gcp.gemini", name: "gemini-3.7-flash", limits: GEMINI_FLASH_LIMITS },
  { provider: "gcp.gemini", name: "gemini-3.6-flash", limits: GEMINI_FLASH_LIMITS },
  { provider: "gcp.gemini", name: "gemini-3.5-flash", limits: GEMINI_FLASH_LIMITS },
  { provider: "gcp.gemini", name: "gemini-3-flash-preview", limits: GEMINI_FLASH_LIMITS },
];

// Represents Groq's models, in the order the router tries them.
export const GROQ_MODELS: readonly Model[] = [
  { provider: "groq", name: "openai/gpt-oss-120b", limits: GROQ_LIMITS },
  { provider: "groq", name: "openai/gpt-oss-20b", limits: GROQ_LIMITS },
];
