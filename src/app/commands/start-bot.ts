import { logUserActivity } from "../../adapters/logging/user-activity";
import type { Replier } from "../../adapters/telegram/replier";
import type { SupportedLanguage } from "../../domain/user/supported-language";
import { formatNumber } from "../../generic/intl/localized-number";
import { fillPlaceholders } from "../../generic/text/fill-placeholders";
import { translate } from "../../i18n/translation";

// The bot's name is never translated.
const BOT_NAME = "Noted";

// Replies to /start: what the bot does, and the daily quota. dailyQuota is
// null when the daily quota is off (APP_CONFIG.enforceUserDailyQuota).
export async function startBot(
  dailyQuota: number | null,
  replier: Replier,
  language: SupportedLanguage,
): Promise<void> {
  logUserActivity("bot_started");
  const welcomeText = fillPlaceholders(translate("START_MESSAGE", language), [
    BOT_NAME,
  ]);
  await replier.sendText(
    dailyQuota === null
      ? welcomeText
      : `${welcomeText}\n\n${quotaNoteOf(dailyQuota, language)}`,
  );
}

function quotaNoteOf(dailyQuota: number, language: SupportedLanguage): string {
  return fillPlaceholders(translate("START_QUOTA_NOTE", language), [
    formatNumber(dailyQuota, language),
  ]);
}
