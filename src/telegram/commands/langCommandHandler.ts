import {
  LANG_NOT_UNDERSTOOD,
  LANG_RESET_CONFIRMATION,
  LANG_SET_CONFIRMATION,
  LANG_USAGE,
} from "../../interactiveMessages/messages";
import {
  DEFAULT_LANGUAGE,
  getLanguageDisplayName,
  resolveLanguageCode,
} from "../../translation/language";
import { setUserLanguageOverride } from "../../translation/userLanguage";
import type { Env } from "../../env";
import { Logger } from "../../logging/logger";
import type { Router } from "../../router/router";
import type { Replier } from "../replier";
import type { TelegramMessage } from "../telegramTypes";

const PREFIX = "/lang";

const logger = new Logger("langCommandHandler");

export function isLangCommand(text: string | undefined): boolean {
  return text?.startsWith(PREFIX) ?? false;
}

export async function langCommandHandler(
  env: Env,
  router: Router,
  message: TelegramMessage,
  replier: Replier,
  defaultTimezone: string,
): Promise<void> {
  const arg = (message.text ?? "").slice(PREFIX.length).trim();
  const userId = message.from.id;

  if (!arg) {
    await replier.say(LANG_USAGE);
    return;
  }

  if (arg.toLowerCase() === "auto") {
    await setUserLanguageOverride(env, userId, null, defaultTimezone);
    logger.info("language override cleared");
    await replier
      .withLang(message.from.language_code ?? DEFAULT_LANGUAGE)
      .say(LANG_RESET_CONFIRMATION);
    return;
  }

  const resolved = await resolveLanguageCode(router, arg);
  if (!resolved) {
    await replier.say(LANG_NOT_UNDERSTOOD, arg);
    return;
  }

  await setUserLanguageOverride(env, userId, resolved, defaultTimezone);
  logger.info("language override set", { language: resolved });
  await replier
    .withLang(resolved)
    .say(LANG_SET_CONFIRMATION, getLanguageDisplayName(resolved));
}
