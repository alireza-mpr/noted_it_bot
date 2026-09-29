# Edge Cases

Real messages are often incomplete. This file explains how the bot handles:
- dates with no year,
- dates in other calendars,
- relative dates (e.g. "tonight", "next Friday"),
- messages with no time zone.

Each one is **one general rule**. The bot uses the same rule for every
message. At the end, there is a list of the real messages that showed us these
problems.

When a message gives a wrong event: find which rule it breaks, and fix the
rule. Do not add a fix for that one message.

## Dates

### One conversion step, for every calendar

1. The model copies the date as written. It also names the calendar
   ("Gregorian", "Solar Hijri", …).
2. One step, `createCalendarEvent`
   (`src/domain/calendar-event/create-calendar-event.ts`), converts the dates
   to Gregorian and adds any missing year. It works the same for every
   calendar.
3. Everything after this step sees only Gregorian dates: the repeat check, the
   `.ics` file, the Google link, and the caption notes. So no calendar is a
   special case.

**Calendars are data.** A table
(`src/adapters/models/extraction/calendar-names.ts`) lists each calendar the
bot accepts, and the names the model may use for it ("Jalali", "Hebrew" …).
To add a calendar, add it to `CalendarId` and add a row.

Only calendars whose years are plain numbers are in the table. The Japanese
calendar is not: its years count within eras.

A plain "Hijri" is **not** in the table, on purpose:
- in some countries, it means the solar calendar;
- in others, it means the lunar calendar.
A wrong guess moves the date by about 600 years.

**The bot declines a date when it cannot convert it safely:**
- the calendar is not in the table;
- a date is written, but no calendar is named;
- the day does not exist (for example 30 Esfand in a common year);
- a monthly or yearly repeat in a calendar whose months do not match
  Gregorian months.

### A missing year

Announcements often give a date with no year. Sometimes they also give the
weekday: "Saturday 26 September", "Thursday 9 Mehr".

- The model copies the weekday as written (the `weekday` field). It never
  calculates it from the date.
- Our code picks the year (`pickYear` in `src/domain/calendar-event/year-rule.ts`). It counts
  years in the message's own calendar.

**The rule:**
1. **If the message states a weekday,** try:
   - this year,
   - next year,
   - last year, but only if that date was in the last two months (for
     example "Saturday 26 December", forwarded in early January).

   Use the year where the weekday fits, even if the date is in the past.
   (Forwarded messages often arrive late. A past date is better than a wrong
   year.)
2. **Otherwise** (no weekday, or no year fits): use the current year.

**The end date of a repeat** with no year: use the start's year. If that puts
the end before the start, use the next year.

**"Today"** means today in the event's time zone. If the event has no time
zone, the floating time zone is used (now UTC).

### Showing a wrong guess to the user

Two notes in the caption, in the reply language:
- **💡 Past date:** a one-off event whose date is already in the past.
- **🤔 Wrong weekday:** the stated weekday does not fall on the final date.
  This also works when the message states the year. Example: "The message
  says Monday, but Jan 20, 2026 is a Tuesday. Check the date." Repeats do not
  get this note, because their weekdays come from the pattern.

When a message contradicts itself, the bot does not guess which part is
wrong. It shows the problem, and the user can send the message again with the
year.

### Examples

| Message | Sent on | Event date | Why | Notes |
|---|---|---|---|---|
| "Saturday 26 September" | 27 Sep 2026 | 26 Sep 2026 | the weekday fits this year | 💡 |
| "26 September" (no weekday) | 27 Sep 2026 | 26 Sep 2026 | current year | 💡 |
| "Sunday 26 September" | 27 Sep 2026 | 26 Sep 2027 | the weekday fits next year | — |
| "Saturday 26 December" | 2 Jan 2027 | 26 Dec 2026 | fits last year, one week ago | 💡 |
| "Monday Jan 20" | 15 Dec 2026 | 20 Jan 2026 | only 2025 fits, too long ago | 💡 🤔 |
| "Monday Jan 20" | 1 Feb 2026 | 20 Jan 2026 | only 2025 fits, too long ago | 💡 🤔 |
| "Thursday 9 Mehr" (Solar Hijri) | 27 Sep 2026 (5 Mehr 1405) | 1 Oct 2026 | the weekday fits this Persian year | — |
| "Saturday 15 Tishrei" (Hebrew) | 20 Sep 2026 | 26 Sep 2026 | the weekday fits this Hebrew year | — |

