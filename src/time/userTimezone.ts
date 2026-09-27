import { UserPreferenceRepository } from "../repositories/userPreferenceRepository";

export interface UserTimezoneEnv {
  USAGE_DB: D1Database;
}

export async function setUserTimezone(env: UserTimezoneEnv, userId: number, timezone: string): Promise<void> {
  await new UserPreferenceRepository(env.USAGE_DB).setTimezone(userId, timezone);
}
