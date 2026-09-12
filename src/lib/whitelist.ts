export interface WhitelistEnv {
  WHITELIST: KVNamespace;
}

// Entries are added manually via `wrangler kv key put` — see README. A user
// passes if EITHER their username OR their numeric Telegram user id is
// whitelisted:
// - by username (lowercase, no @) — lets you proactively whitelist someone
//   before they've ever messaged the bot, just from knowing their @handle.
// - by id, stored as "id:<numeric id>" — the only option for a user with no
//   public username (it's optional in Telegram), since there's nothing to
//   look up by name in that case. The bot's own rejection message includes
//   the user's id so it can be relayed for this.
export async function isWhitelisted(
  env: WhitelistEnv,
  username: string | undefined,
  userId: number | undefined
): Promise<boolean> {
  if (username) {
    const byUsername = await env.WHITELIST.get(username.toLowerCase());
    if (byUsername !== null) {
      return true;
    }
  }

  if (userId !== undefined) {
    const byId = await env.WHITELIST.get(`id:${userId}`);
    if (byId !== null) {
      return true;
    }
  }

  return false;
}