20 January is a Monday in 2025, a Tuesday in 2026, and a Wednesday in 2027.

### Relative dates

A relative date (e.g. "tonight", "next Friday") is counted from **now**: the
moment the bot gets the message. "Today" is today in the event's time zone
(see [Time zones](#time-zones)). So 20:00 UTC on 26 Sep is already 27 Sep for
an event in Melbourne.

**A relative date needs a time zone.** If neither the message nor the user's
`/tz` gives one, the bot makes no event. It asks the user to set `/tz` and to
send the message again. It does not use the floating time zone (UTC): at any
moment, "today" is two different dates around the world. So UTC gives a
wrong date for some hours of every day (e.g. 00:00–10:00 in Melbourne,
20:00–24:00 in New York). A written date ("19 Sep") needs no time zone.

**The model classifies, our code counts.** The model only says which kind of
relative date the message writes. It never works out the date: small models
often get weekday math wrong, and a wrong date looks like a right one.

| Message | Kind | Date, sent on Wednesday 30 Sep |
|---|---|---|
| "today", "tonight", "this evening" | 0 days from today | Wed 30 Sep |
| "tomorrow", "tomorrow night" | 1 day from today | Thu 1 Oct |
| "the day after tomorrow" | 2 days from today | Fri 2 Oct |
| "Friday", "this Friday" | the next Friday, counting today | Fri 2 Oct |
| "Wednesday" | the next Wednesday, counting today | Wed 30 Sep |
| "next Friday" | Friday of the week after this one | Fri 9 Oct |
| "next Wednesday" | Wednesday of the week after this one | Wed 7 Oct |

- Weeks start on Monday. So on a Saturday or a Sunday, "Friday" and "next
  Friday" are the same day, and on a Sunday "next Monday" is tomorrow.
- A single event on a named weekday ("dinner on Friday") is a relative date. A
  weekday that repeats ("every Friday") is a repeat.
- A repeat can start on a relative date ("every Friday, starting tomorrow").
- Any other relative date (e.g. "this weekend", "in two weeks", "end of the
  month", "yesterday") gives no event.
- A relative date with no time is an all-day event, like any other date.

### Not solved yet

- Around New Year: "9 January" with no weekday, sent in December, gets the
  current year. So it lands in the past. The 💡 note shows this.
- "29 February" with no year can land on a year that has no 29 February.
- Hebrew leap years have an extra month. So a Hebrew month number late in the
  year can mean different months in different years.
- In Iran, the week starts on Saturday. So for some Persian speakers, "next
  Friday" said on a Saturday may mean a week later than the bot's date.
- A date range (e.g. "from 5 Oct to 10 Oct") is not read as one event.

## Event time

- **No start time: an all-day event.** The bot never guesses a time. The
  caption says so (🤔).
- **A start time but no end time: the event lasts one hour** (e.g. 20:00
  gives 20:00–21:00).
- **Not solved yet:** a start at 23:00 or later with no end time ends after
  midnight (23:30 gives 00:30), but the end stays on the same date.

## Repeats

All dates of a repeat are worked out by our code, never by the model.

**The first date:**
- With a start date: the first day on or after the start date that matches
  the pattern (e.g. "every Thursday, from Saturday 26 Sep" starts on Thursday
  1 Oct).
- With no start date: the first matching day from today. Today counts only
  if the event has not started yet.
- A weekly repeat with no weekdays happens on the weekday of the first date.

**A repeat is declined when it cannot be trusted.** A wrong repeat would
silently fill someone's calendar, so the bot says no instead of guessing:
- the model's confidence is below 0.7;
- the interval is not a whole number of at least 1;
- a monthly weekday pattern has no weekdays, or a day of the month is not
  between 1 and 31;
- "after N times" has N below 1;
- there is no start date, and the pattern does not say which days (e.g.
  "every week", "every year");
- no day matches the pattern within about two years;
- the end date is before the first date.

**Monthly and yearly repeats work only in the Gregorian calendar.** Other
calendars' months are not Gregorian months. Such a message gets no event.

## Time zones

The event's time zone, in this order:

1. The time zone the message states or suggests (the model's `timezone_hint`).
2. Otherwise, the user's `/tz` time zone.
3. Otherwise, no time zone: **"floating"** time.
   - The `.ics` file has no `TZID`.
   - The Google link has local times and no `ctz`.
   - Every calendar shows the time as written, in its own time zone. 18:00 stays
     18:00.

**What a user may type in `/tz`:** only "Area/Location" names (e.g.
"Australia/Melbourne") and UTC or GMT. Short names like "EST" or "CST" are refused,
because they are unclear ("CST" is used in the USA, China and Cuba).

In cases 2 and 3, the caption tells the user, and explains how to set a time zone
with `/tz`.

**Why no default time zone?** The first version used UTC. A user in Melbourne with
no `/tz` time zone got an 18:00 event as 18:00 UTC. Google Calendar showed it at
4:00 the next morning. The caption explained it, but the calendar entry was
still wrong.

**The model decides about places, and models are different.**
- "Notting Hill" is in London and in Melbourne. So "no time zone" is the right
  answer.
- "Nunawading" is only in Melbourne. But it depends on the model:
  `gemini-3.1-flash-lite` answers `Australia/Melbourne`, and
  `gemini-3.5-flash-lite` answers nothing.
- A missing time zone is not always safe. The rules above then use the
  user's `/tz`. A user in Melbourne who forwards an event in Tehran gets it
  at the right hour, but in Melbourne time: 6.5 hours off.
- So the prompt asks the model to place a street, venue or area that is in
  only one city, even when the message doesn't name the city (e.g. a talk on
  "Karimkhan Street", with no city: Tehran). A place in several cities, like
  "Notting Hill", still gets no time zone.
- The live tests check both: the Tehran streets give `Asia/Tehran`, and
  "Notting Hill" never gives London. They accept both answers for a suburb
  like "Nunawading".

**The live tests share the dev Gemini quota with the dev bot.** Each run makes
about 12 calls. Frequent runs push requests to later models, which are
sometimes weaker.

## The same message, forwarded again

The event UID is calculated from the message text: a SHA-256 hash of the
text, without spaces at the start and end. So the same message always gives
the same UID.

- When a user forwards the same message again, the calendar app updates the
  event. It does not add a copy.
- If the text changes at all (even one character), it is a new event.

## The reply language

The bot replies in the first of these that is set:

1. The language the user chose with `/lang`.
2. **English edition only:** the language of the user's Telegram app, if the
   bot supports it. A region is ignored (e.g. "pt-BR" gives Portuguese).
3. The edition's default language: English for the English edition, Persian
   for the Persian one.

**Why the Persian edition ignores the Telegram language:** many Persian
speakers have their Telegram app in English. With step 2, they got English
replies from a bot they chose because it speaks Persian.

`/lang auto` removes the user's choice, so steps 2 and 3 apply again.

## The real messages that showed us these rules

| Date | Message | What went wrong | Rule now |
|---|---|---|---|
| 27 Sep 2026 | "🎲 گیم‌نایت شنبه ۲۶ سپتامبر …" (game night, Saturday 26 Sep, no year) | The event was in 2027. The date had just passed, so the bot took next year. | A missing year |
| 27 Sep 2026 | The same message: "Notting Hill Neighbourhood House" | No time zone, so UTC. 18:00 became 4:00 the next morning in Melbourne. | Time zones (floating time) |
| 27 Sep 2026 | A book-club post at "Nunawading Community Hub" | The live test failed when another model answered. | Time zones (models are different) |
| 27 Sep 2026 | "Thursday 9 Mehr" (film night, Solar Hijri, no year) | Declined: other calendars needed a stated year. | One conversion step, for every calendar |

**Tests:**
- `tests/unit/eventYear.test.ts`: missing years in any calendar, wrong
  weekdays.
- `tests/unit/eventTimezone.test.ts`: time zones and caption notes.
- `tests/unit/gameNight.test.ts`: the game night message, end to end.
- `tests/integration/extractEvent.test.ts`: what the live model returns.
