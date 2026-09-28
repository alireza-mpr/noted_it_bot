import { exceptionAttributesOf } from "../adapters/logging/log-event";
import { Logger } from "../adapters/logging/logger";
import { logUserActivity } from "../adapters/logging/user-activity";
import type { Replier } from "../adapters/telegram/replier";
import type { SupportedLanguage } from "../domain/user/supported-language";
import type { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user-repository";
import type { IanaTimeZone } from "../generic/date-time/time-zone";
import { fillPlaceholders } from "../generic/text/fill-placeholders";
import { translate } from "../i18n/translation";
import { updateUser } from "./update-user";

const LOGGER = new Logger<"time_zone.confirmation_failed">(
  "save-user-time-zone",
);

// Represents where the user set the time zone: with /tz and a zone name, or
// on the time zone page.
export type TimeZoneSetVia = "command" | "page";

// Represents what saving a time zone needs. language is the language of the
// confirmation.
export interface SaveUserTimeZoneContext {
  userRepository: UserRepository;
  replier: Replier;
  language: SupportedLanguage;
}

// Saves the time zone the user chose, and confirms it in Telegram. If the
// confirmation cannot be sent, the time zone stays saved.
export async function saveUserTimeZone(
  user: User,
  timeZone: IanaTimeZone,
  timeZoneSetVia: TimeZoneSetVia,
  saveUserTimeZoneContext: SaveUserTimeZoneContext,
): Promise<void> {
  const { userRepository, replier, language } = saveUserTimeZoneContext;
  await updateUser(userRepository, user, (currentUser) => ({
    changedUser: {
      ...currentUser,
      settings: { ...currentUser.settings, timeZone },
    },
    changeOutcome: null,
  }));
  logUserActivity("time_zone_set", {
    "user_activity.time_zone": timeZone,
    "user_activity.via": timeZoneSetVia,
  });
  try {
    await replier.sendText(
      fillPlaceholders(translate("TZ_SET_CONFIRMATION", language), [timeZone]),
    );
  } catch (error) {
    LOGGER.warn("time_zone.confirmation_failed", exceptionAttributesOf(error));
  }
}
