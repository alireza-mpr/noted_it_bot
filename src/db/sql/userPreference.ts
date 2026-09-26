export const CREATE_USER_PREFERENCE_TABLE = `
CREATE TABLE IF NOT EXISTS user_preference (
  userId   INTEGER NOT NULL PRIMARY KEY,
  lang     TEXT,
  timezone TEXT NOT NULL
)`;

export const SELECT_USER_PREFERENCE = `
SELECT userId, lang, timezone
FROM user_preference
WHERE userId = ?`;

export const SET_USER_LANG = `
INSERT INTO user_preference (userId, lang, timezone)
VALUES (?, ?, ?)
ON CONFLICT(userId) DO UPDATE SET
  lang = excluded.lang`;

export const SET_USER_TIMEZONE = `
INSERT INTO user_preference (userId, lang, timezone)
VALUES (?, NULL, ?)
ON CONFLICT(userId) DO UPDATE SET
  timezone = excluded.timezone`;
