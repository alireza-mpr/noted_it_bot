# Noted — Product Features and Backlog

Noted is a Telegram bot. You forward it a message with an event. It replies
with a one-tap "add to Google Calendar" link and a calendar file.

Status: **Live**, version 1. It runs on Cloudflare Workers. Free LLM models
(Gemini, then Groq) read the events. What changed in each version is in
[CHANGELOG.md](../CHANGELOG.md).

## Delivered

### Core: message → calendar event
- Works with plain text **and with photos or files that have a caption** (for
  example, a forwarded channel post with a flyer). If there is no text, the
  bot uses the caption.
- The model reads: title, date, weekday, start and end time, time zone,
  location, and how confident it is.
- **Relative dates:** "today", "tonight", "tomorrow", "the day after
  tomorrow", "Friday" and "next Friday", counted from now. They need a time
  zone: without one, the bot asks the user to set `/tz` first. Other
  relative dates (e.g. "in two weeks") give no event for now. See
  [EDGE_CASES.md](EDGE_CASES.md#relative-dates).
- **Dates in other calendars** (Solar Hijri / Persian, Hebrew, Buddhist,
  Indian national) are converted to Gregorian. All calendars follow the same
  rules. A plain "Hijri" is refused: it means a different calendar in
  different countries.
- **A date with no year:** if the message states the weekday ("Saturday 26
  Sep"), the bot picks the year where that weekday fits: this year, next year,
  or last year if the date was in the last two months. Otherwise it uses the
  current year.
- **Notes in the caption:**
  - 💡 when a one-off event's date is already in the past;
  - 🤔 when the stated weekday does not match the date.
  See [EDGE_CASES.md](EDGE_CASES.md).
- **Time zone, in this order:** the zone in the message; otherwise the user's
  `/tz` zone; otherwise the time as written, in the calendar's own zone (18:00
  shows as 18:00 everywhere). When the message had no zone, the caption says
  so and explains `/tz`.
- Works with non-Latin scripts (Persian is tested end to end).

### Recurring events
- Understands clear repeats: "every Thursday", "every 2 weeks", "first Friday
  of the month", "monthly on the 15th", "for 6 weeks", "until 29 Nov". Tested
  in English and Persian.
- A list of separate dates is not treated as a repeat.
- A repeat with no start date ("every Thursday at 7:30pm") starts on the next
  matching day. A stated start date moves to the first day that fits the
  pattern.
- A repeat with no end date has no end.
- The `.ics` file has the full repeat rule. It keeps the local time across
  daylight saving (checked in Google Calendar).
- **On phones:** Google's mobile app ignores the repeat in the link and adds
  only one event. So for repeats, the file is the reliable way. The caption
  and `/help` say this.
- If the repeat is unclear or invalid (low confidence, end before start, no
  days given), the bot declines with a message. It does not guess.
- Monthly and yearly repeats work only in the Gregorian calendar.

### Calendar output
- **One-tap Google Calendar link**, and an **`.ics` file** for Apple Calendar,
  Outlook, and others.
- Valid RFC 5545 output: events with time zones, "floating" events with no
  zone, and all-day events when no time is given (with a note). Long lines are
  folded correctly, so titles in non-Latin scripts do not break strict
  calendar apps.
- **Stable event ID:** a hash of the message. If you forward the same message
  again, your calendar updates the event. It does not add a second one.
- A summary above the link: 📌 title, 🗓️ date and time, then a bold 🔔 line
  with the link inside `{ }`.

### Languages
- The bot replies in 16 languages: English, Persian, Arabic, Spanish, French,
  German, Italian, Portuguese, Russian, Turkish, Chinese, Japanese, Korean,
  Hindi, Dutch, Polish.
- **Two editions, two bots:** English (@noted_it_bot) and Persian
  (@noted_it_fa_bot), from the same code (ADR-10). Each has its own `/` menu
  in its language. Command names stay Latin (`/start`, `/tz`): Telegram allows
  only `a–z`, digits and `_` in them.
- **Why a Persian edition:** falling back to English was really demoralising
  for Persian-speaking users. Many have their Telegram app in English, so they
  got English replies. Market research also showed that English command texts
  do not appeal to them.
- The English edition uses the user's Telegram language, unless the user
  picks another one. The Persian edition replies in Persian, unless the user
  picks another one. See "The reply language" in
  [EDGE_CASES.md](EDGE_CASES.md).
- Every message is translated ahead of time and shipped with the bot. So
  choosing a language never calls a model. Other languages fall back to
  English.
- `/lang <language>` sets the language, by name or code ("Persian", "fa",
  "فارسی"). `/lang auto` goes back to the Telegram language. `/lang` alone
  shows the current one (in its own name, for example "فارسی") and, on a new
  line, how to change it.
- Dates and times in the summary follow the reply language. They are always
  Gregorian.
- **A reply is fully in the reply language:** numbers, dates, times and the
  🔁 repeat line too. Only the event's own content (the title, the location)
  and time zone IDs (e.g. "Australia/Melbourne") stay as they are. We learnt
  this from a Persian user's screenshot: an English repeat line and a number
  in Latin digits made the Persian reply look broken.
- **The event is never translated.** The user forwards a message and expects
  the same event in the calendar. The title and the location stay in the
  language and script of the message, even when it mixes languages (e.g. an
  English place name in a Persian message stays in English). The prompt tells
  the model this. Only when the message gives no name does the bot write
  "Event" in the reply language.
- `/tz` sets the time zone on a web page that the bot links to:
  - The page detects the device's zone and asks the user to confirm with one
    tap.
  - The user can also search all zones, by city ("Washington") or by name
    ("Eastern Time").
  - The link works for one minute.
  - No model is used, so `/tz` cannot be abused to spend the LLM quota.
  - An exact zone name after `/tz` is applied at once.
- The bot's name ("Noted!") is never translated. The Persian bot is named
  "Noted! - فارسی". Dev bots add " - Dev".

### Access
- Open to everyone, with a daily quota per user (`APP_CONFIG.dailyQuota`, now
  10 messages that go to a model).
- The replies don't mention the quota for now (`APP_CONFIG.showDailyQuota`),
  so a new user doesn't feel limited. A user who used it up is still told,
  with the time to wait.
- Commands do not use quota. If no model answers, the unit is given back.
  See [The daily quota in detail](ARCHITECTURE_DECISIONS_REGISTRY.md#the-daily-quota-in-detail).
- For individual users only, in a private chat with the bot. Groups and
  channels are not supported. Of the membership updates, the bot reads only a
  user blocking or unblocking it (Telegram's `my_chat_member`: `kicked`,
  `member`).

### Commands
| Command  | Purpose                                                        |
|----------|----------------------------------------------------------------|
| `/start` | A short welcome by first name, with one example to try         |
| `/help`  | How the bot works, what you can set, and the daily quota       |
| `/lang`  | Show or change the reply language                              |
| `/tz`    | Set your time zone on a web page (or with an exact zone name)  |
| `/ver`   | Show the running version                                       |
| `/diag`  | Check that the models answer (hidden: not in the `/` menu)     |

Every deploy registers the visible commands with Telegram, so they show in the
`/` menu.

### Reliability and logs
- The bot always answers Telegram's request, even when something fails. So
  one error can never block the message queue. The user sees a general error.
  The details go to the logs.
- Workers Logs are on. Every log event also goes to Axiom, with the user's
  id, username and full name.
- Messages (the text, the model's answer, and the model) are logged in Axiom.
- User actions are logged as `user activity` events: commands (unknown ones
  too, with the text after them), language and time zone changes, event
  requests, quota refusals, and blocking or unblocking the bot.
- The bot stores each user in one D1 row: the Telegram username, first and last name and app language, the chosen
  language and time zone, and the quota usage. When a user started, and what
  they did, is in the logs.

### Delivery
- Two separate environments, each with its own bot, Worker, D1 database and
  secrets:
  - **dev** (`@noted_it_dev_bot`)
  - **prod** (`@noted_it_bot`)
- CI on every push: typecheck, then tests against the real Gemini API.
- **dev** deploys on every push to `main`. The version is
  `1.0.{run}-{commit}`, and the deploy is tagged with the same string.
- **prod** deploys only when someone starts it by hand, from a `v…` tag. Its
  `/ver` shows the tag. `wrangler rollback` gives a fast rollback.
- Secrets are in GitHub Environments. The README explains setup, promotion
  and rollback.

## Backlog

### Next up
- [ ] **Route tasks to models by difficulty (cost control).**
  - Today, every task (event extraction, `/diag`) uses the same list of free
    models, in the same order.
  - Idea: send simple tasks to the cheapest, fastest models. Use stronger
    models only for hard cases, like unclear messages or several events in one
    message.
  - Try a cheap model first. Use a stronger one only if confidence is low, or
    the answer does not match the schema.
  - Measure the savings with the model and token count that every call
    already logs (`router.model_answered`).
  - Check the extra "thinking" tokens on tasks that do not need them.
  - Add tests to make sure quality stays the same on cheaper models.
- [ ] **Check the first prod release** with the new version scheme (tag →
      manual start → webhook and command list registered). Try
      `@noted_it_bot` by hand.

### Product
- [ ] **Why do users start the bot but never try it?** Compare
      `user_activity.bot_started` with the user's first
      `user_activity.event_requested`, by reply language and its source.
      Ideas to test: trust, the first reply's length, and the reply language
      (e.g. a Persian speaker with an English Telegram app gets English).
- [ ] Show the daily quota again (`APP_CONFIG.showDailyQuota`) once usage
      grows.
- [ ] More relative dates ("this weekend", "in two weeks", "end of the
      month").
- [ ] Date ranges as one event (e.g. "from 5 Oct, zinc tablets, until 10
      Oct").
- [ ] Several events in one message.
- [ ] **`/privacy`:** a short text in the user's language: what is stored,
      where messages go (the model providers, the logs) and for how long.
      Also set it as the bot's privacy policy link in BotFather. First store
      and log less (e.g. no last name, no `user.full_name` in the logs), so
      the policy says less.
- [ ] **`/forget`:** deletes the user's data (their row in the `users`
      table), so users can leave for good.
- [ ] Monthly and yearly repeats in other calendars (for example "every 1st
      of the Persian month"). Their months do not match Gregorian months.

### Platform and ops
- [ ] Move event extraction from Gemini's old `generateContent` endpoint to the
      Interactions API, once structured output works there.
- [ ] Update the `package.json` version automatically with prod tags (it is
      manual now).
- [ ] A real approval step before prod. This needs a paid GitHub plan for a
      private repo. For now, the manual start is the guard.
- [ ] Clean up dev tags. Every dev deploy adds one.
