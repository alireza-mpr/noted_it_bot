import { exceptionAttributesOf } from "../adapters/logging/log-event";
import { Logger } from "../adapters/logging/logger";
import { logUserActivity } from "../adapters/logging/user-activity";
import { extractDraft } from "../adapters/models/extraction/extract-draft";
import type { Router } from "../adapters/models/router";
import type { Replier } from "../adapters/telegram/replier";
import { APP_CONFIG } from "../config/app-config";
import { createCalendarEvent } from "../domain/calendar-event/create-calendar-event";
import { eventUidOf } from "../domain/calendar-event/event-uid-rule";
import {
  consumeUnit,
  refundUnit,
  remainingQuotaOf,
  type QuotaReservation,
} from "../domain/quota/daily-quota-rule";
import type { User } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user-repository";
import { timeZoneNamed } from "../generic/date-time/time-zone";
import { formatTimeUntil } from "../generic/intl/localized-time-span";
import { fillPlaceholders } from "../generic/text/fill-placeholders";
import type { BotMessageId } from "../i18n/bot-message";
import type { SupportedLanguage } from "../domain/user/supported-language";
import { translate } from "../i18n/translation";
import { calendarFileOf } from "../output/calendar-file";
import { captionOf } from "../output/caption";
import { quotaLineOf } from "../output/quota-line";
import { updateUser } from "./update-user";

const LOGGER = new Logger<EventRequestEventName>("create-event-from-message");
const FLOATING_TIME_ZONE = timeZoneNamed(APP_CONFIG.floatingTimeZoneName);

// Represents a message that asks for a calendar event: the user who sent it,
// and its text. The text is null when the message has none, e.g. a sticker.
export interface EventRequest {
  user: User;
  messageText: string | null;
}

// Represents what creating an event from a message needs. dailyQuota is null
// when the daily quota is off (APP_CONFIG.enforceUserDailyQuota).
export interface EventRequestContext {
  router: Pick<Router, "ask">;
  userRepository: UserRepository;
  dailyQuota: number | null;
  replier: Replier;
  language: SupportedLanguage;
  now: Date;
}

// Creates a calendar event from a message, and sends it to the user: the
// calendar file with its caption. Only a message that goes to a model uses a
// unit of the daily quota. The unit is given back when no model answers.
export async function createEventFromMessage(
  eventRequest: EventRequest,
  eventRequestContext: EventRequestContext,
): Promise<void> {
  const { replier, language } = eventRequestContext;
  if (eventRequest.messageText === null) {
    logUserActivity("event_requested", { "user_activity.outcome": "no_text" });
    await replier.sendText(translate("NO_TEXT_MESSAGE", language));
    return;
  }

  const quotaStep = await consumeQuota(eventRequest.user, eventRequestContext);
  if (quotaStep.kind === "used-up") {
    logUserActivity("quota_used_up");
    const waitTime = formatTimeUntil(
      eventRequestContext.now,
      quotaStep.retryAt,
      language,
    );
    await replier.sendText(
      fillPlaceholders(translate("USER_DAILY_QUOTA_EXCEEDED", language), [
        waitTime,
      ]),
    );
    return;
  }

  const modelAnswered = await replyWithCalendarEvent(
    eventRequest.messageText,
    eventRequest.user,
    quotaStep.kind === "consumed" ? quotaStep.remainingQuota : null,
    eventRequestContext,
  );
  if (!modelAnswered && quotaStep.kind === "consumed") {
    await refundQuota(quotaStep, eventRequestContext);
  }
}

// Represents the result of the quota step: no quota in use, a unit consumed
// (with the saved user, for a refund), or none left.
type QuotaStep =
  | { kind: "quota-off" }
  | {
      kind: "consumed";
      savedUser: User;
      dailyQuota: number;
      remainingQuota: number;
      quotaReservation: QuotaReservation;
    }
  | { kind: "used-up"; retryAt: Date };

// Represents the event names of this use case.
type EventRequestEventName =
  | "quota.consumed"
  | "quota.refunded"
  | "quota.refund_failed"
  | "event_request.notice_failed";

// Consumes one unit of the user's daily quota, and saves the user. A user
// with no unit left costs no write.
async function consumeQuota(
  user: User,
  eventRequestContext: EventRequestContext,
): Promise<QuotaStep> {
  const { dailyQuota, now } = eventRequestContext;
  if (dailyQuota === null) {
    return { kind: "quota-off" };
  }
  const { user: savedUser, changeOutcome: consumeResult } = await updateUser(
    eventRequestContext.userRepository,
    user,
    (currentUser) => {
      const consumeResult = consumeUnit(currentUser.quotaUsage, dailyQuota, now);
      return {
        changedUser: consumeResult.ok
          ? { ...currentUser, quotaUsage: consumeResult.quotaUsage }
          : null,
        changeOutcome: consumeResult,
      };
    },
  );
  if (!consumeResult.ok) {
    return { kind: "used-up", retryAt: consumeResult.retryAt };
  }
  LOGGER.info("quota.consumed", { "quota.remaining": consumeResult.remainingQuota });
  return {
    kind: "consumed",
    savedUser,
    dailyQuota,
    remainingQuota: consumeResult.remainingQuota,
    quotaReservation: consumeResult.quotaReservation,
  };
}

