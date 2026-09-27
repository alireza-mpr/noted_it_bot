import {
  buildCalendarEvent,
  type BuiltCalendarEvent,
} from "../../extractedEvents/calendarEvent";
import { computeEventUid } from "../../extractedEvents/eventUid";
import { extractEvent } from "../../extractedEvents/extractEvent";
import type { ExtractedEvent } from "../../extractedEvents/extractedEvent";
import { recurrenceProblem } from "../../extractedEvents/recurrence";
import type { MessageId } from "../../interactiveMessages/messages";
import { fillPlaceholder, fillPlaceholders } from "../../translation/placeholders";
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

  const mismatch = calendarEvent.weekdayMismatch;
  if (mismatch) {
    caption += `\n\n${fillPlaceholders(
      replier.translate("WEEKDAY_MISMATCH_NOTE"),
      [mismatch.stated, mismatch.date, mismatch.actual].map(escapeHtmlAttribute),
    )}`;
  }

  const notes: (MessageId | null)[] = [
    calendarEvent.inPast ? "PAST_EVENT_NOTE" : null,
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

// Tells the user which zone was used when the message had none, and how to
// change it. All-day events have no time, so their zone does not matter.
function timezoneNote(
  source: "message" | "user" | "floating",
  calendarEvent: BuiltCalendarEvent,
  replier: Replier,
): string | null {
  if (source === "message" || calendarEvent.allDay) {
    return null;
  }
  if (source === "user" && calendarEvent.timeZone) {
    return replier.translate("TZ_USER_NOTE", calendarEvent.timeZone);
  }
  return replier.translate("TZ_FLOATING_NOTE");
}

// Tells the user that extraction has started. If sending fails, extraction
// still continues.
async function sayExtracting(replier: Replier): Promise<void> {
  try {
    await replier.say("EXTRACTING_EVENT_MESSAGE");
  } catch (err) {
    logger.warn("could not send the extracting notice", { error: describeError(err) });
  }
}

// Returns whether a model answered. The caller uses it to decide whether to
// give back the quota for this message.
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
  // The zone in the message wins. Otherwise the user's /tz zone. Otherwise no
  // zone: the times stay "floating" (as written, in the calendar's own zone).
  // The caption mentions the last two cases.
  const timezoneSource = event.timezone_hint ? "message" : userTimezone ? "user" : "floating";
  event.timezone_hint ??= userTimezone;
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
