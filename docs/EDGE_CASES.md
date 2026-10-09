# Edge Cases

Real messages are often incomplete: no year, another calendar, "tonight", no
time zone. For each case, the bot has **one general rule**, used for every
message.

When a message gives a wrong event, find the rule it breaks and fix the rule.
Never add a fix for that one message.

## Dates

### One conversion step, for every calendar

1. The model copies the date **as written**, and names its calendar (e.g.
   "Gregorian", "Solar Hijri"). It never converts dates or works out
   weekdays: small models get this wrong, and a wrong date looks like a right
   one.
2. Our code converts the date to Gregorian and adds any missing year, in one
   step: `createCalendarEvent`
   (`src/domain/calendar-event/create-calendar-event.ts`).
3. Everything after that step sees only Gregorian dates: the repeat checks,
   the `.ics` file, the Google link and the caption. So no calendar is a
   special case.

**Calendars are data.** `src/adapters/models/extraction/calendar-names.ts`
lists each calendar the bot accepts, and the names the model may use for it
(e.g. "Jalali", "Hebrew"). To add a calendar, add it to `CalendarId` and add
a row. Only calendars whose years are plain numbers can be added: the
Japanese calendar counts years within eras, so it is not there.

A plain "Hijri" is refused on purpose. Some countries mean the solar
calendar, others the lunar one, and a wrong guess moves the date by about 600
years.

**The bot makes no event when it can't convert a date safely:**
- the calendar is not in the table;
- a date is written, but no calendar is named;
- the day doesn't exist (e.g. 30 Esfand in a common year);
- a monthly or yearly repeat is in a calendar whose months are not Gregorian
  months.

### A missing year

Announcements often give a date with no year, and sometimes the weekday too:
"Saturday 26 September", "Thursday 9 Mehr". The model copies the weekday as
written. Our code picks the year (`pickYear` in
`src/domain/calendar-event/year-rule.ts`), counting years in the message's own
calendar:

1. **If the message gives a weekday,** use the first of these years where the
   weekday fits: this year, next year, or last year if that date was in the
   last two months (e.g. "Saturday 26 December" forwarded in early January).
   A forwarded message often arrives late, so a past date is better than a
   wrong year.
2. **Otherwise** (no weekday, or no year fits), use the current year.

The **end date of a repeat** with no year takes the start's year, or the next
year if the end would come before the start.

**"Today"** is today in the event's time zone, or in the floating time zone
(UTC) when the event has none.

**The caption shows a guess that may be wrong,** in the reply language. The
bot never guesses which part of a contradicting message is wrong; the user can
send it again with the year.
- 💡 **Past date:** a one-off event whose date has passed.
- 🤔 **Wrong weekday:** the written weekday doesn't fall on the final date, even
  when the message gives the year. e.g. "The message says Monday, but Jan 20,
  2026 is a Tuesday. Check the date." Repeats don't get this note: their
  weekdays come from the pattern.

| Message | Sent on | Event date | Why | Notes |
|---|---|---|---|---|
| "Saturday 26 September" | 27 Sep 2026 | 26 Sep 2026 | the weekday fits this year | 💡 |
| "26 September" (no weekday) | 27 Sep 2026 | 26 Sep 2026 | current year | 💡 |
| "Sunday 26 September" | 27 Sep 2026 | 26 Sep 2027 | the weekday fits next year | — |
| "Saturday 26 December" | 2 Jan 2027 | 26 Dec 2026 | fits last year, one week ago | 💡 |
| "Monday Jan 20" | 15 Dec 2026 | 20 Jan 2026 | only 2025 fits, too long ago | 💡 🤔 |
| "Thursday 9 Mehr" (Solar Hijri) | 27 Sep 2026 (5 Mehr 1405) | 1 Oct 2026 | the weekday fits this Persian year | — |
| "Saturday 15 Tishrei" (Hebrew) | 20 Sep 2026 | 26 Sep 2026 | the weekday fits this Hebrew year | — |

