import {
  DEFAULT_LANGUAGE,
  getLanguageDisplayName,
  resolveLanguage,
  supportedLanguageNames,
  toSupportedLanguage,
} from "../../translation/language";
import { setUserLanguageOverride } from "../../translation/userLanguage";
import type { Env } from "../../env";
import { Logger } from "../../logging/logger";
import type { Replier } from "../replier";
import type { TelegramMessage } from "../telegramTypes";

const PREFIX = "/lang";

const logger = new Logger("langCommandHandler");

export function isLangCommand(text: string | undefined): boolean {
  return text?.startsWith(PREFIX) ?? false;
}

export async function langCommandHandler(
  env: Env,
  message: TelegramMessage,
  replier: Replier,
  defaultTimezone: string,
): Promise<void> {
  const arg = (message.text ?? "").slice(PREFIX.length).trim();
  const userId = message.from.id;

  if (!arg) {
    await replier.say("LANG_USAGE");
    return;
  }

  if (arg.toLowerCase() === "auto") {
    await setUserLanguageOverride(env, userId, null, defaultTimezone);
    logger.info("language override cleared");
    await replier
      .withLang(toSupportedLanguage(message.from.language_code) ?? DEFAULT_LANGUAGE)
      .say("LANG_RESET_CONFIRMATION");
    return;
  }

  const resolved = resolveLanguage(arg);
  if (!resolved) {
    logger.info("language not supported");
    await replier.say("LANG_NOT_SUPPORTED", supportedLanguageNames());
    return;
  }

  await setUserLanguageOverride(env, userId, resolved, defaultTimezone);
  logger.info("language override set", { language: resolved });
  await replier
    .withLang(resolved)
    .say("LANG_SET_CONFIRMATION", getLanguageDisplayName(resolved));
}
