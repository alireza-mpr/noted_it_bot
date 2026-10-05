# Noted — Product

Noted is a Telegram bot. You forward it a message about an event, or type
one. It replies with a one-tap "add to Google Calendar" link and an `.ics`
file for any other calendar app.

**Status: live, version 1.** Free LLM models (Gemini, then Groq) read the
messages. What changed in each version is in [CHANGELOG.md](../CHANGELOG.md).

## What the bot does

### From a message to a calendar event

- Reads plain text, and the caption of a photo or file (e.g. a forwarded
  channel post with a flyer).
- Reads events in any language the models understand. Persian is tested end to
  end.
- The model reads the title, date, weekday, start and end time, time zone,
  location and repeat, and says how confident it is. Our code does all date
  math.
- The title and location are never translated: the calendar gets the event as
  the message wrote it, even in mixed languages. With no title, the bot writes
  "Event" in the reply language.

### Dates and times

The rules and their reasons are in [EDGE_CASES.md](EDGE_CASES.md).

- **Other calendars** (Solar Hijri, Hebrew, Buddhist, Indian national) are
  converted to Gregorian. A plain "Hijri" is refused: it means different
  calendars in different countries.
- **A date with no year** gets the year where its weekday fits, or the current
  year.
- **Relative dates:** "today", "tonight", "tomorrow", "the day after
  tomorrow", "Friday", "next Friday".
- **A time with no date** ("lunch at 1") is today, or tomorrow if the time has
  passed.
- **No time:** an all-day event. **No end time:** one hour.
- **The time zone** comes from the message (a stated zone, or a place in only
  one city), else from the user's `/tz`, else the time stays as written in
  every calendar. Relative dates and times with no date need a time zone; the
  bot asks for `/tz` when it has none.
- **Notes in the caption:** 💡 the date has passed; 🤔 the written weekday
  doesn't match the date, or no time was given; 🌎 the message had no time
  zone, with how to set one.

### Repeats

- Clear repeats become a real repeat rule in the `.ics` file: "every
  Thursday", "every 2 weeks", "first Friday of the month", "monthly on the
  15th", "for 6 weeks", "until 29 Nov". Tested in English and Persian.
- The local time stays the same across daylight saving.
- A list of separate dates is not a repeat.
- An unclear repeat is declined with a message. The bot never guesses one.
- Monthly and yearly repeats work only in the Gregorian calendar.
- **On phones,** Google's app ignores the repeat in the link and adds one
  event. The caption and `/help` point users to the file, or to a computer.

### The reply

- A one-tap Google Calendar link, and a valid RFC 5545 `.ics` file (with a
  time zone, floating, or all day). Long lines are folded, so non-Latin titles
  don't break strict calendar apps.
- A short summary above the link: 📌 title, 🗓️ date and time, and a bold 🔔
  line with the link.
- **The same message forwarded again updates the event** instead of adding a
  copy.
- The whole reply is in the reply language: numbers, dates, times and the 🔁
  repeat line too. A Persian user's screenshot taught us this: an English
  repeat line and Latin digits made a Persian reply look broken.

### Languages and editions

- **Two bots from one code base** (ADR-10):
  - **English** (@noted_it_bot, "Noted!"): replies in the user's Telegram
    language.
  - **Persian** (@noted_it_fa_bot, "Noted! - فارسی"): replies in Persian.
- **Why a Persian edition:** with one bot, many Persian speakers got English
  replies, because their Telegram app is in English. That was demoralising,
  and English command descriptions didn't appeal to them either.
- 16 reply languages, translated ahead of time: English, Persian, Arabic,
  Spanish, French, German, Italian, Portuguese, Russian, Turkish, Chinese,
  Japanese, Korean, Hindi, Dutch and Polish.
- Each bot's `/` menu describes the commands in its language. Command names
  stay Latin (`/tz`): Telegram allows only `a–z`, digits and `_`.

### Commands

| Command | What it does |
|---|---|
| `/start` | A short welcome by first name, with one example to try |
| `/help` | How the bot works, what you can set, and the daily quota (when shown) |
| `/lang` | Shows the reply language and how to change it. `/lang fa` or `/lang Persian` sets it; `/lang auto` drops the choice. |
| `/tz` | Opens a page that reads the phone's time zone: one tap to confirm, or search by city or zone name. The link works for one minute. `/tz Australia/Melbourne` sets it at once. |
| `/ver` | Shows the running version |
| `/diag` | Checks that the models answer. Hidden: not in the `/` menu. |

An unknown command gets no reply, but it is logged.

### Access and quota

- Open to everyone, in a private chat. Groups and channels are not supported.
- A daily quota per user: 10 messages that go to a model
  (`APP_CONFIG.dailyQuota`). Commands are free, and the unit is given back
  when no model answers. Details are in
  [ARCHITECTURE_DECISIONS_REGISTRY.md](ARCHITECTURE_DECISIONS_REGISTRY.md#the-daily-quota-in-detail).
- The replies don't mention the quota for now (`APP_CONFIG.showDailyQuota`),
  so new users don't feel limited. A user who used it up is still told how
  long to wait.

### What is stored and logged

- **D1:** one row per user: the Telegram username, first and last name and app
  language, the chosen language and time zone, and the quota usage.
- **Logs (Axiom, kept about 2 days):** every message text, the model's answer,
  and what users do (commands, settings, event requests, blocking the bot),
  with the user's id, username and full name.
- **Models:** the message text goes to Gemini, or Groq when Gemini is busy.
- The bot always answers. When something fails, the user gets a general error
  and the details go to the logs.

## Backlog

### Next up
- [ ] **Route tasks to models by difficulty, to control cost.**
  - Today every task (event extraction, `/diag`) uses the same models in the
    same order.
  - Try a cheap, fast model first. Use a stronger one only when confidence is
    low or the answer doesn't match the schema (e.g. unclear messages, several
    events in one message).
  - Measure the savings with the model and tokens that
    `router.model_answered` already logs, and check "thinking" tokens on tasks
    that don't need them.
  - Add tests to make sure quality stays the same on cheaper models.

### Product
- [ ] **Why do users start the bot but never try it?** Compare
      `user_activity.bot_started` with the first
      `user_activity.event_requested`, by reply language and its source.
      Ideas to test: trust, the first reply's length, and the reply language.
- [ ] Show the daily quota again (`APP_CONFIG.showDailyQuota`) once usage
      grows.
- [ ] More relative dates ("this weekend", "in two weeks", "end of the
      month").
- [ ] Date ranges as one event (e.g. "zinc tablets from 5 Oct until 10 Oct").
- [ ] Several events in one message.
- [ ] Monthly and yearly repeats in other calendars (e.g. "every 1st of the
      Persian month").
- [ ] **`/privacy`:** a short text in the user's language: what is stored,
      where messages go and for how long. Also set it as the bot's privacy
      policy link in BotFather. First store and log less (e.g. no last name,
      no `user.full_name` in the logs), so the policy says less.
- [ ] **`/forget`:** deletes the user's row in the `users` table, so users can
      leave for good.

### Platform and ops
- [ ] Move event extraction from Gemini's `generateContent` endpoint to the
      Interactions API, once structured output works there.
- [ ] Keep the product version (`1.0` in `ci.yml` and `package.json`) in one
      place.
- [ ] A real approval step before prod. It needs a paid GitHub plan for a
      private repo; for now, the manual start is the guard.
- [ ] Clean up dev tags: every dev deploy adds one.
