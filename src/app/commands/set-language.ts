import { Logger } from "../../adapters/logging/logger";
import { logUserActivity } from "../../adapters/logging/user-activity";
import type { Replier } from "../../adapters/telegram/replier";
import type { BotEdition } from "../../domain/bot-edition/bot-edition";
import { replyLanguageOf } from "../../domain/user/reply-language-rule";
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "../../domain/user/supported-language";
import type { User } from "../../domain/user/user";
import type { UserRepository } from "../../domain/user/user-repository";
import { fillPlaceholders } from "../../generic/text/fill-placeholders";
import { truncateText } from "../../generic/text/truncate-text";
import { languageNameOf, parseLanguageName } from "../../i18n/language-name";
import { translate } from "../../i18n/translation";
import { updateUser } from "../update-user";

const LOGGER = new Logger<"language_command.not_supported">("set-language");
const AUTO_LANGUAGE_TEXT = "auto";
const MAX_LOGGED_LANGUAGE_TEXT_LENGTH = 100;

// Represents what /lang needs. language is the reply language before the
// command.
export interface SetLanguageContext {
  botEdition: BotEdition;
  userRepository: UserRepository;
  replier: Replier;
  language: SupportedLanguage;
}

// Replies to /lang, and saves the user's choice. languageText is the text
// after /lang, or null when there is none:
// - null: shows the reply language, and how to change it;
// - "auto": goes back to the language the rule picks when the user chose
//   none, e.g. the Telegram app's language;
// - a language, e.g. "fa" or "Persian": replies in it from now on.
export async function setLanguage(
  user: User,
  languageText: string | null,
  setLanguageContext: SetLanguageContext,
): Promise<void> {
  const { botEdition, userRepository, replier, language } = setLanguageContext;
  if (languageText === null) {
    await replier.sendText(currentLanguageTextOf(language));
    return;
  }

  if (languageText.trim().toLowerCase() === AUTO_LANGUAGE_TEXT) {
    const savedUser = await saveChosenLanguage(user, null, userRepository);
    logUserActivity("language_reset");
    await replier.sendText(
      translate(
        "LANG_RESET_CONFIRMATION",
        replyLanguageOf(savedUser, botEdition).language,
      ),
    );
    return;
  }

  const chosenLanguage = parseLanguageName(languageText);
  if (chosenLanguage === null) {
    LOGGER.info("language_command.not_supported", {
      "language_command.language_text": truncateText(
        languageText,
        MAX_LOGGED_LANGUAGE_TEXT_LENGTH,
      ),
    });
    await replier.sendText(
      fillPlaceholders(translate("LANG_NOT_SUPPORTED", language), [
        supportedLanguageNamesText(),
      ]),
    );
    return;
  }

  await saveChosenLanguage(user, chosenLanguage, userRepository);
  logUserActivity("language_set", { "user_activity.language": chosenLanguage });
  await replier.sendText(
    fillPlaceholders(translate("LANG_SET_CONFIRMATION", chosenLanguage), [
      languageNameOf(chosenLanguage),
    ]),
  );
}

// Returns the reply language by its own name, and on a new line how to
// change it.
function currentLanguageTextOf(language: SupportedLanguage): string {
  const currentLanguageLine = fillPlaceholders(
    translate("LANG_CURRENT", language),
    [languageNameOf(language)],
  );
  return `${currentLanguageLine}\n${translate("LANG_CHANGE_HINT", language)}`;
}

// Saves the language the user chose, or null to go back to the Telegram
// language. Returns the saved user.
async function saveChosenLanguage(
  user: User,
  chosenLanguage: SupportedLanguage | null,
  userRepository: UserRepository,
): Promise<User> {
  const { user: savedUser } = await updateUser(
    userRepository,
    user,
    (currentUser) => ({
      changedUser: {
        ...currentUser,
        settings: { ...currentUser.settings, language: chosenLanguage },
      },
      changeOutcome: null,
    }),
  );
  return savedUser;
}

// Returns every supported language by its own name, e.g. "English, فارسی, …".
function supportedLanguageNamesText(): string {
  return SUPPORTED_LANGUAGES.map(languageNameOf).join(", ");
}
