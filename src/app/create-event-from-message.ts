import { exceptionAttributesOf } from "../adapters/logging/log-event";
import { Logger } from "../adapters/logging/logger";
import { logUserActivity } from "../adapters/logging/user-activity";
import { extractDraft } from "../adapters/models/extraction/extract-draft";
import type { Router } from "../adapters/models/router";
import type { Replier } from "../adapters/telegram/replier";
import { APP_CONFIG } from "../config/app-config";
import { createCalendarEvent } from "../domain/calendar-event/create-calendar-event";
import { eventUidOf } from "../domain/calendar-event/event-uid-rule";
import type { QuotaReservation } from "../domain/quota/usage-store";
import type { UserQuotaPolicy } from "../domain/quota/user-quota-policy";
import {
  timeZoneNamed,
  type IanaTimeZone,
} from "../generic/date-time/time-zone";
import { formatTimeUntil } from "../generic/intl/localized-time-span";
import { fillPlaceholders } from "../generic/text/fill-placeholders";
import type { BotMessageId } from "../i18n/bot-message";
import type { SupportedLanguage } from "../i18n/supported-language";
import { translate } from "../i18n/translation";
import { calendarFileOf } from "../output/calendar-file";
import { captionOf } from "../output/caption";
import { quotaLineOf } from "../output/quota-line";

const LOGGER = new Logger<EventRequestEventName>("create-event-from-message");
const FLOATING_TIME_ZONE = timeZoneNamed(APP_CONFIG.floatingTimeZoneName);

// Represents a message that asks for a calendar event: who sent it, and its
// text. The text is null when the message has none, e.g. a sticker.
export interface EventRequest {
  userId: number;
  messageText: string | null;
}

// Represents what creating an event from a message needs. userQuotaPolicy is
// null when the daily quota is off (APP_CONFIG.enforceUserDailyQuota).
export interface EventRequestContext {
  router: Pick<Router, "ask">;
  userQuotaPolicy: UserQuotaPolicy | null;
  replier: Replier;
  language: SupportedLanguage;
  userTimeZone: IanaTimeZone | null;
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

  const quotaStep = await consumeQuota(
    eventRequest.userId,
    eventRequestContext,
  );
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
    quotaStep.kind === "consumed" ? quotaStep.remainingQuota : null,
    eventRequestContext,
  );
  if (!modelAnswered && quotaStep.kind === "consumed") {
    await refundQuota(quotaStep.quotaReservation, eventRequestContext);
  }
}

// Represents the result of the quota step: no quota in use, a unit
// consumed, or none left.
type QuotaStep =
  | { kind: "quota-off" }
  | {
      kind: "consumed";
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

async function consumeQuota(
  userId: number,
  eventRequestContext: EventRequestContext,
): Promise<QuotaStep> {
  const userQuotaPolicy = eventRequestContext.userQuotaPolicy;
  if (userQuotaPolicy === null) {
    return { kind: "quota-off" };
  }
  const quotaResult = await userQuotaPolicy.tryConsume(
    userId,
    eventRequestContext.now,
  );
  if (!quotaResult.ok) {
    return { kind: "used-up", retryAt: quotaResult.retryAt };
  }
  LOGGER.info("quota.consumed", { "quota.remaining": quotaResult.remaining });
  return {
    kind: "consumed",
    remainingQuota: quotaResult.remaining,
    quotaReservation: quotaResult.reservation,
  };
}

// Sends the reply to the message: the calendar file, or why there is none.
// Returns false when no model gave a usable answer, so the quota unit is
// given back.
async function replyWithCalendarEvent(
  messageText: string,
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
      userTimeZone: eventRequestContext.userTimeZone,
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

// Gives the quota unit back. If that fails, it is only logged: the user
// already has a reply.
async function refundQuota(
  quotaReservation: QuotaReservation,
  eventRequestContext: EventRequestContext,
): Promise<void> {
  try {
    await eventRequestContext.userQuotaPolicy?.refund(quotaReservation);
    LOGGER.info("quota.refunded", {
      "quota.remaining": quotaReservation.previousRemainingQuota,
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
