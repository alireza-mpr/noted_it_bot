import type { User } from "./user";

// Represents the result of saving a user: saved, with the new version; or not
// saved, because another update changed the user since it was loaded.
export type UserSaveResult =
  | { ok: true; savedUser: User }
  | { ok: false; reason: "changed-since-load" };

// Represents where users are stored. A port: the database adapter implements
// it. A repository: it loads and saves a whole user.
export interface UserRepository {
  // Returns the stored user, or null for a user the bot has never seen.
  load(userId: number): Promise<User | null>;
  // Saves the user, if nobody changed it since it was loaded (the same
  // version). A user with version 0 is new, and is created.
  save(user: User): Promise<UserSaveResult>;
}
