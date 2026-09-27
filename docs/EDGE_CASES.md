# Edge Cases

Real messages are often incomplete. This file explains how the bot handles:
- dates with no year,
- dates in other calendars,
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
2. One step, `toGregorianDates` (`src/legacy/extractedEvents/toGregorian.ts`),
   converts the dates to Gregorian and adds any missing year. It works the
   same for every calendar.
3. Everything after this step sees only Gregorian dates: the repeat check, the
   `.ics` file, the Google link, and the caption notes. So no calendar is a
   special case.

**Calendars are data.** A table lists each calendar the date library supports,
and the names the model may use for it ("Jalali", "Lunar Hijri", "Hebrew" …).
To add a calendar, add a row.

A plain "Hijri" is **not** in the table, on purpose:
- in Iran, it means the solar calendar;
- in Arab countries, it means the lunar calendar.
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
- Our code picks the year (`pickYear` in `src/legacy/extractedEvents/toGregorian.ts`). It counts
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

**"Today"** means today in the event's time zone. If the event has no zone,
the default zone is used.

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

### Not solved yet

- Around New Year: "9 January" with no weekday, sent in December, gets the
  current year. So it lands in the past. The 💡 note shows this.
- "29 February" with no year can land on a year that has no 29 February.
- Hebrew leap years have an extra month. So a Hebrew month number late in the
  year can mean different months in different years.

## Time zones

The event's time zone, in this order:

1. The zone the message states or suggests (the model's `timezone_hint`).
2. Otherwise, the user's `/tz` zone.
3. Otherwise, no zone: **"floating"** time.
   - The `.ics` file has no `TZID`.
   - The Google link has local times and no `ctz`.
   - Every calendar shows the time as written, in its own zone. 18:00 stays
     18:00.

In cases 2 and 3, the caption tells the user, and explains how to set a zone
with `/tz`.

**Why no default zone?** The first version used UTC. A user in Melbourne with
no `/tz` zone got an 18:00 event as 18:00 UTC. Google Calendar showed it at
4:00 the next morning. The caption explained it, but the calendar entry was
still wrong.

**The model decides about places, and models are different.**
- "Notting Hill" is in London and in Melbourne. So "no zone" is the right
  answer.
- "Nunawading" is only in Melbourne. But it depends on the model:
  `gemini-3.1-flash-lite` answers `Australia/Melbourne`, and
  `gemini-3.5-flash-lite` answers nothing.
- Both answers are safe, because a missing zone uses the rules above.
- We do not push the models to guess more. That would give wrong zones for
  places like "Notting Hill".
- The live tests accept both answers when the place is a suburb.

**The live tests share the dev Gemini quota with the dev bot.** Each run makes
about 12 calls. Frequent runs push requests to later models, which are
sometimes weaker.

## The real messages that showed us these rules

| Date | Message | What went wrong | Rule now |
|---|---|---|---|
| 27 Sep 2026 | "🎲 گیم‌نایت شنبه ۲۶ سپتامبر …" (game night, Saturday 26 Sep, no year) | The event was in 2027. The date had just passed, so the bot took next year. | A missing year |
| 27 Sep 2026 | The same message: "Notting Hill Neighbourhood House" | No zone, so UTC. 18:00 became 4:00 the next morning in Melbourne. | Time zones (floating time) |
| 27 Sep 2026 | A book-club post at "Nunawading Community Hub" | The live test failed when another model answered. | Time zones (models are different) |
| 27 Sep 2026 | "Thursday 9 Mehr" (film night, Solar Hijri, no year) | Declined: other calendars needed a stated year. | One conversion step, for every calendar |

**Tests:**
- `tests/unit/eventYear.test.ts`: missing years in any calendar, wrong
  weekdays.
- `tests/unit/eventTimezone.test.ts`: time zones and caption notes.
- `tests/unit/gameNight.test.ts`: the game night message, end to end.
- `tests/integration/extractEvent.test.ts`: what the live model returns.
