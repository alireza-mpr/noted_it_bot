import { logUserActivity } from "../../adapters/logging/user-activity";
import type { Replier } from "../../adapters/telegram/replier";
import type { SupportedLanguage } from "../../domain/user/supported-language";
import { fillPlaceholders } from "../../generic/text/fill-placeholders";
import { translate } from "../../i18n/translation";

// The bot's name is never translated.
const BOT_NAME = "Noted";

// Replies to /start: a short welcome with the user's first name, one example
// to try, and a pointer to /help.
export async function startBot(
  firstName: string,
  replier: Replier,
  language: SupportedLanguage,
): Promise<void> {
  logUserActivity("bot_started");
  await replier.sendText(
    fillPlaceholders(translate("START_MESSAGE", language), [
      firstName,
      BOT_NAME,
    ]),
  );
}
