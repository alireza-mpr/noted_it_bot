export interface UserLanguageEnv {
  USER_LANG: KVNamespace;
}

// An explicit /lang choice overrides Telegram's auto-detected
// message.from.language_code for all of that chat's future replies.
export async function getUserLanguageOverride(env: UserLanguageEnv, chatId: number): Promise<string | null> {
  return env.USER_LANG.get(`chat:${chatId}`);
}

export async function setUserLanguageOverride(env: UserLanguageEnv, chatId: number, lang: string): Promise<void> {
  await env.USER_LANG.put(`chat:${chatId}`, lang);
}

export async function clearUserLanguageOverride(env: UserLanguageEnv, chatId: number): Promise<void> {
  await env.USER_LANG.delete(`chat:${chatId}`);
}
