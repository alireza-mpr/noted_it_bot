// Represents the Worker's bindings: its variables, its secrets and its D1
// database.
export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  APP_VERSION: string;
  BOT_EDITION: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
  AXIOM_TOKEN: string;
  USAGE_DB: D1Database;
}
