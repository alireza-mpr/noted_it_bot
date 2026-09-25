import {
  ALL_DAY_NOTE,
  CALENDAR_CAPTION_TEMPLATE,
  LINK_LABEL,
  NO_CALENDAR_EVENT_MESSAGE,
  RECURRENCE_DECLINED_MESSAGE,
  RECURRING_NOTE,
} from "../lib/interactiveMessages/messages";
import {
  buildCalendarEvent,
  type BuiltCalendarEvent,
} from "../lib/extractedEvents/calendarEvent";
import { computeEventUid } from "../lib/extractedEvents/eventUid";
import { extractEvent } from "../lib/extractedEvents/extractEvent";
import type { ExtractedEvent } from "../lib/extractedEvents/extractedEvent";
import { recurrenceProblem } from "../lib/extractedEvents/recurrence";
import { fillPlaceholder } from "../lib/translation/placeholders";
import { messageLogger } from "../logging/messageLogger";
import type { MessageContext } from "./botContext";
import { escapeHtmlAttribute } from "./telegramHtml";
import type { Replier } from "./replier";

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

export async function handleEventMessage(
  ctx: MessageContext,
  content: string,
): Promise<void> {
  const { llm, message, replier, lang } = ctx;

  const downstream = await extractEvent(llm, content);
  await messageLogger.log({
    username: message.from?.username ?? null,
    userId: message.from?.id ?? null,
    receivedMessage: content,
    geminiRequest: content,
    geminiResponse: downstream.message,
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
    lang,
  );
  if (!calendarEvent) {
    console.error("Could not build a calendar event from extraction", downstream.message);
    await replier.say(NO_CALENDAR_EVENT_MESSAGE);
    return;
  }

  await replier.sendDocument(
    calendarEvent.icsFilename,
    calendarEvent.icsContent,
    await buildCaption(calendarEvent, replier),
  );
}
