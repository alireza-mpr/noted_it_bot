import { UserPreferenceRepository } from "../repositories/userPreferenceRepository";

export interface UserLanguageEnv {
  USAGE_DB: D1Database;
}

// An explicit /lang choice overrides Telegram's auto-detected
// message.from.language_code for all of that user's future replies.
// A null language means "auto-detect".
export async function getUserLanguageOverride(env: UserLanguageEnv, userId: number): Promise<string | null> {
  return new UserPreferenceRepository(env.USAGE_DB).getLang(userId);
}

export async function setUserLanguageOverride(
  env: UserLanguageEnv,
  userId: number,
  lang: string | null,
  defaultTimezone: string,
): Promise<void> {
  await new UserPreferenceRepository(env.USAGE_DB).setLang(userId, lang, defaultTimezone);
}
