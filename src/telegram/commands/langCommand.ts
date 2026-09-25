import {
  LANG_NOT_UNDERSTOOD,
  LANG_RESET_CONFIRMATION,
  LANG_SET_CONFIRMATION,
  LANG_STATUS_AUTO,
  LANG_STATUS_MANUAL,
} from "../../lib/interactiveMessages/messages";
import {
  getLanguageDisplayName,
  resolveLanguageCode,
} from "../../lib/translation/language";
import {
  clearUserLanguageOverride,
  setUserLanguageOverride,
} from "../../lib/translation/userLanguage";
import type { CommandHandler } from "../botContext";

const PREFIX = "/lang";

export function isLangCommand(text: string | undefined): boolean {
  return text?.startsWith(PREFIX) ?? false;
}

export const langCommand: CommandHandler = async ({
  env,
  message,
  replier,
  lang,
  langOverride,
}) => {
  const arg = (message.text ?? "").slice(PREFIX.length).trim();
  const chatId = message.chat.id;

  if (!arg) {
    await replier.say(
      langOverride ? LANG_STATUS_MANUAL : LANG_STATUS_AUTO,
      getLanguageDisplayName(lang ?? "en"),
    );
    return;
  }

  if (arg.toLowerCase() === "auto") {
    await clearUserLanguageOverride(env, chatId);
    await replier.withLang(message.from?.language_code).say(LANG_RESET_CONFIRMATION);
    return;
  }

  const resolved = await resolveLanguageCode(env, arg);
  if (!resolved) {
    await replier.say(LANG_NOT_UNDERSTOOD, arg);
    return;
  }

  await setUserLanguageOverride(env, chatId, resolved);
  await replier
    .withLang(resolved)
    .say(LANG_SET_CONFIRMATION, getLanguageDisplayName(resolved));
};
