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
import {
  clearUserLanguageOverride,
  setUserLanguageOverride,
} from "../../translation/userLanguage";
import type { Env } from "../../env";
import type { Router } from "../../router/router";
import type { Replier } from "../replier";
import type { TelegramMessage } from "../telegramTypes";

const PREFIX = "/lang";

export function isLangCommand(text: string | undefined): boolean {
  return text?.startsWith(PREFIX) ?? false;
}

export async function langCommandHandler(
  env: Env,
  router: Router,
  message: TelegramMessage,
  replier: Replier,
): Promise<void> {
  const arg = (message.text ?? "").slice(PREFIX.length).trim();
  const chatId = message.chat.id;

  if (!arg) {
    await replier.say(LANG_USAGE);
    return;
  }

  if (arg.toLowerCase() === "auto") {
    await clearUserLanguageOverride(env, chatId);
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

  await setUserLanguageOverride(env, chatId, resolved);
  await replier
    .withLang(resolved)
    .say(LANG_SET_CONFIRMATION, getLanguageDisplayName(resolved));
}
