export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  APP_VERSION: string;
  GEMINI_API_KEY: string;
  I18N: KVNamespace;
  USER_LANG: KVNamespace;
  MESSAGE_LOG: KVNamespace;
  WHITELIST: KVNamespace;
  GEMINI_USAGE_DB: D1Database;
}
