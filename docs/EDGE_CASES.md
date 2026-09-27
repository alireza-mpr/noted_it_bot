# Edge Cases

How the bot handles the awkward parts of real messages: missing years, dates in
other calendars, and missing time zones. Each is one general rule, applied to
every message the same way. The real messages that exposed them are at the end.

When a message produces a wrong event, find which rule it breaks and fix the
rule, not the message.

## Dates

### One conversion step, any calendar

The model copies a date as written and names its calendar ("Gregorian", "Solar
Hijri", …). Every event then goes through one step, `toGregorianEvent`
(`src/extractedEvents/toGregorianEvent.ts`), which turns its dates into
Gregorian ones with known years, whatever calendar they came in. Everything
after it (the repeat check, the `.ics`, the Google link, the caption notes)
only sees Gregorian dates, so no calendar is a special case.

Calendars are data: a table of the date library's calendars and the names the
model may use for each ("Jalali", "Lunar Hijri", "Hebrew" …). Adding a calendar
means adding a row. A bare "Hijri" is deliberately missing: it means the solar
calendar in Iran and the lunar one in Arab countries, and guessing wrong
misplaces the date by centuries.

A date is declined when it can't be converted reliably: a calendar not in the
table, a written date with no calendar named, a day that doesn't exist (30
Esfand in a common year), or a monthly or yearly repeat in a calendar whose
months don't line up with Gregorian ones.

### A missing year

Announcements often give a date without a year, sometimes with its weekday
("Saturday 26 September", "Thursday 9 Mehr"). The model copies that weekday as
written (`weekday`), never working it out from the date. The year is then
picked in code (`pickYear` in `src/time/timezone.ts`), counted in the message's
own calendar:

1. If a weekday is stated, try this year and next year, and last year only if
   that date is within the last two months (a "Saturday 26 December" forwarded
   in early January). Use the one the weekday fits, even if the date has
   passed: forwarded announcements often arrive late, and a past date beats
   the wrong year.
2. Otherwise (no weekday, or none of those years fits), use the current year.

A repeat's end date without a year takes the start's year, or the next one if
it would fall before the start.

"Today" is in the event's time zone, or the default zone when it has none.

### Making a wrong guess visible

Two caption notes, in the reply language:
- **Past date** (💡): a one-off event whose date is before today.
- **Weekday mismatch** (🤔): the stated weekday doesn't fall on the final date,
  even when the year was stated: "The message says Monday, but Jan 20, 2026 is
  a Tuesday. Check the date." Not for repeats, whose weekdays come from the
  pattern.

When a message contradicts itself, the bot doesn't guess which part is wrong:
it flags it, and the user can resend with the year.

### Worked examples

| Message | Sent | Event | Why | Notes |
|---|---|---|---|---|
| "Saturday 26 September" | 27 Sep 2026 | 26 Sep 2026 | the weekday fits this year | past date |
| "26 September" (no weekday) | 27 Sep 2026 | 26 Sep 2026 | current year | past date |
| "Sunday 26 September" | 27 Sep 2026 | 26 Sep 2027 | the weekday fits next year | none |
| "Saturday 26 December" | 2 Jan 2027 | 26 Dec 2026 | fits last year, a week ago | past date |
| "Monday Jan 20" | 15 Dec 2026 | 20 Jan 2026 | only 2025 fits, too far back | past date, weekday mismatch |
| "Monday Jan 20" | 1 Feb 2026 | 20 Jan 2026 | only 2025 fits, too far back | past date, weekday mismatch |
| "Thursday 9 Mehr" (Solar Hijri) | 27 Sep 2026 (5 Mehr 1405) | 1 Oct 2026 | the weekday fits this Persian year | none |
| "Saturday 15 Tishrei" (Hebrew) | 20 Sep 2026 | 26 Sep 2026 | the weekday fits this Hebrew year | none |

20 January is a Monday in 2025, a Tuesday in 2026 and a Wednesday in 2027.

### Still open

- Around New Year, a message with no weekday for a date early next year ("9
  January", sent in December) gets the current year and lands in the past;
  the past-date note flags it.
- A 29 February with no year can land on a year without one.
- Hebrew leap years add a month, so a Hebrew month number late in the year
  can mean different months in different years.

## Time zones

An event's zone is, in order:

1. the zone the message states or implies (the model's `timezone_hint`);
2. otherwise the user's `/tz` choice;
3. otherwise none: the times are written **floating** (no `TZID` in the
   `.ics`, local times and no `ctz` in the Google link), so every calendar
   shows them as written in its own zone, and 18:00 stays 18:00.

In cases 2 and 3 the caption says which, and how to set a zone with `/tz`.

**Why not a default zone.** The first version used UTC. A Melbourne user
without a `/tz` zone got an 18:00 event as 18:00 UTC, which Google Calendar
showed at 4:00 the next morning. The note explained it, but the calendar entry
was still wrong.

**Places are left to the model, and models differ.** "Notting Hill" is in both
London and Melbourne, so no zone is the right answer. "Nunawading" is only in
Melbourne, but whether a model places it depends on the model:
`gemini-3.1-flash-lite` says `Australia/Melbourne`, `gemini-3.5-flash-lite`
says nothing. Both are safe, because a missing zone falls back to the rules
above. The prompt isn't pushed to guess harder, since that invites wrong zones
for ambiguous places, and the live tests accept either answer where the place
is a suburb.

The live tests share the dev Gemini quota with the dev bot. Each run makes
about a dozen calls, so running them often moves requests onto the later,
sometimes weaker, models.

## The messages that exposed these rules

| Date | Message | What went wrong | Rule now |
|---|---|---|---|
| 27 Sep 2026 | "🎲 گیم‌نایت شنبه ۲۶ سپتامبر …" (game night, Saturday 26 Sep, no year) | created for 2027: the date had just passed, so the next occurrence was assumed | a missing year |
| 27 Sep 2026 | the same message, "Notting Hill Neighbourhood House" | no zone, so UTC: 18:00 became 4:00 the next morning in Melbourne | time zones (floating) |
| 27 Sep 2026 | a book-club post at "Nunawading Community Hub" | the live test failed when a different model answered | time zones (models differ) |
| 27 Sep 2026 | "Thursday 9 Mehr" (film night, Solar Hijri, no year) | declined: non-Gregorian dates needed a stated year | one conversion step, any calendar |

**Tests.** `tests/unit/eventYear.test.ts` (missing years in any calendar,
weekday mismatches), `tests/unit/eventTimezone.test.ts` (zones and caption
notes), `tests/unit/gameNight.test.ts` (the game night message end to end) and
`tests/integration/extractEvent.test.ts` (what the live model returns).
