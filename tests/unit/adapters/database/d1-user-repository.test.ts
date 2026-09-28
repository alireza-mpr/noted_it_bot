import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1UserRepository } from "../../../../src/adapters/database/d1-user-repository";
import { updateUser } from "../../../../src/app/update-user";
import { consumeUnit } from "../../../../src/domain/quota/daily-quota-rule";
import { newUser, type User } from "../../../../src/domain/user/user";
import { timeZoneNamed } from "../../../../src/generic/date-time/time-zone";

const TEST_DB = (env as unknown as { TEST_DB: D1Database }).TEST_DB;
const USER_ID = 42;
const NOW = new Date("2026-09-28T10:00:00Z");
const ALICE = { username: "alice", firstName: "Alice", lastName: null, telegramLanguageCode: "fa" };

describe("D1UserRepository", () => {
  let userRepository: D1UserRepository;

  beforeEach(async () => {
    await TEST_DB.exec("DROP TABLE IF EXISTS users");
    userRepository = new D1UserRepository(TEST_DB);
  });

  // Saves the user, and fails the test if the save lost a race.
  async function saved(user: User): Promise<User> {
    const saveResult = await userRepository.save(user);
    if (!saveResult.ok) {
      throw new Error("expected the save to succeed");
    }
    return saveResult.savedUser;
  }

  it("gives null for a user it has never seen", async () => {
    expect(await userRepository.load(USER_ID)).toBeNull();
  });

  it("creates a new user at version 1, and loads it back", async () => {
    const createdUser = await saved(newUser(USER_ID, ALICE));

    expect(createdUser.version).toBe(1);
    expect(await userRepository.load(USER_ID)).toEqual(createdUser);
  });

  it("keeps every field: profile, settings and quota usage", async () => {
    const createdUser = await saved(newUser(USER_ID, ALICE));
    const changedUser: User = {
      ...createdUser,
      profile: { ...ALICE, lastName: "Smith" },
      settings: { language: "fa", timeZone: timeZoneNamed("Asia/Tehran") },
      quotaUsage: { kind: "used", remainingQuota: 3, lastUsedAt: NOW },
    };

    expect(await userRepository.load(USER_ID)).toEqual(createdUser);
    await saved(changedUser);
    expect(await userRepository.load(USER_ID)).toEqual({ ...changedUser, version: 2 });
  });

  it("refuses a save when another update changed the user since it was loaded", async () => {
    const loadedUser = await saved(newUser(USER_ID, ALICE));
    await saved({ ...loadedUser, settings: { ...loadedUser.settings, language: "de" } });

    expect(await userRepository.save({ ...loadedUser, settings: { ...loadedUser.settings, language: "fr" } })).toEqual({
      ok: false,
      reason: "changed-since-load",
    });
    expect((await userRepository.load(USER_ID))?.settings.language).toBe("de");
  });

  it("refuses to create a user that another update created first", async () => {
    await saved(newUser(USER_ID, ALICE));

    expect(await userRepository.save(newUser(USER_ID, ALICE))).toEqual({ ok: false, reason: "changed-since-load" });
  });

  it("reads a stored language or time zone the bot does not accept as not chosen", async () => {
    await saved(newUser(USER_ID, ALICE));
    await TEST_DB.prepare("UPDATE users SET language = 'xx', timeZone = 'Mars/Olympus' WHERE userId = ?").bind(USER_ID).run();

    expect((await userRepository.load(USER_ID))?.settings).toEqual({ language: null, timeZone: null });
  });

  it("reads a user copied from the old tables, with no names yet, as having no profile", async () => {
    await saved(newUser(USER_ID, ALICE));
    await TEST_DB.prepare("UPDATE users SET username = NULL, firstName = NULL WHERE userId = ?").bind(USER_ID).run();

    expect((await userRepository.load(USER_ID))?.profile).toBeNull();
  });

  it("lets exactly 5 of a burst of 10 parallel messages use the 5 units left", async () => {
    const loadedUser = await saved(newUser(USER_ID, ALICE));

    const consumeResults = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const { changeOutcome } = await updateUser(userRepository, loadedUser, (currentUser) => {
          const consumeResult = consumeUnit(currentUser.quotaUsage, 5, NOW);
          return {
            changedUser: consumeResult.ok ? { ...currentUser, quotaUsage: consumeResult.quotaUsage } : null,
            changeOutcome: consumeResult,
          };
        });
        return changeOutcome;
      }),
    );

    expect(consumeResults.filter((consumeResult) => consumeResult.ok)).toHaveLength(5);
    expect((await userRepository.load(USER_ID))?.quotaUsage).toMatchObject({ remainingQuota: 0 });
  });
});
