// All English text the bot ever sends to a user, in one place. Anything with
// dynamic content (a name, a time, a link) uses {0}/{1}-style placeholders —
// translateText() is instructed to preserve these verbatim, so callers
// substitute real values locally after translation instead of re-translating
// per-message content.

export const START_MESSAGE = `Noted.

Forward me any message with an event in it.
I'll pull out the date and send you a calendar file.

Right now I read explicit dates only
("19 Sep, 8pm"), not "tomorrow".
Times are assumed to be Australian Eastern Standard Time (Sydney/Melbourne).

Beta. I keep your messages to fix bugs.`;

export const HI_TEMPLATE = "Hi {0}, current time is: {1} UTC";

export const CALENDAR_CAPTION_TEMPLATE =
  "📅 To add to Google Calendar, click {0}.\n\n📎 For Apple Calendar, Outlook, or anything else — tap the attached file.";

export const LINK_LABEL = "here";

export const ALL_DAY_NOTE = "<i>🤔 No specific time was mentioned, so this was added as an all-day event.</i>";

export const NO_CALENDAR_EVENT_MESSAGE = "⚠️ I couldn't turn this into a calendar event yet.";

export const NO_TEXT_MESSAGE = "⚠️ I couldn't find any text in that message.";

export const GENERIC_ERROR_MESSAGE = "⚠️ Something went wrong on my end — I've logged it to fix later.";
