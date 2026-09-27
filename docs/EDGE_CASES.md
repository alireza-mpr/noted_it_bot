# Edge Cases

Real messages that tripped the bot, what went wrong, and how each is handled
now. Add a case when a message produces a wrong event.

## A date with no year that has just passed

**Message.** A forwarded Persian announcement on Sunday 27 September 2026:
"🎲 گیم‌نایت شنبه ۲۶ سپتامبر …" (game night, **Saturday 26 September**,
6:00–9:30 pm). The message gives no year.

**What went wrong.** The model correctly returned `year: null`. With no year,
the bot assumed the next time the date comes round, and 26 September had
passed the day before, so the event was created for **26 September 2027**,
which is a Sunday.

**The clue it missed.** The message states the weekday. 26 September 2026 is
a Saturday; 2027 is a Sunday. The weekday alone pins the year.

**Handling now.** The model copies the `weekday` the message states next to
the date (`"SA"`), as written, never worked out from the date. The year is then
chosen in code (`resolveYear` in `src/time/timezone.ts`), not by the model:

1. A stated year is kept.
2. Otherwise, if a weekday is stated, try this year and next year, and last
   year only if that date is within the last two months (a "Saturday 26
   December" forwarded in early January). Use the one the weekday fits, even
   if the date has passed: forwarded announcements often arrive late, and a
   past date beats the wrong year.
3. Otherwise (no weekday, or none of those years fits), use the current year.

Two caption notes make a wrong guess visible:
- **Past date:** a one-off event whose date is before today says "💡 this date
  has already passed …".
- **Weekday mismatch:** when the stated weekday doesn't match the final date,
  even with a stated year, the caption says "🤔 The message says Monday, but
  Jan 20, 2026 is a Tuesday. Check the date." (in the reply language). Not for
  recurring events, whose weekdays come from the pattern.

**Worked examples.** 20 January is a Monday in 2025, a Tuesday in 2026 and a
Wednesday in 2027.

| Message | Sent | Year used | Why | Notes shown |
|---|---|---|---|---|
| "Saturday 26 September" | 27 Sep 2026 | 2026 | the weekday fits this year | past date |
| "26 September" (no weekday) | 27 Sep 2026 | 2026 | current year | past date |
| "Sunday 26 September" | 27 Sep 2026 | 2027 | the weekday fits next year | none |
| "Saturday 26 December" | 2 Jan 2027 | 2026 | fits last year, a week ago | past date |
| "Monday Jan 20" | 15 Dec 2026 | 2026 | only 2025 fits, too old | past date, weekday mismatch |
| "Monday Jan 20" | 1 Feb 2026 | 2026 | only 2025 fits, too old | past date, weekday mismatch |

In the last two rows the message contradicts itself (probably a typo in the
weekday or the date), so the bot doesn't guess which part is wrong: it flags
both problems and the user can resend with the year.

**Still open.** Around New Year, a message with no weekday for a date early
next year ("9 January", sent in December) gets the current year and lands in
the past; the past-date note flags it. A 29 February with no year can land on
a year without one.

**Tests.** `tests/unit/eventYear.test.ts` (the year rules, this message's
extraction result, the "Monday Jan 20" cases and the mismatch details),
`tests/unit/eventTimezone.test.ts` (both notes in the caption) and
`tests/integration/extractEvent.test.ts` (the live model returns
`weekday: "SA"` for this message).

## A place that names no city

**Message.** The same announcement is held at "Notting Hill Neighbourhood
House". There is a Notting Hill in Melbourne and one in London.

**What happens.** The model can't tell which, so it returns no time zone
(`timezone_hint: null`). That's the right call: guessing wrong would shift the
event by hours.

**Handling now.** With no zone from the message, the event uses the user's
`/tz` choice. If they haven't set one, the times are written "floating": no
time zone at all, so every calendar shows 18:00 as 18:00 in its own zone. The
caption says which, and how to set a zone with `/tz`.

**Why not a default zone.** The first version used UTC. A user in Melbourne
without a `/tz` zone got this 18:00 game night as 18:00 UTC, which Google
Calendar showed as **4:00–7:30 am on Sunday 27 September**: a caption note
explained it, but the calendar entry itself was wrong. Floating time keeps
the time as written, which is what the message meant.

## A suburb the models know differently

**Message.** A Persian book-club announcement for "Nunawading Community Hub".
Nunawading is a Melbourne suburb, but the message never says "Melbourne".

**What happened.** The live extraction test started failing on 27 September
2026 without any code change. `gemini-3.1-flash-lite` had used up its daily
quota, so the router moved on to `gemini-3.5-flash-lite`. The first model
places the suburb and returns `Australia/Melbourne`; the second plays safe and
returns `timezone_hint: null`, every time.

**Handling now.** Both answers are acceptable: with null, the event uses the
user's `/tz` zone or floating times, and the caption says which. The test for this message
accepts either, so it no longer depends on which model has quota left. The
prompt isn't pushed to guess harder, since that would invite wrong zones for
ambiguous places (see "A place that names no city").

**Worth knowing.** The live tests share the dev Gemini quota with the dev bot,
and each run makes about a dozen calls, so running them often moves requests
onto the later, sometimes weaker, models.
