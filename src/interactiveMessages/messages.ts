// All English text that the bot sends to users, in one place. Each text has a
// message id. The translation files (src/translation/translations) use the
// same ids. Dynamic parts (a name, a time, a link) use {0}-style placeholders.
// The caller fills them in after translation.

export const MESSAGES = {
  START_MESSAGE: `Heya! I am {0} bot 👋.

📆 Forward me any message with an event in it. I'll pull out the details and send you a one-tap link to add it to Google Calendar, plus a file for Apple Calendar, Outlook, or anywhere else.

🕙 For now I read explicit dates only
("19 Sep - 8pm"), not "tomorrow".
I work out the time zone from the message. If it doesn't say, set yours with the /tz command.

🔁 Repeating events work too ("every Thursday, 7:30pm"). The link adds today's session everywhere; open it on a computer to get the whole series, or set the repeat yourself on a phone using the pattern I send.

🌎 I reply in your Telegram language by default. To change it, send the /lang command, e.g. /lang fa to get my replies in Farsi.`,

  // Added after START_MESSAGE when the daily quota is on. {0} is
  // appConfig.dailyQuota.
  START_QUOTA_NOTE: `🎁 On the free plan, you can send up to {0} requests a day.`,

  // After substitution, {0} is wrapped in literal { }. These braces are on
  // purpose, not a typo: they make the link stand out. We chose this after
  // trying other options in the real app.
  // The 🔔 at the start is added when the message is sent, not here (see
  // eventMessageHandler.ts). We first tried a direction emoji (👉/👈, flipped
  // for right-to-left text), but it looked wrong in right-to-left text, so we
  // use 🔔.
  CALENDAR_CAPTION_TEMPLATE:
    "<b>Click {{0}} to add to Google Calendar.</b>\n📎 For Apple Calendar, Outlook, or anything else — tap the attached file.",

  LINK_LABEL: "here",

  ALL_DAY_NOTE:
    "<i>🤔 By the way, no specific time was mentioned, so this was added as an all-day event.</i>",

  // Added to the caption when the message has no time zone. If the user set
  // one with /tz, the event uses it ({0}). If not, the times are "floating".
  TZ_USER_NOTE:
    "<i>🌎 The message didn't mention a time zone, so I used yours, {0}. To change it, send /tz.</i>",

  TZ_FLOATING_NOTE:
    "<i>🌎 The message didn't mention a time zone, so the time is as written, in your calendar's own time zone. To set yours, send /tz.</i>",

  // Added to the caption when the event's date is already in the past. So a
  // wrong year guess is easy to see.
  PAST_EVENT_NOTE:
    "<i>💡 Heads up: this date has already passed. If the message meant a future date, send it again with the year.</i>",

  // Added when the weekday in the message does not match the date:
  // {0} the stated weekday, {1} the date, {2} the real weekday of that date.
  WEEKDAY_MISMATCH_NOTE:
    "<i>🤔 The message says {0}, but {1} is a {2}. Check the date.</i>",

  RECURRING_NOTE:
    "<i>🔁 This event repeats. The link above adds today's session; on a phone it usually won't add the repeat, so open it on a computer for the full series, or set it to repeat yourself using the pattern above.</i>",

  RECURRENCE_DECLINED_MESSAGE:
    "⚠️ This looks like a repeating event, but I couldn't tell for sure how often it repeats, so I didn't create it. Please send it again with clearer wording, e.g. \"every Thursday at 7:30pm\".",

  NO_CALENDAR_EVENT_MESSAGE: "⚠️ I couldn't turn this into a calendar event.",

  NO_TEXT_MESSAGE: "⚠️ Sorry! I couldn't find any text in your message.",

  EXTRACTING_EVENT_MESSAGE:
    "⏳ On it — extracting the event from your message…",

  NO_AVAILABLE_MODEL_MESSAGE:
    "Sorry! All the AI providers are busy right now. Please try again in a minute.",

  GENERIC_ERROR_MESSAGE:
    "⚠️ Something went wrong on my end — I've logged it to fix later.",

  LANG_USAGE:
    "Which language? Send /lang followed by a language name or code, e.g. /lang Persian or /lang fa. To go back to auto-detecting from your Telegram settings, send /lang auto.",

  LANG_SET_CONFIRMATION: "Got it — I'll reply in {0} from now on.",

  LANG_RESET_CONFIRMATION:
    "Back to auto-detecting your language from Telegram settings.",

  LANG_NOT_SUPPORTED:
    "I can't reply in that language yet. I can reply in: {0}.",

  TZ_LINK_MESSAGE:
    "Tap the button below to set your time zone. The link works for 1 minute.",

  TZ_BUTTON_LABEL: "Set my time zone",

  TZ_SET_CONFIRMATION:
    "Got it — I'll use the {0} time zone for you from now on.",

  USER_DAILY_QUOTA_EXCEEDED:
    "🙅🏻‍♂️ You don't have enough daily quota left for today. Try again in {0}.",

  USER_DAILY_QUOTA_REMAINING: "🔢 You have {0} remaining request(s) for today.",

  PAGE_TITLE: "Set your time zone",

  PAGE_DETECTED: "Your device says you're in:",

  PAGE_LOCAL_TIME: "It is {0} there now.",

  PAGE_CONFIRM: "Yes, use this time zone",

  PAGE_CHOOSE: "No, choose another",

  PAGE_SEARCH: "Search for a city or region",

  PAGE_SAVE: "Save",

  PAGE_SAVED: "Saved. You can close this page and go back to Telegram.",

  PAGE_EXPIRED: "This link has expired. Send /tz to the bot again.",

  PAGE_ERROR: "Something went wrong. Please try again.",
};

export type MessageId = keyof typeof MESSAGES;
