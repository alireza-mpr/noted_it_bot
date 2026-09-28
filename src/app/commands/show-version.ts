import { logUserActivity } from "../../adapters/logging/user-activity";
import type { Replier } from "../../adapters/telegram/replier";

// Replies to /ver with the running version, e.g. "0.2.41-beta-1a2b3c4".
export async function showVersion(
  appVersion: string,
  replier: Replier,
): Promise<void> {
  logUserActivity("version_requested");
  await replier.sendText(appVersion);
}
