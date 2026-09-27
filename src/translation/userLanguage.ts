import { UserPreferenceRepository } from "../repositories/userPreferenceRepository";

export interface UserLanguageEnv {
  USAGE_DB: D1Database;
}

// A /lang choice replaces Telegram's language (message.from.language_code) for
// all of that user's future replies. A null language means "use Telegram's".
export async function setUserLanguageOverride(
  env: UserLanguageEnv,
  userId: number,
  lang: string | null,
): Promise<void> {
  await new UserPreferenceRepository(env.USAGE_DB).setLang(userId, lang);
}
