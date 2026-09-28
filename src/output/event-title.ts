import type { CalendarEvent } from "../domain/calendar-event/calendar-event";
import type { SupportedLanguage } from "../domain/user/supported-language";
import { translate } from "../i18n/translation";

// Returns the event's title, or "Event" in the language when the message
// gives no name.
export function eventTitleOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
): string {
  return calendarEvent.title ?? translate("UNTITLED_EVENT_TITLE", language);
}
