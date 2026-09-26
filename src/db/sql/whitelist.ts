export const CREATE_WHITELIST_TABLE = `
CREATE TABLE IF NOT EXISTS whitelist (
  userId INTEGER NOT NULL PRIMARY KEY
)`;

export const SELECT_WHITELISTED_USER = `
SELECT userId
FROM whitelist
WHERE userId = ?`;