(20 January is a Monday in 2025, a Tuesday in 2026 and a Wednesday in 2027.)

### Relative dates

A relative date (e.g. "tonight", "next Friday") is counted from **now**, in
the event's time zone. So 20:00 UTC on 26 Sep is already 27 Sep for an event
in Melbourne. The model only says which kind of relative date the message has;
our code works out the date.

| Message | Kind | Date, if sent on Wednesday 30 Sep |
|---|---|---|
| "today", "tonight", "this evening" | 0 days from today | Wed 30 Sep |
| "tomorrow", "tomorrow night" | 1 day from today | Thu 1 Oct |
| "the day after tomorrow" | 2 days from today | Fri 2 Oct |
| "Friday", "this Friday" | the coming Friday, counting today | Fri 2 Oct |
| "Wednesday" | the coming Wednesday, counting today | Wed 30 Sep |
| "next Friday" | Friday of next week | Fri 9 Oct |
| "next Wednesday" | Wednesday of next week | Wed 7 Oct |

- Weeks start on Monday. So on a weekend, "Friday" and "next Friday" are the
  same day, and on a Sunday "next Monday" is tomorrow.
- One event on a named weekday ("dinner on Friday") is a relative date. A
  weekday that repeats ("every Friday") is a repeat, which can also start on a
  relative date ("every Friday, starting tomorrow").
- Any other relative date (e.g. "this weekend", "in two weeks", "yesterday")
  gives no event.
- **A relative date needs a time zone,** from the message or the user's `/tz`.
  Without one, the bot makes no event and asks the user to set `/tz`. UTC
  would give a wrong date for some hours of every day, e.g. 00:00–10:00 in
  Melbourne or 20:00–24:00 in New York. A written date ("19 Sep") needs no
  time zone.

### A time with no date

People often write today's plans with only a time: "lunch with friends at 1,
Sadaf restaurant". A one-off event with a start time but no date is the next
time that time comes: **today, or tomorrow if the time has passed.**

| Sent at | "Lunch at 1" (13:00) is on |
|---|---|
| 10:00 or 13:00 | today |
| 15:00 | tomorrow |

- Like a relative date, it is counted from now, so it needs a time zone.
- A message with neither a date nor a time gives no event.
- A repeat with no start date ("every Thursday at 7:30pm") follows the
  [Repeats](#repeats) rule.

### Not solved yet

- "9 January" with no weekday, sent in December, gets the current year, so it
  lands in the past (the 💡 note shows it).
- "29 February" with no year can land on a year that has no 29 February.
- Hebrew leap years have an extra month, so a Hebrew month number late in the
  year can mean different months in different years.
- In Iran the week starts on Saturday. So for some Persian speakers, "next
  Friday" said on a Saturday may mean a week later than the bot's date.
- A date range (e.g. "zinc tablets from 5 Oct until 10 Oct") is not read as
  one event.

## Event time

- **No start time: an all-day event,** with a 🤔 note. The bot never guesses a
  time.
- **A start time but no end time: one hour** (e.g. 20:00–21:00).
- **Not solved yet:** a start at 23:00 or later with no end time ends after
  midnight (23:30 gives 00:30), but on the same date.

## Repeats

Our code works out every date of a repeat; the model only describes the
pattern.

**The first date:**
- With a start date: the first day on or after it that matches the pattern
  (e.g. "every Thursday, from Saturday 26 Sep" starts on Thursday 1 Oct).
- With no start date: the first matching day from today. Today counts only if
  the event hasn't started yet.
- A weekly repeat with no weekdays falls on the weekday of the first date.

**A repeat that can't be trusted is declined.** A wrong repeat would quietly
fill someone's calendar, so the bot says no instead of guessing when:
- the model's confidence is below 0.7;
- the interval is not a whole number of at least 1;
- a monthly weekday pattern has no weekdays, or a day of the month is not
  between 1 and 31;
- "after N times" has N below 1;
- there is no start date, and the pattern doesn't say which days (e.g. "every
  week");
- no day matches the pattern within about two years;
- the end date is before the first date.

**Monthly and yearly repeats work only in the Gregorian calendar,** because
other calendars' months are not Gregorian months. Such a message gets no
event.

## Time zones

The event's time zone is the first of these that exists:

1. **The message's:** a time zone it states, or a place it names (the model's
   `timezone_hint`).
