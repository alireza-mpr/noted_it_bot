import { newUser, type User } from "../domain/user/user";
import { isSameProfile, type UserProfile } from "../domain/user/user-profile";
import type { UserRepository } from "../domain/user/user-repository";

// A burst of parallel updates from one user makes saves lose races, but only
// while quota units are left; see ADR-3 in ARCHITECTURE_DECISIONS_REGISTRY.md.
const MAX_SAVE_ATTEMPTS = 10;

// Represents a change to a user: the changed user, or null when there is
// nothing to save, and what the change found out.
export interface UserChange<ChangeOutcome> {
  changedUser: User | null;
  changeOutcome: ChangeOutcome;
}

// Returns the user of an update: loaded, or created on first contact. Saves
// the profile from Telegram when it changed, e.g. a new name.
export async function loadUserOfUpdate(
  userRepository: UserRepository,
  userId: number,
  userProfile: UserProfile,
): Promise<User> {
  const storedUser = await userRepository.load(userId);
  const loadedUser = storedUser ?? newUser(userId, userProfile);
  const { user } = await updateUser(userRepository, loadedUser, (currentUser) => ({
    changedUser:
      currentUser.version > 0 && isSameProfile(currentUser.profile, userProfile)
        ? null
        : { ...currentUser, profile: userProfile },
    changeOutcome: null,
  }));
  return user;
}

// Applies the change to the loaded user, and saves the result. If another
// update changed the user since it was loaded, loads it again and applies the
// change again, up to 10 times. Returns the saved user and what the change
// found out.
export async function updateUser<ChangeOutcome>(
  userRepository: UserRepository,
  loadedUser: User,
  change: (user: User) => UserChange<ChangeOutcome>,
): Promise<{ user: User; changeOutcome: ChangeOutcome }> {
  let currentUser = loadedUser;
  for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt++) {
    const { changedUser, changeOutcome } = change(currentUser);
    if (changedUser === null) {
      return { user: currentUser, changeOutcome };
    }
    const saveResult = await userRepository.save(changedUser);
    if (saveResult.ok) {
      return { user: saveResult.savedUser, changeOutcome };
    }
    currentUser = await reloadedUser(userRepository, currentUser.id);
  }
  throw new Error(`user ${loadedUser.id} kept changing: not saved after ${MAX_SAVE_ATTEMPTS} attempts`);
}

async function reloadedUser(userRepository: UserRepository, userId: number): Promise<User> {
  const storedUser = await userRepository.load(userId);
  if (storedUser === null) {
    throw new Error(`user ${userId} lost a save race, but is not stored`);
  }
  return storedUser;
}
