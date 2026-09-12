// All English text the bot ever sends to a user, in one place. Anything with
// dynamic content (a name, a time, a link) uses {0}/{1}-style placeholders —
// translateText() is instructed to preserve these verbatim, so callers
// substitute real values locally after translation instead of re-translating
// per-message content.

export const START_MESSAGE = `Heya! I am {0} bot 👋.

📆 Forward me any message with an event in it. I'll pull out the details and send you a one-tap link to add it to Google Calendar, plus a file for Apple Calendar, Outlook, or anywhere else.

🌎 For now I read explicit dates only
("19 Sep - 8pm"), not "tomorrow".
Times are assumed to be Australian Eastern Standard Time (Sydney/Melbourne). I'll support that in future.

💭 I reply in your Telegram language by default. To change the language, simply send /lang command.
Example: /lang fa - to receive my messages in Farsi.

🤓 Beta.`;

// {0} gets wrapped in literal { } after substitution (the surrounding braces
// here are intentional, not a typo) — that's how the clickable link itself
// gets visually set apart, per explicit choice after comparing live options.
// The leading pointer emoji (👉/👈) is prepended at send time based on the
// reply language's text direction, not baked in here — 👉 isn't bidi-mirrored
// by Unicode, so a fixed choice would point the wrong way in RTL languages.
export const CALENDAR_CAPTION_TEMPLATE =
  "<b>Click {{0}} to add to Google Calendar</b>\n📎 For Apple Calendar, Outlook, or anything else — tap the attached file.";

export const LINK_LABEL = "here";

export const ALL_DAY_NOTE =
  "<i>🤔 By the way, no specific time was mentioned, so this was added as an all-day event.</i>";

export const NO_CALENDAR_EVENT_MESSAGE =
  "⚠️ I couldn't turn this into a calendar event.";

export const NO_TEXT_MESSAGE =
  "⚠️ Sorry! I couldn't find any text in your message.";

export const GENERIC_ERROR_MESSAGE =
  "⚠️ Something went wrong on my end — I've logged it to fix later.";

export const LANG_STATUS_AUTO = `I'm currently replying in {0}, auto-detected from your Telegram settings.\n\nSend /lang <language> to set it manually. 
  Example: /lang Persian or /lang fa`;

export const LANG_STATUS_MANUAL =
  "I'm currently replying in {0}, which you set manually.\n\nSend /lang <language> to change it, or /lang auto to go back to auto-detecting from your Telegram settings.";

export const LANG_SET_CONFIRMATION = "Got it — I'll reply in {0} from now on.";

export const LANG_RESET_CONFIRMATION =
  "Back to auto-detecting your language from Telegram settings.";

export const LANG_NOT_UNDERSTOOD =
  'I couldn\'t figure out what language "{0}" refers to. Try a language name (e.g. "Persian") or a code (e.g. "fa").';

// {0} is the user's numeric Telegram id — included so it can be relayed to
// get added, since a whitelist-by-username entry isn't possible for someone
// with no public username.
export const NOT_WHITELISTED_MESSAGE =
  "This bot is invite-only right now, and I don't have you on the list. Ask Alireza to add you — your ID is {0}.";
