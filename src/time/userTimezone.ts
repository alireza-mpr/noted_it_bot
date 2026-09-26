import { UserPreferenceRepository } from "../repositories/userPreferenceRepository";

export interface UserTimezoneEnv {
  USAGE_DB: D1Database;
}

export async function getUserTimezone(
  env: UserTimezoneEnv,
  userId: number,
  defaultTimezone: string,
): Promise<string> {
  return new UserPreferenceRepository(env.USAGE_DB).getTimezone(userId, defaultTimezone);
}

export async function setUserTimezone(env: UserTimezoneEnv, userId: number, timezone: string): Promise<void> {
  await new UserPreferenceRepository(env.USAGE_DB).setTimezone(userId, timezone);
}
