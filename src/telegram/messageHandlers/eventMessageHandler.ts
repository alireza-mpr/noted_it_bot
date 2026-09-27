import { renderCalendarEvent, type BuiltCalendarEvent } from "../../extractedEvents/calendarEvent";
import { planEvent } from "../../extractedEvents/eventPlan";
import { computeEventUid } from "../../extractedEvents/eventUid";
import { extractEvent } from "../../extractedEvents/extractEvent";
import type { MessageId } from "../../interactiveMessages/messages";
import { fillPlaceholder, fillPlaceholders } from "../../translation/placeholders";
import { logActivity } from "../../logging/activityLog";
import type { Router } from "../../router/router";
import { escapeHtmlAttribute } from "../telegramHtml";
import type { Replier } from "../replier";
import { describeError, Logger } from "../../logging/logger";

const logger = new Logger("eventMessageHandler");

// Tells the user which zone was used when the message had none, and how to
// change it. All-day events have no time, so their zone does not matter.
function timezoneNote(calendarEvent: BuiltCalendarEvent, replier: Replier): string | null {
  const zone = calendarEvent.zone;
  if (zone.kind === "message" || calendarEvent.allDay) {
    return null;
  }
  return zone.kind === "user" ? replier.translate("TZ_USER_NOTE", zone.name) : replier.translate("TZ_FLOATING_NOTE");
}

function buildCaption(calendarEvent: BuiltCalendarEvent, replier: Replier, remainingQuota: number | null): string {
  const summaryLines = [...calendarEvent.summaryLines];
  if (calendarEvent.recurrence) {
    summaryLines.push(`🔁 ${calendarEvent.recurrence}`);
  }
  const link = `<a href="${escapeHtmlAttribute(calendarEvent.googleCalendarUrl)}">${replier.translate("LINK_LABEL")}</a>`;
  const parts = [
    summaryLines.map(escapeHtmlAttribute).join("\n"),
    `🔔 ${fillPlaceholder(replier.translate("CALENDAR_CAPTION_TEMPLATE"), link)}`,
  ];

  const mismatch = calendarEvent.weekdayMismatch;
  if (mismatch) {
    parts.push(
      fillPlaceholders(
        replier.translate("WEEKDAY_MISMATCH_NOTE"),
        [mismatch.stated, mismatch.date, mismatch.actual].map(escapeHtmlAttribute),
      ),
    );
  }
  const notes: MessageId[] = [
    ...(calendarEvent.inPast ? (["PAST_EVENT_NOTE"] as const) : []),
    ...(calendarEvent.recurrence ? (["RECURRING_NOTE"] as const) : []),
    ...(calendarEvent.allDay ? (["ALL_DAY_NOTE"] as const) : []),
  ];
  parts.push(...notes.map((note) => replier.translate(note)));

  const zoneNote = timezoneNote(calendarEvent, replier);
  if (zoneNote) {
    parts.push(zoneNote);
  }
  if (remainingQuota !== null) {
    parts.push(escapeHtmlAttribute(replier.quotaLine(remainingQuota)));
  }
  return parts.join("\n\n");
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
// give back the quota for this message. remainingQuota is null when no quota
// is in use.
export async function eventMessageHandler(
  content: string,
  router: Router,
  replier: Replier,
  remainingQuota: number | null,
  userTimezone: string | null,
): Promise<boolean> {
  const extraction = await extractEvent(router, content, () => sayExtracting(replier));
  logger.info("provider response received", {
    receivedMessage: content,
    providerResponse: extraction.ok ? JSON.stringify(extraction.event) : null,
    model: extraction.ok ? extraction.model : null,
  });

  if (!extraction.ok) {
    logger.error("downstream call failed", { failure: extraction });
    logActivity("event_requested", { outcome: "no_model" });
    await replier.say("NO_AVAILABLE_MODEL_MESSAGE");
    return false;
  }

  const planned = planEvent(extraction.event, userTimezone, new Date());
  if (!planned.ok) {
    const declined = planned.reason === "repeat_declined";
    logger.error(declined ? "declined recurring event" : "could not build a calendar event from extraction", {
      problem: planned.detail,
      response: JSON.stringify(extraction.event),
    });
    logActivity("event_requested", { outcome: declined ? "declined" : "no_event" });
    await replier.sayWithQuota(declined ? "RECURRENCE_DECLINED_MESSAGE" : "NO_CALENDAR_EVENT_MESSAGE", remainingQuota);
    return true;
  }

  const calendarEvent = renderCalendarEvent(planned.plan, await computeEventUid(content), replier.lang, new Date());
  logActivity("event_requested", {
    outcome: "created",
    recurring: planned.plan.repeat !== null,
    allDay: calendarEvent.allDay,
  });
  await replier.sendDocument(
    calendarEvent.icsFilename,
    calendarEvent.icsContent,
    buildCaption(calendarEvent, replier, remainingQuota),
  );
  return true;
}
