import { exceptionAttributesOf } from "../adapters/logging/log-event";
import { Logger } from "../adapters/logging/logger";
import { logUserActivity } from "../adapters/logging/user-activity";
import { extractDraft } from "../adapters/models/extraction/extract-draft";
import type { Router } from "../adapters/models/router";
import type { Replier } from "../adapters/telegram/replier";
import { APP_CONFIG } from "../config/app-config";
import {
  createCalendarEvent,
  type CalendarEventResult,
} from "../domain/calendar-event/create-calendar-event";
import { eventUidOf } from "../domain/calendar-event/event-uid-rule";
import type { DailyQuota } from "../domain/quota/daily-quota";
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
const NO_EVENT_MESSAGE_IDS: Record<NoEventReason, BotMessageId> = {
  "no-event": "NO_CALENDAR_EVENT_MESSAGE",
  "repeat-declined": "REPEAT_DECLINED_MESSAGE",
  "time-zone-needed": "TIME_ZONE_NEEDED_MESSAGE",
};
const NO_EVENT_OUTCOMES: Record<NoEventReason, EventRequestedOutcome> = {
  "no-event": "no_event",
  "repeat-declined": "repeat_declined",
  "time-zone-needed": "time_zone_needed",
};

// Represents a message that asks for a calendar event: the user who sent it,
// and its text. The text is null when the message has none, e.g. a sticker.
export interface EventRequest {
  user: User;
  messageText: string | null;
}

// Represents what creating an event from a message needs. When
// isDailyQuotaShown is false, the replies leave out the units left; a user
// who used them all up is still told.
export interface EventRequestContext {
  router: Pick<Router, "ask">;
  userRepository: UserRepository;
  dailyQuota: DailyQuota;
  isDailyQuotaShown: boolean;
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
    quotaStep.kind === "consumed" && eventRequestContext.isDailyQuotaShown
      ? quotaStep.remainingQuota
      : null,
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
      unitsPerDay: number;
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
  if (dailyQuota.kind === "off") {
    return { kind: "quota-off" };
  }
  const { unitsPerDay } = dailyQuota;
  const { user: savedUser, changeOutcome: consumeResult } = await updateUser(
    eventRequestContext.userRepository,
    user,
    (currentUser) => {
      const consumeResult = consumeUnit(currentUser.quotaUsage, unitsPerDay, now);
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
    unitsPerDay,
    remainingQuota: consumeResult.remainingQuota,
    quotaReservation: consumeResult.quotaReservation,
  };
}

// Sends the reply to the message: the calendar file, or why there is none.
// remainingQuota is null when the reply does not show the units left.
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
  reason: NoEventReason,
  remainingQuota: number | null,
  eventRequestContext: EventRequestContext,
): Promise<void> {
  const { replier, language } = eventRequestContext;
  logEventRequested(NO_EVENT_OUTCOMES[reason]);
  const replyText = translate(NO_EVENT_MESSAGE_IDS[reason], language);
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
  const { savedUser, quotaReservation, unitsPerDay } = consumedQuotaStep;
  try {
    const { user: refundedUser } = await updateUser(
      eventRequestContext.userRepository,
      savedUser,
      (currentUser) => ({
        changedUser: {
          ...currentUser,
          quotaUsage: refundUnit(currentUser.quotaUsage, quotaReservation, unitsPerDay),
        },
        changeOutcome: null,
      }),
    );
    LOGGER.info("quota.refunded", {
      "quota.remaining": remainingQuotaOf(
        refundedUser.quotaUsage,
        unitsPerDay,
        eventRequestContext.now,
      ),
    });
  } catch (error) {
    LOGGER.error("quota.refund_failed", exceptionAttributesOf(error));
  }
}

function logEventRequested(
  outcome: EventRequestedOutcome,
  outcomeAttributes: Record<string, boolean> = {},
): void {
  logUserActivity("event_requested", {
    "user_activity.outcome": outcome,
    ...outcomeAttributes,
  });
}

// Represents why a message gives no calendar event, as the reply tells it.
type NoEventReason = Extract<CalendarEventResult, { ok: false }>["reason"];

type EventRequestedOutcome =
  | "created"
  | "no_event"
  | "repeat_declined"
  | "time_zone_needed"
  | "no_model"
  | "unusable_answer";
