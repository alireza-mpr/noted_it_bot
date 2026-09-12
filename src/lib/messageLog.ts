export interface MessageLogEnv {
  MESSAGE_LOG: KVNamespace;
}

export interface MessageLogEntry {
  username: string | null;
  receivedMessage: string;
  geminiRequest: string;
  geminiResponse: string;
}

const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days, per the /start disclosure ("I may keep your messages to fix bugs")

// Best-effort: a logging failure should never affect the actual reply, so
// callers don't need to (and shouldn't) await-and-handle this specially.
export async function logMessage(env: MessageLogEnv, entry: MessageLogEntry): Promise<void> {
  try {
    const key = `${Date.now()}-${crypto.randomUUID()}`;
    const value = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
    await env.MESSAGE_LOG.put(key, value, { expirationTtl: TTL_SECONDS });
  } catch (err) {
    console.error("logMessage: threw", err);
  }
}
