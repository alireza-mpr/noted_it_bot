import { Logger } from "../adapters/logging/logger";
import { logUserActivity } from "../adapters/logging/user-activity";
import { setUserLogAttributes } from "../adapters/logging/user-log-attributes";
import { TelegramReplier } from "../adapters/telegram/replier";
import type { TelegramClient } from "../adapters/telegram/telegram-client";
import { requestLanguageOf } from "../adapters/web/request-language";
import {
  SAVE_TOKEN_TTL_MS,
  signTimeZoneLinkToken,
  verifyTimeZoneLinkToken,
  type TimeZoneLinkPurpose,
  type TimeZoneLinkTokenResult,
} from "../adapters/web/time-zone-link-token";
import {
  messagePageOf,
  newNonce,
  pageHeadersOf,
  timeZonePageOf,
} from "../adapters/web/time-zone-page";
import { parseTimeZoneSaveRequest } from "../adapters/web/time-zone-save-request";
import type { SupportedLanguage } from "../domain/user/supported-language";
import type { UserRepository } from "../domain/user/user-repository";
import { parseUserTimeZoneName } from "../domain/user/user-time-zone-rule";
import { truncateText } from "../generic/text/truncate-text";
import { translate } from "../i18n/translation";
import { saveUserTimeZone } from "./save-user-time-zone";

const LOGGER = new Logger<TimeZonePageEventName>("time-zone-page");
const MAX_LOGGED_TIME_ZONE_NAME_LENGTH = 64;
const LOGGED_REFUSAL_REASONS: Record<TokenRefusalReason, string> = {
  malformed: "malformed",
  "bad-signature": "bad_signature",
  "wrong-purpose": "wrong_purpose",
  expired: "expired",
};

// The path of the time zone page. The page's script saves to
// TIME_ZONE_SAVE_PATH.
export const TIME_ZONE_PAGE_PATH = "/tz";
export const TIME_ZONE_SAVE_PATH = "/tz/save";

// Represents what the time zone page and its save need.
export interface TimeZonePageContext {
  webhookSecret: string;
  userRepository: UserRepository;
  telegramClient: Pick<TelegramClient, "sendMessage" | "sendDocument">;
  now: Date;
}

// Returns the time zone page for a /tz link (GET /tz?token=…), with a new
// token that lets the page save for 10 minutes. A link that has expired or is
// not valid gets a 403 page that says so, in the browser's language.
export async function openTimeZonePage(
  request: Request,
  timeZonePageContext: TimeZonePageContext,
): Promise<Response> {
  const { webhookSecret, now } = timeZonePageContext;
  const openToken = new URL(request.url).searchParams.get("token") ?? "";
  const tokenResult = await verifyTimeZoneLinkToken(
    webhookSecret,
    openToken,
    "open",
    now.getTime(),
  );
  if (!tokenResult.ok) {
    logTokenRefused("open", tokenResult.reason);
    return expiredPageResponseOf(requestLanguageOf(request));
  }

  const { payload } = tokenResult;
  setUserLogAttributes(payload.userId, payload.username, payload.firstName);
  const saveToken = await signTimeZoneLinkToken(webhookSecret, {
    ...payload,
    purpose: "save",
    expiresAtMs: now.getTime() + SAVE_TOKEN_TTL_MS,
  });
  logUserActivity("time_zone_page_opened");
  const nonce = newNonce();
  return new Response(timeZonePageOf(payload.language, saveToken, nonce), {
    headers: pageHeadersOf(nonce),
  });
}

// Saves the time zone the user picked on the page (POST /tz/save), and
// confirms it in Telegram. The user comes only from the save token, never
// from the body. Returns JSON, e.g. { ok: true, timezone: "Asia/Tehran" } or
// { ok: false, error: "expired" }; the page's script reads the 403 as expired.
export async function saveTimeZoneFromPage(
  request: Request,
  timeZonePageContext: TimeZonePageContext,
): Promise<Response> {
  const { webhookSecret, userRepository, telegramClient, now } =
    timeZonePageContext;
  const saveRequestResult = parseTimeZoneSaveRequest(await request.text());
  if (!saveRequestResult.ok) {
    return saveRequestResult.reason === "too-large"
      ? saveFailureResponseOf(413, "too_large")
      : saveFailureResponseOf(400, "bad_request");
  }

  const tokenResult = await verifyTimeZoneLinkToken(
    webhookSecret,
    saveRequestResult.token,
    "save",
    now.getTime(),
  );
  if (!tokenResult.ok) {
    logTokenRefused("save", tokenResult.reason);
    return saveFailureResponseOf(403, "expired");
  }

  const { payload } = tokenResult;
  setUserLogAttributes(payload.userId, payload.username, payload.firstName);
  const timeZone = parseUserTimeZoneName(saveRequestResult.timeZoneName);
  if (timeZone === null) {
    LOGGER.warn("time_zone_page.time_zone_refused", {
      "time_zone_page.time_zone_name": truncateText(
        saveRequestResult.timeZoneName,
        MAX_LOGGED_TIME_ZONE_NAME_LENGTH,
      ),
    });
    return saveFailureResponseOf(400, "invalid_timezone");
  }

  const user = await userRepository.load(payload.userId);
  if (user === null) {
    LOGGER.warn("time_zone_page.user_not_found");
    return saveFailureResponseOf(404, "unknown_user");
  }
  await saveUserTimeZone(user, timeZone, "page", {
    userRepository,
    // A private chat's id is the user's id.
    replier: new TelegramReplier(telegramClient, payload.userId),
    language: payload.language,
  });
  return jsonResponseOf(200, { ok: true, timezone: timeZone });
}

// Represents the event names of the time zone page.
type TimeZonePageEventName =
  | "time_zone_page.token_refused"
  | "time_zone_page.time_zone_refused"
  | "time_zone_page.user_not_found";

// Represents why a token is refused, e.g. "expired".
type TokenRefusalReason = Extract<
  TimeZoneLinkTokenResult,
  { ok: false }
>["reason"];

function logTokenRefused(
  tokenPurpose: TimeZoneLinkPurpose,
  tokenRefusalReason: TokenRefusalReason,
): void {
  LOGGER.warn("time_zone_page.token_refused", {
    "time_zone_page.token_purpose": tokenPurpose,
    "time_zone_page.refusal_reason": LOGGED_REFUSAL_REASONS[tokenRefusalReason],
  });
}

function expiredPageResponseOf(language: SupportedLanguage): Response {
  const nonce = newNonce();
  return new Response(
    messagePageOf(language, translate("PAGE_EXPIRED", language), nonce),
    { status: 403, headers: pageHeadersOf(nonce) },
  );
}

function saveFailureResponseOf(httpStatus: number, error: string): Response {
  return jsonResponseOf(httpStatus, { ok: false, error });
}

function jsonResponseOf(httpStatus: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
