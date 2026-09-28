import type { QuotaUsage } from "../../domain/quota/quota-usage";
import { parseLanguageCode } from "../../domain/user/supported-language";
import type { User } from "../../domain/user/user";
import type { UserProfile } from "../../domain/user/user-profile";
import type {
  UserRepository,
  UserSaveResult,
} from "../../domain/user/user-repository";
import { parseTimeZoneName } from "../../generic/date-time/time-zone";
import { batchWithTable } from "./batch-with-table";

// One row per user: the profile, the settings, the quota usage and the
// version. A profile with no first name is not known yet, and a quota usage
// with no lastUsedAt was never used.
const CREATE_USERS_TABLE = `
CREATE TABLE IF NOT EXISTS users (
  userId               INTEGER NOT NULL PRIMARY KEY,
  username             TEXT,
  firstName            TEXT,
  lastName             TEXT,
  telegramLanguageCode TEXT,
  language             TEXT,
  timeZone             TEXT,
  remainingQuota       INTEGER,
  lastUsedAt           INTEGER,
  version              INTEGER NOT NULL
)`;

const SELECT_USER = `
SELECT *
FROM users
WHERE userId = ?`;

// Creates the user at version 1, unless another update created it first.
const INSERT_USER = `
INSERT INTO users (username, firstName, lastName, telegramLanguageCode,
  language, timeZone, remainingQuota, lastUsedAt, userId, version)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
ON CONFLICT(userId) DO NOTHING`;

// Writes the user only if its version is still the loaded one.
const UPDATE_USER = `
UPDATE users SET
  username = ?, firstName = ?, lastName = ?, telegramLanguageCode = ?,
  language = ?, timeZone = ?, remainingQuota = ?, lastUsedAt = ?,
  version = version + 1
WHERE userId = ? AND version = ?`;

// Represents the users stored in D1, one row per user. A save writes only if
// nobody changed the user since it was loaded (optimistic concurrency). See
// ADR-2 and ADR-3 in ARCHITECTURE_DECISIONS.md.
export class D1UserRepository implements UserRepository {
  constructor(private readonly d1Database: D1Database) {}

  // Returns the stored user, or null for a user the bot has never seen.
  async load(userId: number): Promise<User | null> {
    const [d1Result] = await this.batch<UserRow>(
      this.d1Database.prepare(SELECT_USER).bind(userId),
    );
    const userRow = d1Result.results[0] ?? null;
    return userRow === null ? null : userOf(userRow);
  }

  // Saves the user, if nobody changed it since it was loaded. A user with
  // version 0 is new, and is created.
  async save(user: User): Promise<UserSaveResult> {
    const rowValues = rowValuesOf(user);
    const statement =
      user.version === 0
        ? this.d1Database.prepare(INSERT_USER).bind(...rowValues, user.id)
        : this.d1Database
            .prepare(UPDATE_USER)
            .bind(...rowValues, user.id, user.version);
    const [d1Result] = await this.batch(statement);
    return d1Result.meta.changes === 0
      ? { ok: false, reason: "changed-since-load" }
      : { ok: true, savedUser: { ...user, version: user.version + 1 } };
  }

  private batch<Row = unknown>(
    statement: D1PreparedStatement,
  ): Promise<D1Result<Row>[]> {
    return batchWithTable<Row>(this.d1Database, CREATE_USERS_TABLE, [statement]);
  }
}

// Represents a users row.
interface UserRow {
  userId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  telegramLanguageCode: string | null;
  language: string | null;
  timeZone: string | null;
  remainingQuota: number | null;
  lastUsedAt: number | null;
  version: number;
}

// Returns the user in a row, with every stored value parsed once.
function userOf(userRow: UserRow): User {
  return {
    id: userRow.userId,
    profile: profileOf(userRow),
    settings: {
      language: userRow.language === null ? null : parseLanguageCode(userRow.language),
      timeZone: userRow.timeZone === null ? null : parseTimeZoneName(userRow.timeZone),
    },
    quotaUsage: quotaUsageOf(userRow),
    version: userRow.version,
  };
}

function profileOf(userRow: UserRow): UserProfile | null {
  return userRow.firstName === null
    ? null
    : {
        username: userRow.username,
        firstName: userRow.firstName,
        lastName: userRow.lastName,
        telegramLanguageCode: userRow.telegramLanguageCode,
      };
}

function quotaUsageOf(userRow: UserRow): QuotaUsage {
  return userRow.remainingQuota === null || userRow.lastUsedAt === null
    ? { kind: "unused" }
    : {
        kind: "used",
        remainingQuota: userRow.remainingQuota,
        lastUsedAt: new Date(userRow.lastUsedAt),
      };
}

// Returns the row's values, in the order of INSERT_USER and UPDATE_USER.
function rowValuesOf(user: User): (string | number | null)[] {
  const { profile, settings, quotaUsage } = user;
  return [
    profile?.username ?? null,
    profile?.firstName ?? null,
    profile?.lastName ?? null,
    profile?.telegramLanguageCode ?? null,
    settings.language,
    settings.timeZone,
    quotaUsage.kind === "used" ? quotaUsage.remainingQuota : null,
    quotaUsage.kind === "used" ? quotaUsage.lastUsedAt.getTime() : null,
  ];
}
