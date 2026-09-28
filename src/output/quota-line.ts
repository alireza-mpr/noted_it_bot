import { formatNumber } from "../generic/intl/localized-number";
import { fillPlaceholders } from "../generic/text/fill-placeholders";
import type { SupportedLanguage } from "../i18n/supported-language";
import { translate } from "../i18n/translation";

// Returns the line that says how many requests the user has left today, in
// the language, with the number in the language's digits.
export function quotaLineOf(
  remainingQuota: number,
  language: SupportedLanguage,
): string {
  return fillPlaceholders(translate("USER_DAILY_QUOTA_REMAINING", language), [
    formatNumber(remainingQuota, language),
  ]);
}
