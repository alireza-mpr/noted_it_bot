import {
  buildCalendarEvent,
  type BuiltCalendarEvent,
} from "../../extractedEvents/calendarEvent";
import { computeEventUid } from "../../extractedEvents/eventUid";
import { extractEvent } from "../../extractedEvents/extractEvent";
import type { ExtractedEvent } from "../../extractedEvents/extractedEvent";
import { recurrenceProblem } from "../../extractedEvents/recurrence";
import type { MessageId } from "../../interactiveMessages/messages";
import { fillPlaceholder } from "../../translation/placeholders";
import { appConfig } from "../../appConfig/appConfig";
import { logActivity } from "../../logging/activityLog";
import type { Router } from "../../router/router";
import { escapeHtmlAttribute } from "../telegramHtml";
import type { Replier } from "../replier";
import { describeError, Logger } from "../../logging/logger";

const logger = new Logger("eventMessageHandler");

async function buildCaption(
  calendarEvent: BuiltCalendarEvent,
  replier: Replier,
  remainingQuota: number,
  showQuota: boolean,
  timezoneNote: string | null,
): Promise<string> {
  const captionTemplate = replier.translate("CALENDAR_CAPTION_TEMPLATE");
  const linkLabel = replier.translate("LINK_LABEL");

  const summaryLines = [...calendarEvent.summaryLines];
  if (calendarEvent.recurrence) {
    summaryLines.push(`🔁 ${calendarEvent.recurrence}`);
  }

  const googleUrl = escapeHtmlAttribute(calendarEvent.googleCalendarUrl);
  const link = `<a href="${googleUrl}">${linkLabel}</a>`;
  const summaryBlock = summaryLines.map(escapeHtmlAttribute).join("\n");
  let caption = `${summaryBlock}\n\n🔔 ${fillPlaceholder(captionTemplate, link)}`;

  const notes: (MessageId | null)[] = [
    calendarEvent.recurrence ? "RECURRING_NOTE" : null,
    calendarEvent.allDay ? "ALL_DAY_NOTE" : null,
  ];
  for (const note of notes) {
    if (note) {
      caption += `\n\n${replier.translate(note)}`;
    }
  }
  if (timezoneNote) {
    caption += `\n\n${timezoneNote}`;
  }

  if (!showQuota) {
    return caption;
  }

  const quotaLine = replier.translate(
    "USER_DAILY_QUOTA_REMAINING",
    String(remainingQuota),
  );
  return `${caption}\n\n${escapeHtmlAttribute(quotaLine)}`;
}

// Says which zone was assumed when the message gave none, and how to change it.
// An all-day event has no time, so its zone doesn't matter.
function timezoneNote(
  source: "message" | "user" | "default",
  calendarEvent: BuiltCalendarEvent,
  replier: Replier,
): string | null {
  if (source === "message" || calendarEvent.allDay) {
    return null;
  }
  return replier.translate(
    source === "user" ? "TZ_USER_NOTE" : "TZ_DEFAULT_NOTE",
    calendarEvent.timeZone,
  );
}

// Tells the user extraction has started. A failed send must not stop the extraction.
async function sayExtracting(replier: Replier): Promise<void> {
  try {
    await replier.say("EXTRACTING_EVENT_MESSAGE");
  } catch (err) {
    logger.warn("could not send the extracting notice", { error: describeError(err) });
  }
}

// Returns whether a model answered, so the caller knows whether the quota
// taken for this message should be given back.
export async function eventMessageHandler(
  content: string,
  router: Router,
  replier: Replier,
  remainingQuota: number,
  showQuota: boolean,
  userTimezone: string | null,
): Promise<boolean> {
  const downstream = await extractEvent(router, content, () =>
    sayExtracting(replier),
  );
  logger.info("provider response received", {
    receivedMessage: content,
    providerResponse: downstream.message,
    model: downstream.model ?? null,
  });

  if (downstream.result === "failed") {
    logger.error("downstream call failed", {
      detail: downstream.message,
      failure: downstream.failure,
    });
    logActivity("event_requested", { outcome: "no_model" });
    await replier.say("NO_AVAILABLE_MODEL_MESSAGE");
    return false;
  }

  const event: ExtractedEvent = JSON.parse(downstream.message);
  // A zone the message states or implies wins; otherwise the user's /tz choice,
  // otherwise appConfig.defaultTimezone. The last two are pointed out in the caption.
  const timezoneSource = event.timezone_hint ? "message" : userTimezone ? "user" : "default";
  event.timezone_hint ??= userTimezone ?? appConfig.defaultTimezone;
  const problem = recurrenceProblem(event);
  if (problem) {
    logger.error("declined recurring event", {
      problem,
      response: downstream.message,
    });
    logActivity("event_requested", { outcome: "declined" });
    await replier.sayWithQuota(
      "RECURRENCE_DECLINED_MESSAGE",
      remainingQuota,
      showQuota,
    );
    return true;
  }

  const calendarEvent = buildCalendarEvent(
    event,
    await computeEventUid(content),
    replier.lang,
  );
  if (!calendarEvent) {
    logger.error("could not build a calendar event from extraction", {
      response: downstream.message,
    });
    logActivity("event_requested", { outcome: "no_event" });
    await replier.sayWithQuota(
      "NO_CALENDAR_EVENT_MESSAGE",
      remainingQuota,
      showQuota,
    );
    return true;
  }

  logActivity("event_requested", {
    outcome: "created",
    recurring: Boolean(calendarEvent.recurrence),
    allDay: calendarEvent.allDay,
  });
  await replier.sendDocument(
    calendarEvent.icsFilename,
    calendarEvent.icsContent,
    await buildCaption(
      calendarEvent,
      replier,
      remainingQuota,
      showQuota,
      timezoneNote(timezoneSource, calendarEvent, replier),
    ),
  );
  return true;
}
