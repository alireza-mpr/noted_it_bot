export const CREATE_GROQ_USAGE_TABLE = `
CREATE TABLE IF NOT EXISTS groq_usage (
  model    TEXT NOT NULL PRIMARY KEY,
  aestTime TEXT NOT NULL DEFAULT '',
  retryAfterUntil INTEGER NOT NULL DEFAULT 0,
  lastError       TEXT NOT NULL DEFAULT '',
  lastErrorAest   TEXT NOT NULL DEFAULT '',
  lastSuccessAest TEXT NOT NULL DEFAULT ''
)`;

export const SELECT_GROQ_USAGE = `
SELECT model, retryAfterUntil
FROM groq_usage`;

export const RECORD_GROQ_USAGE = `
INSERT INTO groq_usage (model, aestTime, lastSuccessAest)
VALUES (?, ?, ?)
ON CONFLICT(model) DO UPDATE SET
  aestTime        = excluded.aestTime,
  lastSuccessAest = excluded.lastSuccessAest`;

export const MARK_GROQ_EXHAUSTED = `
INSERT INTO groq_usage (model, aestTime, retryAfterUntil)
VALUES (?, ?, ?)
ON CONFLICT(model) DO UPDATE SET
  aestTime        = excluded.aestTime,
  retryAfterUntil = excluded.retryAfterUntil`;

export const RECORD_GROQ_ERROR = `
INSERT INTO groq_usage (model, aestTime, lastError, lastErrorAest)
VALUES (?, ?, ?, ?)
ON CONFLICT(model) DO UPDATE SET
  lastError     = excluded.lastError,
  lastErrorAest = excluded.lastErrorAest`;
