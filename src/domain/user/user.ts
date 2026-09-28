import type { QuotaUsage } from "../quota/quota-usage";
import type { UserProfile } from "./user-profile";
import type { UserSettings } from "./user-settings";

// Represents a user who talks to the bot. An entity and aggregate root: its
// identity is its id. The user repository loads and saves it as a whole. The
// version tells whether another update changed the user since it was loaded.
// The profile is null for a user copied from the old tables, until the user
// sends an update.
export interface User {
  id: number;
  profile: UserProfile | null;
  settings: UserSettings;
  quotaUsage: QuotaUsage;
  version: number;
}

// Returns a user the bot sees for the first time: no settings chosen, the
// daily quota not used yet, and not saved yet (version 0).
export function newUser(userId: number, userProfile: UserProfile): User {
  return {
    id: userId,
    profile: userProfile,
    settings: { language: null, timeZone: null },
    quotaUsage: { kind: "unused" },
    version: 0,
  };
}
