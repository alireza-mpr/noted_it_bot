import {
  ALL_DAY_NOTE,
  CALENDAR_CAPTION_TEMPLATE,
  LINK_LABEL,
  NO_CALENDAR_EVENT_MESSAGE,
  NO_TEXT_MESSAGE,
  RECURRENCE_DECLINED_MESSAGE,
  RECURRING_NOTE,
} from "../../lib/interactiveMessages/messages";
import {
  buildCalendarEvent,
  type BuiltCalendarEvent,
} from "../../lib/extractedEvents/calendarEvent";
import { computeEventUid } from "../../lib/extractedEvents/eventUid";
import { extractEvent } from "../../lib/extractedEvents/extractEvent";
import type { ExtractedEvent } from "../../lib/extractedEvents/extractedEvent";
import { recurrenceProblem } from "../../lib/extractedEvents/recurrence";
import { fillPlaceholder } from "../../lib/translation/placeholders";
import { messageLogger } from "../../logging/messageLogger";
import type { Router } from "../../router/router";
import { escapeHtmlAttribute } from "../telegramHtml";
import type { Replier } from "../replier";
import type { TelegramMessage } from "../telegramTypes";

async function buildCaption(
  calendarEvent: BuiltCalendarEvent,
  replier: Replier,
): Promise<string> {
  const [captionTemplate, linkLabel] = await Promise.all([
    replier.translate(CALENDAR_CAPTION_TEMPLATE),
    replier.translate(LINK_LABEL),
  ]);

  const summaryLines = [...calendarEvent.summaryLines];
  if (calendarEvent.recurrence) {
    const sentence = await replier.translate(
      calendarEvent.recurrence.template,
      calendarEvent.recurrence.untilLabel ?? "",
    );
    summaryLines.push(`🔁 ${sentence}`);
  }

  const googleUrl = escapeHtmlAttribute(calendarEvent.googleCalendarUrl);
  const link = `<a href="${googleUrl}">${linkLabel}</a>`;
  const summaryBlock = summaryLines.map(escapeHtmlAttribute).join("\n");
  let caption = `${summaryBlock}\n\n🔔 ${fillPlaceholder(captionTemplate, link)}`;

  const notes = [
    calendarEvent.recurrence ? RECURRING_NOTE : null,
    calendarEvent.allDay ? ALL_DAY_NOTE : null,
  ];
  for (const note of notes) {
    if (note) {
      caption += `\n\n${await replier.translate(note)}`;
    }
  }
  return caption;
}

export async function eventMessageHandler(
  message: TelegramMessage,
  router: Router,
  replier: Replier,
): Promise<void> {
  const content = message.text ?? message.caption;
  if (!content) {
    console.error("Message had no text or caption", JSON.stringify(message));
    await replier.say(NO_TEXT_MESSAGE);
    return;
  }

  // An unknown /command: nothing to extract, and not worth a reply.
  if (content.startsWith("/")) {
    return;
  }

  const downstream = await extractEvent(router, content);
  await messageLogger.log({
    username: message.from.username ?? null,
    userId: message.from.id,
    receivedMessage: content,
    providerRequest: content,
    providerResponse: downstream.message,
  });

  if (downstream.result === "failed") {
    console.error(
      "Downstream call failed",
      downstream.message,
      JSON.stringify(downstream.failure),
    );
    await replier.say(downstream.message);
    return;
  }

  const event: ExtractedEvent = JSON.parse(downstream.message);
  const problem = recurrenceProblem(event);
  if (problem) {
    console.error("Declined recurring event", problem, downstream.message);
    await replier.say(RECURRENCE_DECLINED_MESSAGE);
    return;
  }

  const calendarEvent = buildCalendarEvent(
    event,
    await computeEventUid(content),
    replier.lang,
  );
  if (!calendarEvent) {
    console.error(
      "Could not build a calendar event from extraction",
      downstream.message,
    );
    await replier.say(NO_CALENDAR_EVENT_MESSAGE);
    return;
  }

  await replier.sendDocument(
    calendarEvent.icsFilename,
    calendarEvent.icsContent,
    await buildCaption(calendarEvent, replier),
  );
}
