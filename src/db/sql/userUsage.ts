export const QUOTA_RESET_AFTER_MS = 24 * 60 * 60 * 1000;

const QUOTA_EXPIRED = `(?1 - lastUsedAt >= ${QUOTA_RESET_AFTER_MS})`;
const EFFECTIVE_REMAINING = `(CASE WHEN ${QUOTA_EXPIRED} THEN ?3 ELSE remainingQuota END)`;

export const CREATE_USER_USAGE_TABLE = `
CREATE TABLE IF NOT EXISTS user_usage (
  userId         INTEGER NOT NULL PRIMARY KEY,
  remainingQuota INTEGER NOT NULL CHECK (remainingQuota >= 0),
  lastUsedAt     INTEGER NOT NULL DEFAULT 0
)`;

export const SELECT_USER_USAGE = `
SELECT
  userId,
  ${EFFECTIVE_REMAINING} AS remainingQuota,
  lastUsedAt
FROM user_usage
WHERE userId = ?2`;

export const CONSUME_USER_QUOTA = `
INSERT INTO user_usage (userId, remainingQuota, lastUsedAt)
VALUES (?2, ?3 - 1, ?1)
ON CONFLICT(userId) DO UPDATE SET
  remainingQuota = ${EFFECTIVE_REMAINING} - 1,
  lastUsedAt     = excluded.lastUsedAt
WHERE ${EFFECTIVE_REMAINING} > 0`;

// Undoes one CONSUME_USER_QUOTA made at ?2. If no other consume has touched the
// row since, it goes back exactly to how it was, lastUsedAt included, so an
// unanswered message doesn't push the reset time out. Otherwise one unit is
// given back.
export const REFUND_USER_QUOTA = `
UPDATE user_usage SET
  remainingQuota = CASE WHEN lastUsedAt = ?2 THEN ?3 ELSE MIN(remainingQuota + 1, ?5) END,
  lastUsedAt     = CASE WHEN lastUsedAt = ?2 THEN ?4 ELSE lastUsedAt END
WHERE userId = ?1`;
