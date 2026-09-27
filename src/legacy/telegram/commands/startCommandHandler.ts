import type { AppConfig } from "../../appConfig/appConfig";
import type { Replier } from "../replier";

export async function startCommandHandler(
  replier: Replier,
  config: AppConfig,
): Promise<void> {
  const welcome = replier.translate("START_MESSAGE", "Noted");
  if (!config.enforceUserDailyQuota) {
    await replier.sendPlain(welcome);
    return;
  }

  const quotaNote = replier.translate("START_QUOTA_NOTE", String(config.dailyQuota));
  await replier.sendPlain(`${welcome}\n\n${quotaNote}`);
}
