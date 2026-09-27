import type { CalendarEvent } from "../domain/calendar-event/calendar-event";
import { weekdayOf } from "../generic/date-time/date-only";
import { escapeHtml } from "../generic/html/escape-html";
import { fillPlaceholders } from "../generic/text/fill-placeholders";
import type { BotMessageId } from "../i18n/bot-message";
import type { SupportedLanguage } from "../i18n/supported-language";
import { translate } from "../i18n/translation";
import { googleCalendarLinkOf } from "./google-calendar-link";
import {
  formatClockTime,
  formatDateWithYear,
  formatShortDate,
  formatWeekdayName,
} from "./localized-date-time";
import { formatNumber } from "./localized-number";
import { repeatSentenceOf } from "./repeat-sentence";

// Returns the caption sent with the calendar file, in Telegram HTML: the
// summary, the link, the notes, and the quota line. remainingQuota is null
// when no daily quota is in use.
export function captionOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
  remainingQuota: number | null,
): string {
  const captionParts = [
    summaryOf(calendarEvent, language),
    `🔔 ${fillPlaceholders(translate("CALENDAR_CAPTION_TEMPLATE", language), [linkOf(calendarEvent, language)])}`,
    ...notesOf(calendarEvent, language),
  ];
  if (remainingQuota !== null) {
    captionParts.push(
      translatedText(
        "USER_DAILY_QUOTA_REMAINING",
        [formatNumber(remainingQuota, language)],
        language,
      ),
    );
  }
  return captionParts.join("\n\n");
}

// Returns the 📌 title, 🗓️ date and time, and 🔁 repeat lines.
function summaryOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
): string {
  const summaryLines = [
    `📌 ${escapeHtml(calendarEvent.title)}`,
    `🗓️ ${escapeHtml(whenOf(calendarEvent, language))}`,
  ];
  const repeatSentence = repeatSentenceOf(calendarEvent, language);
  if (repeatSentence !== null) {
    summaryLines.push(`🔁 ${escapeHtml(repeatSentence)}`);
  }
  return summaryLines.join("\n");
}

// Returns e.g. "Wed, Sep 23" for an all-day event, or "Wed, Sep 23 8:00 PM–
// 9:00 PM".
function whenOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
): string {
  const shortDate = formatShortDate(calendarEvent.date, language);
  const time = calendarEvent.time;
  return time.kind === "all-day"
    ? shortDate
    : `${shortDate} ${formatClockTime(time.start, language)}–${formatClockTime(time.end, language)}`;
}

function linkOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
): string {
  const linkLabel = translate("LINK_LABEL", language);
  return `<a href="${escapeHtml(googleCalendarLinkOf(calendarEvent))}">${linkLabel}</a>`;
}

// Returns the notes: 🤔 wrong weekday, 💡 in the past, 🔁 repeat, 🤔 all day,
// and 🌎 time zone.
function notesOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
): string[] {
  const notes: string[] = [];
  const wrongWeekday = calendarEvent.wrongWeekday;
  if (wrongWeekday !== null) {
    notes.push(
      translatedText(
        "WRONG_WEEKDAY_NOTE",
        [
          formatWeekdayName(wrongWeekday, language),
          formatDateWithYear(calendarEvent.date, language),
          formatWeekdayName(weekdayOf(calendarEvent.date), language),
        ],
        language,
      ),
    );
  }
  if (calendarEvent.inPast) {
    notes.push(translate("PAST_EVENT_NOTE", language));
  }
  if (calendarEvent.repeat !== null) {
    notes.push(translate("REPEAT_NOTE", language));
  }
  if (calendarEvent.time.kind === "all-day") {
    notes.push(translate("ALL_DAY_NOTE", language));
  }
  const timeZoneNote = timeZoneNoteOf(calendarEvent, language);
  if (timeZoneNote !== null) {
    notes.push(timeZoneNote);
  }
  return notes;
}

// Returns the note that says which time zone was used when the message had
// none, or null.
function timeZoneNoteOf(
  calendarEvent: CalendarEvent,
  language: SupportedLanguage,
): string | null {
  const eventTimeZone = calendarEvent.timeZone;
  // An all-day event has no time, so its time zone does not matter.
  if (
    eventTimeZone.kind === "from-message" ||
    calendarEvent.time.kind === "all-day"
  ) {
    return null;
  }
  // The time zone ID stays as it is, e.g. "Australia/Melbourne", in every
  // language: it is what the user chose, and it is more precise than a name.
  return eventTimeZone.kind === "from-user"
    ? translatedText("TZ_USER_NOTE", [eventTimeZone.timeZone], language)
    : translate("TZ_FLOATING_NOTE", language);
}

// Returns the bot message in the language, with the values escaped and filled
// in.
function translatedText(
  botMessageId: BotMessageId,
  values: string[],
  language: SupportedLanguage,
): string {
  return fillPlaceholders(
    translate(botMessageId, language),
    values.map(escapeHtml),
  );
}
