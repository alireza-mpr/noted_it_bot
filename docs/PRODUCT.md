# Noted — Product Features and Backlog

Noted is a Telegram bot. You forward it a message with an event. It replies
with a one-tap "add to Google Calendar" link and a calendar file.

Status: **Beta**. It runs on Cloudflare Workers. Free LLM models (Gemini, then
Groq) read the events.

## Delivered

### Core: message → calendar event
- Works with plain text **and with photos or files that have a caption** (for
  example, a forwarded channel post with a flyer). If there is no text, the
  bot uses the caption.
- The model reads: title, date, weekday, start and end time, time zone,
  location, and how confident it is.
- Only clear dates for now ("19 Sep, 8pm"). The bot does not guess relative
  dates like "tomorrow".
- **Dates in other calendars** (for example Solar Hijri / Persian, Hebrew,
  Lunar Hijri) are converted to Gregorian. All calendars follow the same rules.
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
  and `/start` say this.
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
- It uses the user's Telegram language, unless the user picks another one.
- Every message is translated ahead of time and shipped with the bot. So
  choosing a language never calls a model. Other languages fall back to
  English.
- `/lang <language>` sets the language, by name or code ("Persian", "fa",
  "فارسی"). `/lang auto` goes back to the Telegram language. `/lang` alone
  shows the current one (in its own name, for example "فارسی").
- Dates and times in the summary follow the reply language. They are always
  Gregorian.
- `/tz` sets the time zone on a web page that the bot links to:
  - The page detects the device's zone and asks the user to confirm with one
    tap.
  - The user can also search all zones, by city ("Washington") or by name
    ("Eastern Time").
  - The link works for one minute.
  - No model is used, so `/tz` cannot be abused to spend the LLM quota.
  - An exact zone name after `/tz` is applied at once.
- The bot's name ("Noted") is never translated.

### Access
- Open to everyone, with a daily quota per user (`appConfig.dailyQuota`, now
  5 messages that go to a model).
- Commands do not use quota. If no model answers, the unit is given back.
  See [USER_QUOTA_DESIGN.md](USER_QUOTA_DESIGN.md).

### Commands
| Command  | Purpose                                                        |
|----------|----------------------------------------------------------------|
| `/start` | Intro, what the bot does, and the daily quota                  |
| `/lang`  | Show or change the reply language                              |
| `/tz`    | Set your time zone on a web page (or with an exact zone name)  |
| `/ver`   | Show the running version                                       |
| `/diag`  | Check the Gemini connection (hidden: not in the `/` menu)      |

Every deploy registers the visible commands with Telegram, so they show in the
`/` menu.

### Reliability and logs
- The bot always answers Telegram's request, even when something fails. So
  one error can never block the message queue. The user sees a general error.
  The details go to the logs.
- Workers Logs are on. Every log event also goes to Axiom, with the user's
  id, username and first name.
- Messages (the text, the model's answer, and the model) are logged in Axiom,
  as `/start` tells users.
- User actions are logged as `user activity` events: commands, language and
  time zone changes, event requests, quota refusals, and blocking or
  unblocking the bot.

### Delivery
- Two separate environments, each with its own bot, Worker, D1 database and
  secrets:
  - **dev** (`@noted_it_dev_bot`)
  - **prod** (`@noted_it_bot`)
- CI on every push: typecheck, then tests against the real Gemini API.
- **dev** deploys on every push to `main`. The version is
  `0.2.{run}-beta-{commit}`, and the deploy is tagged with the same string.
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
  - Log the model and token count of each call, to measure savings.
  - Check the extra "thinking" tokens on tasks that do not need them.
  - Add tests to make sure quality stays the same on cheaper models.
- [ ] **Check the first prod release** with the new version scheme (tag →
      manual start → webhook and command list registered). Try
      `@noted_it_bot` by hand.

### Product
- [ ] Relative and weekday dates ("tomorrow", "next Friday"). This needs a
      reliable reference date (the message time) and clear rules for unclear
      cases.
- [ ] Several events in one message.
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
- [ ] More tests: the message handler flow, translation placeholders
      (repeats and `.ics` output already have unit tests).
