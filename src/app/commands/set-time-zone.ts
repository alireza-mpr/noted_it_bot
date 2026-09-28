import { logUserActivity } from "../../adapters/logging/user-activity";
import type { Replier } from "../../adapters/telegram/replier";
import {
  OPEN_TOKEN_TTL_MS,
  signTimeZoneLinkToken,
} from "../../adapters/web/time-zone-link-token";
import type { SupportedLanguage } from "../../domain/user/supported-language";
import type { User } from "../../domain/user/user";
import type { UserRepository } from "../../domain/user/user-repository";
import { parseUserTimeZoneName } from "../../domain/user/user-time-zone-rule";
import { translate } from "../../i18n/translation";
import { saveUserTimeZone } from "../save-user-time-zone";
import { TIME_ZONE_PAGE_PATH } from "../time-zone-page";

// Represents what /tz needs. workerOrigin is the Worker's address, for the
// link, e.g. "https://noted-it.example.workers.dev".
export interface SetTimeZoneContext {
  userRepository: UserRepository;
  replier: Replier;
  language: SupportedLanguage;
  webhookSecret: string;
  workerOrigin: string;
  now: Date;
}

// Replies to /tz. timeZoneText is the text after /tz, or null when there is
// none:
// - an exact time zone name, e.g. "Asia/Tehran": saves it;
// - anything else, e.g. nothing or "Melbourne": sends a link button to the
//   time zone page.
export async function setTimeZone(
  user: User,
  timeZoneText: string | null,
  setTimeZoneContext: SetTimeZoneContext,
): Promise<void> {
  const timeZone =
    timeZoneText === null ? null : parseUserTimeZoneName(timeZoneText);
  if (timeZone === null) {
    await sendTimeZoneLink(user, setTimeZoneContext);
    return;
  }
  await saveUserTimeZone(user, timeZone, "command", setTimeZoneContext);
}

// Sends a link button to the time zone page. The link works for one minute.
async function sendTimeZoneLink(
  user: User,
  setTimeZoneContext: SetTimeZoneContext,
): Promise<void> {
  const { replier, language, webhookSecret, workerOrigin, now } =
    setTimeZoneContext;
  const openToken = await signTimeZoneLinkToken(webhookSecret, {
    userId: user.id,
    username: user.profile?.username ?? null,
    firstName: user.profile?.firstName ?? null,
    language,
    purpose: "open",
    expiresAtMs: now.getTime() + OPEN_TOKEN_TTL_MS,
  });
  logUserActivity("time_zone_link_sent");
  await replier.sendTextWithLinkButton(translate("TZ_LINK_MESSAGE", language), {
    label: translate("TZ_BUTTON_LABEL", language),
    url: `${workerOrigin}${TIME_ZONE_PAGE_PATH}?token=${openToken}`,
  });
}