// Sends the reply to the message: the calendar file, or why there is none.
// Returns false when no model gave a usable answer, so the quota unit is
// given back.
async function replyWithCalendarEvent(
  messageText: string,
  user: User,
  remainingQuota: number | null,
  eventRequestContext: EventRequestContext,
): Promise<boolean> {
  const { replier, language, now } = eventRequestContext;
  const extractionResult = await extractDraft(
    eventRequestContext.router,
    messageText,
    () => sendExtractingNotice(eventRequestContext),
  );
  if (!extractionResult.ok) {
    switch (extractionResult.reason) {
      case "no-model":
      case "unusable-answer":
        logEventRequested(
          extractionResult.reason === "no-model"
            ? "no_model"
            : "unusable_answer",
        );
        await replier.sendText(
          translate("NO_AVAILABLE_MODEL_MESSAGE", language),
        );
        return false;
      case "no-event":
      case "repeat-declined":
        await replyWithNoEvent(
          extractionResult.reason,
          remainingQuota,
          eventRequestContext,
        );
        return true;
    }
  }

  const calendarEventResult = createCalendarEvent(
    extractionResult.draft,
    await eventUidOf(messageText),
    {
      userTimeZone: user.settings.timeZone,
      now,
      floatingTimeZone: FLOATING_TIME_ZONE,
    },
  );
  if (!calendarEventResult.ok) {
    await replyWithNoEvent(
      calendarEventResult.reason,
      remainingQuota,
      eventRequestContext,
    );
    return true;
  }

  const calendarEvent = calendarEventResult.calendarEvent;
  logEventRequested("created", {
    "user_activity.repeats": calendarEvent.repeat !== null,
    "user_activity.all_day": calendarEvent.time.kind === "all-day",
  });
  await replier.sendCalendarFile(
    calendarFileOf(calendarEvent, language, now),
    captionOf(calendarEvent, language, remainingQuota),
  );
  return true;
}

// Tells the user that the bot is reading the message. If it cannot be sent,
// the bot still goes on.
async function sendExtractingNotice(
  eventRequestContext: EventRequestContext,
): Promise<void> {
  try {
    await eventRequestContext.replier.sendText(
      translate("EXTRACTING_EVENT_MESSAGE", eventRequestContext.language),
    );
  } catch (error) {
    LOGGER.warn("event_request.notice_failed", exceptionAttributesOf(error));
  }
}

async function replyWithNoEvent(
  reason: "no-event" | "repeat-declined",
  remainingQuota: number | null,
  eventRequestContext: EventRequestContext,
): Promise<void> {
  const { replier, language } = eventRequestContext;
  logEventRequested(reason === "no-event" ? "no_event" : "repeat_declined");
  const botMessageId: BotMessageId =
    reason === "no-event"
      ? "NO_CALENDAR_EVENT_MESSAGE"
      : "REPEAT_DECLINED_MESSAGE";
  const replyText = translate(botMessageId, language);
  await replier.sendText(
    remainingQuota === null
      ? replyText
      : `${replyText}\n\n${quotaLineOf(remainingQuota, language)}`,
  );
}

// Gives the quota unit back, and saves the user. It starts from the user
// saved by the consume, so it costs no read. If it fails, it is only logged:
// the user already has a reply.
async function refundQuota(
  consumedQuotaStep: Extract<QuotaStep, { kind: "consumed" }>,
  eventRequestContext: EventRequestContext,
): Promise<void> {
  const { savedUser, quotaReservation, dailyQuota } = consumedQuotaStep;
  try {
    const { user: refundedUser } = await updateUser(
      eventRequestContext.userRepository,
      savedUser,
      (currentUser) => ({
        changedUser: {
          ...currentUser,
          quotaUsage: refundUnit(currentUser.quotaUsage, quotaReservation, dailyQuota),
        },
        changeOutcome: null,
      }),
    );
    LOGGER.info("quota.refunded", {
      "quota.remaining": remainingQuotaOf(
        refundedUser.quotaUsage,
        dailyQuota,
        eventRequestContext.now,
      ),
    });
  } catch (error) {
    LOGGER.error("quota.refund_failed", exceptionAttributesOf(error));
  }
}

function logEventRequested(
  outcome:
    | "created"
    | "no_event"
    | "repeat_declined"
    | "no_model"
    | "unusable_answer",
  outcomeAttributes: Record<string, boolean> = {},
): void {
  logUserActivity("event_requested", {
    "user_activity.outcome": outcome,
    ...outcomeAttributes,
  });
}
