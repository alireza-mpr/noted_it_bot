import {
  TZ_NOT_UNDERSTOOD,
  TZ_SET_CONFIRMATION,
  TZ_USAGE,
} from "../../interactiveMessages/messages";
import { Logger } from "../../logging/logger";
import type { Router } from "../../router/router";
import { resolveTimezoneFromHint } from "../../time/timezoneHint";
import { setUserTimezone, type UserTimezoneEnv } from "../../time/userTimezone";
import type { Replier } from "../replier";
import type { TelegramMessage } from "../telegramTypes";

const logger = new Logger("tzCommandHandler");

export function isTzCommand(text: string | undefined): boolean {
  return /^\/tz(@\w+)?(\s|$)/.test(text ?? "");
}

export async function tzCommandHandler(
  env: UserTimezoneEnv,
  router: Router,
  message: TelegramMessage,
  replier: Replier,
): Promise<void> {
  const arg = (message.text ?? "").replace(/^\/tz(@\w+)?/, "").trim();

  if (!arg) {
    await replier.say(TZ_USAGE);
    return;
  }

  const timezone = await resolveTimezoneFromHint(router, arg);
  if (!timezone) {
    logger.info("time zone not understood");
    await replier.say(TZ_NOT_UNDERSTOOD, arg);
    return;
  }

  await setUserTimezone(env, message.from.id, timezone);
  logger.info("timezone set", { timezone });
  await replier.say(TZ_SET_CONFIRMATION, timezone);
}
