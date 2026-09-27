# Ubiquitous Language

These are the words we use for this bot. Every word has one meaning. We use
the same words in talk, in docs and in code. In Domain-Driven Design (DDD),
this list is called the "ubiquitous language".

**Rules:**
- Names in code use these words. The "In code" column shows the name.
- A new idea gets a row here before it gets a name in code.
- If a word is in [Words we don't use](#words-we-dont-use), use the word it
  points to.

## Messages and events

| Word | Meaning | In code |
|---|---|---|
| Message | What a user sends or forwards to the bot: text, or a photo or file with a caption. | `messageText` |
| Model answer | What a model returns for a message. Raw data, not parsed yet. | `ModelAnswer` |
| Draft | An event as the message describes it. Its dates are still in the message's calendar, and the year can be missing. | `CalendarEventDraft` |
| Create a calendar event | Turns a draft into a calendar event, or gives the reason why there is none. | `createCalendarEvent` → `CalendarEventResult` |
| Event creation context | What creating a calendar event needs besides the draft and its UID: the user time zone, now, and the floating time zone. | `EventCreationContext` |
| Calendar event | An event created from a draft: Gregorian dates, each with a year. Ready for output. | `CalendarEvent` |
| No event | Creating the calendar event found no usable date. | `reason: "no-event"` |
| Declined repeat | The repeat can't be trusted, so the bot does not guess it. | `repeatDeclineReason`, `reason: "repeat-declined"` |
| Title | The event's name. "Event" when the message gives none. | `title` |
| Location | Where the event happens. `null` when the message gives none. | `location` |
| Confidence | How sure the model is about the event, from 0 to 1. | `confidence` |
| Event UID | The identity of a calendar event, calculated from the message. The same message always gives the same UID. See [EDGE_CASES.md](EDGE_CASES.md#the-same-message-forwarded-again). | `EventUid`, `eventUidOf` |

## Dates and times

| Word | Meaning | In code |
|---|---|---|
| Date | A day: year, month and day. No time of day, no time zone. | `DateOnly` |
| Time of day | An hour and a minute, on a 24-hour clock. | `TimeOfDay` |
| Event time | All day, or timed with a start and an end time of day. | `EventTime` |
| Weekday | A day of the week, as an iCalendar code (`MO` … `SU`). | `Weekday` |
| Written date | A date as the message writes it. The year can be missing. It can have a written weekday. | `WrittenDate` |
| Written weekday | The weekday the message writes next to a date (e.g. "Saturday 26 Sep"). | `WrittenDate.weekday` |
| Wrong guess notes | The caption notes about a guess that may be wrong: 🤔 wrong weekday, 💡 in the past. Only one-off events get them. | `WrongGuessNotes` |
| Wrong weekday | A written weekday that doesn't match the date. The caption shows 🤔. | `wrongWeekday` |
| Year rule | How a date without a year gets one. See [EDGE_CASES.md](EDGE_CASES.md#a-missing-year). | `pickYear`, `pickEndYear` |
| In the past | A one-off event whose date is before today. The caption shows 💡. | `inPast` |
| Today | Today's date in the event's time zone. For floating times: in the floating time zone. | `today` |

## Calendars and output

| Word | Meaning | In code |
|---|---|---|
| Calendar | A system for counting dates: Gregorian, Persian (Solar Hijri), Hebrew, Buddhist, Indian. | `CalendarId` |
| Written-in calendar | The calendar that a message writes its dates in (e.g. Persian for "9 Mehr"). | `draft.writtenInCalendar` |
| Gregorian | The only calendar that calendar apps accept. Creating a calendar event turns every date into a Gregorian date. | `"gregory"` |
| Calendar app | Google Calendar, Apple Calendar, Outlook, and others. | — |
| Calendar file | The `.ics` file the bot sends. | `CalendarFile`, `calendarFileOf` |
| RRULE | iCalendar's name for the repeat line in a calendar file. An outside term, so "rule" is allowed here. | `rruleOf` |
| Google Calendar link | A link that opens Google Calendar with the event filled in. | `googleCalendarLinkOf` |
| Caption | The text sent with the calendar file: the summary, the link and the notes. | `captionOf` |
| Repeat sentence | The 🔁 line in the caption that says how the event repeats, in the reply language. | `repeatSentenceOf` |

## Time zones

| Word | Meaning | In code |
|---|---|---|
| Time zone | An IANA time zone name in its standard spelling, e.g. "Asia/Tehran". | `IanaTimeZone` |
| Event time zone | Where the event's time zone comes from: the message, the user's setting, or nowhere. | `EventTimeZone`, `eventTimeZoneOf` |
| Message time zone | The time zone the message states or suggests. | `draft.timeZone`, `kind: "from-message"` |
| User time zone | The time zone the user set with `/tz`. | `userTimeZone`, `parseUserTimeZoneName`, `kind: "from-user"` |
| Floating time | A time with no time zone. Every calendar app shows it as written (18:00 stays 18:00). | `kind: "floating"` |
| Floating time zone | The time zone that decides "today" for floating times (now UTC). | `floatingTimeZone` |
| Local date and time | The date and the time of day in a time zone, at a moment. | `LocalDateTime` |

## Repeats

| Word | Meaning | In code |
|---|---|---|
| Repeat | How often an event happens, and when it stops. | `Repeat` |
| One-off event | An event with no repeat. | `repeat: null` |
| Pattern | The days a repeat happens on. | `RepeatPattern` |
| Frequency | Daily, weekly, monthly or yearly. | `frequency` |
| Interval | Every how many days, weeks, months or years. 1 means every one. | `interval` |
| Day of the month | For a monthly repeat: the same day as the first date, a fixed day (e.g. "the 15th"), or a weekday of a week (e.g. "the first Friday"). | `MonthlyDay` |
| Week of the month | 1, 2, 3, 4 or "last". | `WeekOfMonth` |
| Repeat end | Never, until a date, or after a number of times. | `RepeatEnd` |
| Start date | The date the message writes for a repeat. It can be missing. | `draft.date` |
| First date | The first day that matches the pattern, on or after the start date (or today). | `firstDateOf` |

## Users

| Word | Meaning | In code |
|---|---|---|
| User | A Telegram user who talks to the bot. | `userId` |
| User settings | The language and time zone the user chose. `null` means not chosen. | `UserSettings` |
| User settings store | Where the user settings are saved. A port. | `UserSettingsStore` |
| Reply language | The language of the bot's messages: the user's choice, else Telegram's language, else English. | — |
| Supported language | A language the bot replies in (16 of them). | `SupportedLanguage`, `parseLanguageCode` |
| Bot message | A text the bot sends, with an id, e.g. `NO_TEXT_MESSAGE`. | `BOT_MESSAGES`, `BotMessageId` |
| Translation | A bot message in a supported language, written ahead of time (ADR-6). | `TRANSLATIONS`, `translate` |

## Quota

| Word | Meaning | In code |
|---|---|---|
| Daily quota | How many messages a user can send to a model per day. | `dailyQuota` |
| Unit | One use of the quota: one message sent to a model. | — |
| Consume | Take a unit before calling a model. In docs for readers: "use". | `tryConsume` |
| Refund | Give a unit back, when no model answered. In docs for readers: "give back". | `refund` |
| Reservation | What is needed to refund a unit exactly. | `QuotaReservation` |
| Quota reset | The daily quota is full again 24 hours after the last use. | `QUOTA_RESET_AFTER_MS` |
| Retry time | When a user with no quota left can try again. | `retryAt` |
| Quota policy | The quota rules for a user (tiers later). | `UserQuotaPolicy` |
| Usage store | Where the quota usage is saved. A port. | `UsageStore` |

## Models

| Word | Meaning | In code |
|---|---|---|
| Provider | A company that runs models behind an API: Gemini (Google) and Groq. | `Provider`, `ProviderClient` |
| Model | One model of a provider, e.g. `gemini-3.5-flash-lite`. | `Model`, `GEMINI_MODELS`, `GROQ_MODELS` |
| Model limits | A model's free limits (per minute and per day). A model at its limit is "used up". | `ModelLimits`, `LimitWindow` |
| Model failure | Why a model gave no answer, e.g. rate limited or unavailable. | `ModelFailure` |
| Router | Tries the models in order: Gemini first, then Groq. | `adapters/models/` |
| Extraction | Sends a message to a model, and turns the model answer into a draft. | — |

## Logging

| Word | Meaning | In code |
|---|---|---|
| Log event | One line the bot logs, as an OpenTelemetry log record: a severity, an event name and attributes. | `LogEvent`, `Logger` |
| Event name | The name of one kind of log event, e.g. `quota.consumed`. Not a calendar event. | `LogEvent.eventName` |
| Log attribute | A named value in a log event, with an OpenTelemetry name, e.g. `user.id`. | `LogAttributes` |
| Scope | The part of the code that logs, e.g. `user-activity`. | `scope.name` |
| Log session | The log events of one request. They are sent to Axiom together, at the end. | `runLogSession` |
| Trace id | The id of a log session. Every log event of the session has it. | `traceId` |
| User activity | A log event for one thing a user did, e.g. `user_activity.time_zone_set`. | `UserActivity`, `logUserActivity` |

## Code structure

| Word | Meaning | In code |
|---|---|---|
| Domain | The pure rules of this bot: no network, no database. | `src/domain/` |
| Generic subdomain | Generic helpers any app could use, not our business: e.g. do date math, convert data, format text. They are pure, and know nothing about this bot. | `src/generic/` |
| Output | Pure formats made from domain values: the calendar file, the link, the caption. | `src/output/` |
| Use case | One thing a user can do, e.g. create an event from a message. | `src/app/` |
| Rule | A product rule: a decision about how the bot behaves. It is written in [EDGE_CASES.md](EDGE_CASES.md) and coded in the domain. "Rule" never names data. | e.g. `pickYear` |
| Parse | Turn raw text or data into a typed value, or `null` or a failure if it is not valid. It is called only at the edge. | e.g. `parseTimeZoneName` |
| Entity | An object with an identity that stays the same when its content changes. Its identity is one of its fields. | `CalendarEvent` (identity: `uid`) |
| Value object | A small value with no identity, only its content (e.g. a date, a time zone). Its parse function is its only constructor, and lives next to it. | e.g. `IanaTimeZone` |
| Factory | Creates a complex object from several inputs, using rules. | `createCalendarEvent` |
| Port | An interface that the inside declares for something it needs from outside. | e.g. `UsageStore` |
| Store | A port where the domain saves data. Not a DDD repository: it runs atomic commands (e.g. consume a unit), not "load, change, save". | e.g. `UsageStore`, `UserSettingsStore` |
| Adapter | Code that talks to the outside world. It implements a port, turns raw data into typed values, or writes output (e.g. the logger). | `src/adapters/` |
| Edge | Where raw data comes in or goes out. The adapters are the edge. | `src/adapters/` |

## Words we don't use

| Don't say | Say | Why |
|---|---|---|
| plan, event plan | draft, or calendar event | An event is a draft or a calendar event. Nothing else. |
| check, checked (for a value) | parse, or create | "Check" does not say what happens to the value. |
| extracted event | draft, or model answer (for the raw data) | The old name mixed the two. |
| recurrence, repeat rule | repeat | One word for one idea. "Rule" never names data. |
| occurrence, first occurrence | first date | A common word. |
| ordinal | week of the month | A common word. |
| count (of a repeat) | after a number of times | A common word. |
| stated weekday | written weekday | One word for one idea. |
| zone hint, timezone hint | message time zone | Says where the time zone comes from. |
| calendar (for Google Calendar) | calendar app | "Calendar" means Gregorian, Persian, … |
| calendar (for an event) | calendar event | The same reason. |
| default time zone | floating time zone | Says what the time zone is for. |
| zone (alone) | time zone | A short form hides what it is. |
| repository | store | Our ports run atomic commands. A DDD repository loads and saves whole aggregates. |
