import { logUserActivity } from "../../adapters/logging/user-activity";
import type { Replier } from "../../adapters/telegram/replier";
import type { DailyQuota } from "../../domain/quota/daily-quota";
import type { SupportedLanguage } from "../../domain/user/supported-language";
import { formatNumber } from "../../generic/intl/localized-number";
import { fillPlaceholders } from "../../generic/text/fill-placeholders";
import { translate } from "../../i18n/translation";

// Replies to /help: how the bot works, what the user can set, and the daily
// quota when it is on and shown (APP_CONFIG.showDailyQuota).
export async function showHelp(
  dailyQuota: DailyQuota,
  isDailyQuotaShown: boolean,
  replier: Replier,
  language: SupportedLanguage,
): Promise<void> {
  logUserActivity("help_requested");
  const helpText = translate("HELP_MESSAGE", language);
  await replier.sendText(
    dailyQuota.kind === "limited" && isDailyQuotaShown
      ? `${helpText}\n\n${quotaNoteOf(dailyQuota.unitsPerDay, language)}`
      : helpText,
  );
}

function quotaNoteOf(unitsPerDay: number, language: SupportedLanguage): string {
  return fillPlaceholders(translate("HELP_QUOTA_NOTE", language), [
    formatNumber(unitsPerDay, language),
  ]);
}
