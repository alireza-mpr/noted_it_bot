export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  APP_VERSION: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
  AXIOM_TOKEN: string;
  I18N: KVNamespace;
  USER_LANG: KVNamespace;
  MESSAGE_LOG: KVNamespace;
  USAGE_DB: D1Database;
}