2. **The user's:** set with `/tz`.
3. **None: "floating" time.** The `.ics` file has no `TZID`, the Google link
   has no `ctz`, and every calendar shows the time as written (18:00 stays
   18:00).

In cases 2 and 3, the caption says so and explains `/tz`.

**Why no default time zone:** the first version used UTC. A user in Melbourne
with no `/tz` got an 18:00 event at 4:00 the next morning in Google Calendar.

**What `/tz` accepts:** "Area/Location" names (e.g. "Australia/Melbourne"),
UTC and GMT. Short names like "CST" are refused: it is used in the USA, China
and Cuba.

**The model decides about places, and models differ:**
- A place in only one city sets the time zone, even when the message doesn't
  name the city. e.g. a talk on "Karimkhan Street" is in Tehran. Without this,
  a user in Melbourne would get that Tehran event in Melbourne time, 6.5 hours
  off.
- A place in several cities gets no time zone. e.g. "Notting Hill" is in
  London and in Melbourne.
- A suburb depends on the model: for "Nunawading", `gemini-3.1-flash-lite`
  answers Melbourne and `gemini-3.5-flash-lite` answers nothing. Both are
  safe, so the live tests accept both.

## The reply language

The bot replies in the first of these that is set:

1. The language the user chose with `/lang`. `/lang auto` removes the choice.
2. **English edition only:** the language of the user's Telegram app, if the
   bot has it. The region is ignored (e.g. "pt-BR" gives Portuguese).
3. The edition's default: English or Persian.

The Persian edition skips step 2: many Persian speakers have their Telegram
app in English, and they chose this bot because it speaks Persian.

## The same message, forwarded again

The event UID is a SHA-256 hash of the message text, trimmed. So when a user
forwards the same message again, the calendar app updates the event instead of
adding a copy. Any change to the text, even one character, makes a new event.

## The real messages behind these rules

| Date | Message | What went wrong | Rule now |
|---|---|---|---|
| 27 Sep 2026 | "Game night, Saturday 26 Sep", no year | The event was in 2027: the date had just passed, so the bot took next year. | A missing year |
| 27 Sep 2026 | The same message, at "Notting Hill Neighbourhood House" | No time zone, so UTC: 18:00 became 4:00 the next morning in Melbourne. | Time zones (floating time) |
| 27 Sep 2026 | A book-club post at "Nunawading Community Hub" | The live test failed when another model answered. | Time zones (models differ) |
| 27 Sep 2026 | "Thursday 9 Mehr" (film night, Solar Hijri, no year) | No event: other calendars needed a written year. | One conversion step, for every calendar |
| 29 Sep 2026 | "Tonight dinner with Sam" | No event: relative dates were not read. | Relative dates |
| 29 Sep 2026 | A book review on "Karimkhan Street", no city | No time zone, so the user's Melbourne time was used. | Time zones (places in one city) |
| 29 Sep 2026 | "Zinc tablets, 5 to 10 Oct" | Not read as one event. | Not solved yet |
| 3 Oct 2026 | "Lunch at 1 at Karma restaurant", no date) | No event: the message has no date. | A time with no date |

**Where the tests are:**
- `tests/unit/domain/calendar-event/`: one test file per rule (e.g.
  `year-rule.test.ts`, `relative-date-rule.test.ts`), and
  `create-calendar-event.test.ts` for whole drafts.
- `tests/integration/extract-draft.test.ts`: what the live models answer for
  real messages.
- Tests of Persian messages are in `*.fa.test.ts` files next to these, e.g.
  `create-calendar-event.fa.test.ts` (the game night) and
  `extract-draft.fa.test.ts`.
