// The English text of every bot message, by id. The files in translations/
// use the same ids. {0}, {1}, … are filled in after translation.
export const BOT_MESSAGES = {
  START_MESSAGE: `Heya! I am {0} bot 👋.

📆 Forward me any message with an event in it. I'll pull out the details and send you a one-tap link to add it to Google Calendar, plus a file for Apple Calendar, Outlook, or anywhere else.

🕙 For now I read explicit dates only
("19 Sep - 8pm"), not "tomorrow".
I work out the time zone from the message. If it doesn't say, set yours with the /tz command.

🔁 Repeating events work too ("every Thursday, 7:30pm"). The link adds today's session everywhere; open it on a computer to get the whole series, or set the repeat yourself on a phone using the pattern I send.

🌎 I reply in your Telegram language by default. To change it, send the /lang command, e.g. /lang fa to get my replies in Farsi.`,

  // {0} is the daily quota.
  START_QUOTA_NOTE: `🎁 On the free plan, you can send up to {0} requests a day.`,

  // {0} is the link. The { } around it are on purpose: they make the link
  // stand out.
  CALENDAR_CAPTION_TEMPLATE:
    "<b>Click {{0}} to add to Google Calendar.</b>\n📎 For Apple Calendar, Outlook, or anything else — tap the attached file.",

  LINK_LABEL: "here",

  ALL_DAY_NOTE:
    "<i>🤔 By the way, no specific time was mentioned, so this was added as an all-day event.</i>",

  // {0} is the user time zone.
  TZ_USER_NOTE:
    "<i>🌎 The message didn't mention a time zone, so I used yours, {0}. To change it, send /tz.</i>",

  TZ_FLOATING_NOTE:
    "<i>🌎 The message didn't mention a time zone, so the time is as written, in your calendar's own time zone. To set yours, send /tz.</i>",

  PAST_EVENT_NOTE:
    "<i>💡 Heads up: this date has already passed. If the message meant a future date, send it again with the year.</i>",

  // {0} is the written weekday, {1} the date, {2} the date's real weekday.
  WRONG_WEEKDAY_NOTE:
    "<i>🤔 The message says {0}, but {1} is a {2}. Check the date.</i>",

  REPEAT_NOTE:
    "<i>🔁 This event repeats. The link above adds today's session; on a phone it usually won't add the repeat, so open it on a computer for the full series, or set it to repeat yourself using the pattern above.</i>",

  // The repeat sentence. {0} is the pattern, {1} the end.
  REPEAT_SENTENCE: "Repeats {0}",
  REPEAT_SENTENCE_WITH_END: "Repeats {0}, {1}",
  REPEAT_EVERY_DAY: "every day",
  REPEAT_EVERY_WEEK: "every week",
  REPEAT_EVERY_MONTH: "every month",
  REPEAT_EVERY_YEAR: "every year",
  // {0} is e.g. "3 days", written by Intl.
  REPEAT_EVERY_N_DAYS: "every {0}",
  REPEAT_EVERY_N_WEEKS: "every {0}",
  REPEAT_EVERY_N_MONTHS: "every {0}",
  REPEAT_EVERY_N_YEARS: "every {0}",
  // {0} is a list of weekdays, e.g. "Monday and Wednesday".
  REPEAT_WEEKLY_ON: "every {0}",
  // {0} is e.g. "2 weeks", {1} a list of weekdays.
  REPEAT_EVERY_N_WEEKS_ON: "every {0} on {1}",
  // {0} is the day number, {1} e.g. "every month".
  REPEAT_MONTHLY_ON_DAY: "on day {0} of {1}",
  // {0} is a list of weekdays, {1} e.g. "every month".
  REPEAT_MONTHLY_ON_FIRST: "on the first {0} of {1}",
  REPEAT_MONTHLY_ON_SECOND: "on the second {0} of {1}",
  REPEAT_MONTHLY_ON_THIRD: "on the third {0} of {1}",
  REPEAT_MONTHLY_ON_FOURTH: "on the fourth {0} of {1}",
  REPEAT_MONTHLY_ON_LAST: "on the last {0} of {1}",
  // {0} is the end date.
  REPEAT_UNTIL: "until {0}",
  // {0} is the number of times.
  REPEAT_ONE_TIME: "{0} time",
  REPEAT_TIMES: "{0} times",

  REPEAT_DECLINED_MESSAGE:
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

// Represents the id of a bot message, e.g. "NO_TEXT_MESSAGE".
export type BotMessageId = keyof typeof BOT_MESSAGES;
