export interface WhitelistEnv {
  WHITELIST: KVNamespace;
}

// Usernames are added manually via `wrangler kv key put` — see README. Stored
// lowercase (Telegram usernames are case-insensitive) so lookups don't depend
// on matching case exactly.
export async function isWhitelisted(env: WhitelistEnv, username: string | undefined): Promise<boolean> {
  if (!username) {
    return false;
  }
  const value = await env.WHITELIST.get(username.toLowerCase());
  return value !== null;
}
