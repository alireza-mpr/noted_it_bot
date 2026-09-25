export const CREATE_GEMINI_USAGE_TABLE = `
CREATE TABLE IF NOT EXISTS gemini_usage (
  model    TEXT NOT NULL PRIMARY KEY,
  day      TEXT NOT NULL,
  minute   TEXT NOT NULL,
  aestTime TEXT NOT NULL,
  rpm      INTEGER NOT NULL DEFAULT 0,
  tpm      INTEGER NOT NULL DEFAULT 0,
  rpd      INTEGER NOT NULL DEFAULT 0,
  lastError     TEXT NOT NULL DEFAULT '',
  lastErrorAest TEXT NOT NULL DEFAULT '',
  lastSuccessAest TEXT NOT NULL DEFAULT ''
)`;

export const SELECT_GEMINI_EFFECTIVE_USAGE = `
SELECT
  model,
  CASE WHEN minute = ? THEN rpm ELSE 0 END AS rpm,
  CASE WHEN minute = ? THEN tpm ELSE 0 END AS tpm,
  CASE WHEN day    = ? THEN rpd ELSE 0 END AS rpd
FROM gemini_usage`;

export const RECORD_GEMINI_USAGE = `
INSERT INTO gemini_usage (model, day, minute, aestTime, rpm, tpm, rpd, lastSuccessAest)
VALUES (?, ?, ?, ?, 1, ?, 1, ?)
ON CONFLICT(model) DO UPDATE SET
  rpd    = CASE WHEN day    = excluded.day    THEN rpd + 1 ELSE 1 END,
  rpm    = CASE WHEN minute = excluded.minute THEN rpm + 1 ELSE 1 END,
  tpm    = CASE WHEN minute = excluded.minute THEN tpm + excluded.tpm ELSE excluded.tpm END,
  day    = excluded.day,
  minute = excluded.minute,
  aestTime = excluded.aestTime,
  lastSuccessAest = excluded.lastSuccessAest`;

export const MARK_GEMINI_MINUTE_EXHAUSTED = `
INSERT INTO gemini_usage (model, day, minute, aestTime, rpm, tpm, rpd)
VALUES (?, ?, ?, ?, ?, 0, 0)
ON CONFLICT(model) DO UPDATE SET
  rpm    = MAX(CASE WHEN minute = excluded.minute THEN rpm ELSE 0 END, excluded.rpm),
  tpm    = CASE WHEN minute = excluded.minute THEN tpm ELSE 0 END,
  rpd    = CASE WHEN day    = excluded.day    THEN rpd ELSE 0 END,
  day    = excluded.day,
  minute = excluded.minute,
  aestTime = excluded.aestTime`;

export const MARK_GEMINI_DAY_EXHAUSTED = `
INSERT INTO gemini_usage (model, day, minute, aestTime, rpm, tpm, rpd)
VALUES (?, ?, ?, ?, 0, 0, ?)
ON CONFLICT(model) DO UPDATE SET
  rpm    = CASE WHEN minute = excluded.minute THEN rpm ELSE 0 END,
  tpm    = CASE WHEN minute = excluded.minute THEN tpm ELSE 0 END,
  rpd    = MAX(CASE WHEN day = excluded.day THEN rpd ELSE 0 END, excluded.rpd),
  day    = excluded.day,
  minute = excluded.minute,
  aestTime = excluded.aestTime`;

export const RECORD_GEMINI_ERROR = `
INSERT INTO gemini_usage (model, day, minute, aestTime, lastError, lastErrorAest)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(model) DO UPDATE SET
  lastError     = excluded.lastError,
  lastErrorAest = excluded.lastErrorAest`;
