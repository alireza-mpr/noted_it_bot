export const CREATE_GROQ_USAGE_TABLE = `
CREATE TABLE IF NOT EXISTS groq_usage (
  model    TEXT NOT NULL PRIMARY KEY,
  aestTime TEXT NOT NULL DEFAULT '',
  remainingRequests INTEGER,
  resetRequestsAt   INTEGER NOT NULL DEFAULT 0,
  retryAfterUntil   INTEGER NOT NULL DEFAULT 0,
  lastError       TEXT NOT NULL DEFAULT '',
  lastErrorAest   TEXT NOT NULL DEFAULT '',
  lastSuccessAest TEXT NOT NULL DEFAULT ''
)`;
