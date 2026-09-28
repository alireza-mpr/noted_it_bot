import { describe, expect, it } from "vitest";
import { loadUserOfUpdate, updateUser } from "../../../src/app/update-user";
import { newUser, type User } from "../../../src/domain/user/user";
import { InMemoryUserRepository } from "./in-memory-user-repository";

const USER_ID = 42;
const ALICE = { username: "alice", firstName: "Alice", lastName: null, telegramLanguageCode: "fa" };

// Returns a user stored at version 3.
function storedAlice(): User {
  return { ...newUser(USER_ID, ALICE), version: 3 };
}

describe("loadUserOfUpdate", () => {
  it("creates a user on first contact, with the profile", async () => {
    const userRepository = new InMemoryUserRepository();

    const user = await loadUserOfUpdate(userRepository, USER_ID, ALICE);

    expect(user).toMatchObject({ id: USER_ID, profile: ALICE, version: 1 });
    expect(userRepository.storedUsers.get(USER_ID)).toEqual(user);
  });

  it("loads a known user with one read and no write when the profile is the same", async () => {
    const userRepository = new InMemoryUserRepository([storedAlice()]);

    expect(await loadUserOfUpdate(userRepository, USER_ID, ALICE)).toEqual(storedAlice());
    expect([userRepository.loadCount, userRepository.saveCount]).toEqual([1, 0]);
  });

  it("saves a new name from Telegram", async () => {
    const userRepository = new InMemoryUserRepository([storedAlice()]);
    const renamedAlice = { ...ALICE, lastName: "Smith" };

    expect(await loadUserOfUpdate(userRepository, USER_ID, renamedAlice)).toMatchObject({
      profile: renamedAlice,
      version: 4,
    });
  });
});

describe("updateUser", () => {
  it("saves the changed user, and returns what the change found out", async () => {
    const userRepository = new InMemoryUserRepository([storedAlice()]);

    const { user, changeOutcome } = await updateUser(userRepository, storedAlice(), (currentUser) => ({
      changedUser: { ...currentUser, settings: { ...currentUser.settings, language: "de" } },
      changeOutcome: "changed",
    }));

    expect(changeOutcome).toBe("changed");
    expect(user).toMatchObject({ settings: { language: "de" }, version: 4 });
    expect(userRepository.loadCount).toBe(0);
  });

  it("saves nothing when the change has nothing to save", async () => {
    const userRepository = new InMemoryUserRepository([storedAlice()]);

    await updateUser(userRepository, storedAlice(), () => ({ changedUser: null, changeOutcome: null }));

    expect(userRepository.saveCount).toBe(0);
  });

  it("loads again and applies the change again when another update won the race", async () => {
    const userRepository = new InMemoryUserRepository([{ ...storedAlice(), version: 4, settings: { language: "fr", timeZone: null } }]);
    const seenLanguages: (string | null)[] = [];

    const { user } = await updateUser(userRepository, storedAlice(), (currentUser) => {
      seenLanguages.push(currentUser.settings.language);
      return { changedUser: { ...currentUser, profile: { ...ALICE, lastName: "Smith" } }, changeOutcome: null };
    });

    expect(seenLanguages).toEqual([null, "fr"]);
    expect(user).toMatchObject({ settings: { language: "fr" }, profile: { lastName: "Smith" }, version: 5 });
  });

  it("gives up after 10 lost races", async () => {
    const userRepository = new InMemoryUserRepository([storedAlice()]);
    userRepository.save = async () => ({ ok: false, reason: "changed-since-load" });

    await expect(
      updateUser(userRepository, storedAlice(), (currentUser) => ({ changedUser: currentUser, changeOutcome: null })),
    ).rejects.toThrow("not saved after 10 attempts");
  });
});
