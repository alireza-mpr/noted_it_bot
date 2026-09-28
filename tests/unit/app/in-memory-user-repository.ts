import type { User } from "../../../src/domain/user/user";
import type { UserRepository, UserSaveResult } from "../../../src/domain/user/user-repository";

// Represents a user repository in memory. Like the D1 one, it saves a user
// only if its version is still the stored one, and counts its reads and
// writes.
export class InMemoryUserRepository implements UserRepository {
  readonly storedUsers = new Map<number, User>();
  loadCount = 0;
  saveCount = 0;

  constructor(users: User[] = []) {
    for (const user of users) {
      this.storedUsers.set(user.id, user);
    }
  }

  async load(userId: number): Promise<User | null> {
    this.loadCount++;
    await Promise.resolve();
    return this.storedUsers.get(userId) ?? null;
  }

  async save(user: User): Promise<UserSaveResult> {
    this.saveCount++;
    await Promise.resolve();
    const storedVersion = this.storedUsers.get(user.id)?.version ?? 0;
    if (storedVersion !== user.version) {
      return { ok: false, reason: "changed-since-load" };
    }
    const savedUser = { ...user, version: user.version + 1 };
    this.storedUsers.set(user.id, savedUser);
    return { ok: true, savedUser };
  }
}
