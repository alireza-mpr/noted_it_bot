# Code Structure

This file sets the rules for how the code is organised. All new code must
follow it.

**The code is being rewritten.** The old code is in `src/legacy/`. It keeps
running the bot until the new code replaces it. Then `src/legacy/` is deleted.
The table in [What replaces what](#what-replaces-what) shows the progress.

The decision and the other options are in ADR-7 of
[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).

## The idea in one sentence

**Pure rules in the middle, input and output at the edges.** This is called
"functional core, imperative shell", with a light version of "ports and
adapters".

- The hard parts of this bot are rules: dates, calendars, repeats, time zones,
  the quota, the `.ics` format. These are **pure functions**: same input, same
  output, no network, no database.
- Talking to Telegram, D1, the models and Axiom happens only **at the edges**.
- The edges call the rules. The rules never call the edges.

## Principles

1. **Pure core, input and output at the edges.** A rule never reads a database,
   calls a model, or sends a message. It gets data and returns data.
2. **Separation of concerns: one module, one idea.** A file holds one idea
   from [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md). There are two kinds
   of domain files:
   - A **data file** is named after a glossary noun (e.g. `repeat.ts`). It
     holds the type and plain calculations on it (e.g. `matchesPattern`), but no
     product rule.
   - A **rule file** is named `*-rule.ts` (e.g. `year-rule.ts`). It holds one
     product rule from [EDGE_CASES.md](EDGE_CASES.md).
   A function that creates something from several rules (e.g.
   `create-calendar-event.ts`) only puts the rules together. It has no rule of
   its own.
   Before you add an export, check that it belongs to the file's idea. If
   not, it goes to another file (e.g. a time of day does not belong in
   `date-only.ts`).
3. **Dependencies point inward.** `generic/` imports nothing of ours.
   `domain/` and `output/` never import from
   `app/` or `adapters/`. (A unit test checks this. See
   [How the rules are checked](#how-the-rules-are-checked).)
4. **Parse raw data once, at the edge.** Turn raw input (the model's answer, a
   Telegram update, a request body) into a typed value once. After that, the
   code never checks the same thing again, and never uses `!`.
5. **Functions by default. Classes only for state or a replaceable part**, for
   example a repository, a model client, or the Telegram client.
6. **Files read top down,** in this order, after the imports:
   1. private constants;
   2. exported types;
   3. exported functions, the main one first;
   4. private functions and types.
7. **Use `null` for things that are optional by nature, and name modes.**
   - Optional by nature → `T | null` (e.g. an event's location, a year the
     message leaves out). The type's comment says what `null` means.
   - If `null` would always fall back to one case, name that case instead
     (e.g. no time zone = `{ kind: "floating" }`, not `timeZone: null`).
   - Several cases with different data → a union with `kind`.
   - `?` and `undefined` are fine for optional parameters and options, usually
     with a default (e.g. `now: Date = new Date()`). Don't use both `null` and
     `undefined` for the same thing.
   - Raw outside data (the model's answer, Telegram updates, database rows) is
     converted once, at the edge.
8. **Follow SOLID.** Here it applies to modules, functions and ports, not only
   to classes.

   | Principle | What it means here |
   |---|---|
   | **S**ingle responsibility | One idea per module (principle 2). One job per function. |
   | **O**pen/closed | Add new behaviour by adding code, not by changing working code (e.g. a new provider is a new adapter behind the same port; user tiers change only the quota policy). |
   | **L**iskov substitution | Every implementation of a port keeps the port's promises (e.g. a fake `UsageStore` in tests behaves like the D1 one). |
   | **I**nterface segregation | Ports are small: only what the caller needs (e.g. `UsageStore` has two methods). |
   | **D**ependency inversion | The inside declares ports, adapters implement them, and `app/` connects them (principle 3). |

## Folders

```
src/
  generic/     generic helpers any app could use, not our business (DDD: a
               "generic subdomain"): e.g. do date math, convert data,
               format text
    date-time/        dates, times of day, time zones, calendar conversion
    hash/             hashing a text
    html/             escaping text for HTML
    icalendar/        RFC 5545 text and date formats
    json/             turning a value into JSON text, without throwing
    text/             filling {0}, {1}, … in a text; cutting a long text
  domain/      pure rules, no input or output
    calendar-event/   CalendarEventDraft → a CalendarEvent, the calendars we
                      accept, the year rule, repeats
    quota/            the daily quota rules (user tiers later)
    user/             the user's settings: language and time zone
  output/      pure formats made from domain values
               (.ics file, Google Calendar link, caption texts, dates in a language)
  i18n/        the bot's messages and their translations (data and lookup only)
  app/         use cases: one file per thing a user can do; connects domain,
               output and adapters
  adapters/    the edges
    telegram/  webhook, Telegram client, sending replies
    database/  SQL, table definitions, repositories (D1 today)
    models/    the model types, the router, extraction; no product names
      providers/  the only place that knows Gemini and Groq: their clients,
                  answer parsers and model lists
    logging/   the logger and Axiom
    web/       web pages the Worker serves: the /tz page and its routes
  config/      APP_CONFIG and Env
  todo/        temporary: values whose place is not decided yet (each file
               says why in a TODO)
```

**A domain folder is named after one word from
[UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md), in the singular** (e.g.
`calendar-event/`, not `calendar-events/`). The layer folders (`generic/`,
`domain/`, `output/`, `app/`, `adapters/`) keep their architecture names.

**`generic/` or `domain/`?** Ask: "Would another app need exactly this?" If
yes (e.g. adding days to a date), it goes to `generic/`. If it is a decision
about this bot (e.g. which calendars we accept, which time zone names a user
may type), it goes to `domain/`.

**Adapter folders are named by their job, not by the product:** `database/`,
not `d1/`. Then only that folder knows which product is used, and a switch
later changes one folder. The one exception is `telegram/`: the bot is a
Telegram bot, so the product is the job.

**Who may import whom:**

| Folder | May import from |
|---|---|
| `generic/` | `generic/` only |
| `domain/` | `domain/`, `generic/` |
| `output/` | `domain/`, `i18n/`, `generic/` |
| `i18n/` | nothing (only its own data) |
| `app/` | `domain/`, `output/`, `i18n/`, `adapters/`, `config/`, `generic/` |
| `adapters/` | `domain/`, `output/`, `i18n/`, `config/`, `generic/`, other adapters |
| `config/` | nothing |

When a rule in `domain/` needs data from outside (for example the quota needs
the user's usage), it declares an **interface** (a "port"). An adapter
implements it, and `app/` connects the two.

## Coding rules

| Rule | Example |
|---|---|
| Results are a union with an `ok` field | `{ ok: true; … } \| { ok: false; … }` |
| A failure carries its own details | `ProviderFailure` has `ok: false`, `kind`, `detail` |
| Parse once, then use typed values | `createCalendarEvent` turns a `CalendarEventDraft` into a `CalendarEvent` |
| One type per idea | `DateOnly` for every date, not three look-alike types |
| No test-only code in `src/` | helpers only tests use go in `tests/` |
| Comments: MSDN wording, `//` style | `// Represents a date in a message where …` |
| Every name explains itself: types, functions, variables, fields, files | rename instead of explaining with a comment (`statedWeekday`, not `stated` + a comment) |
| No comments on fields | the field's name explains it |
| Variable names follow their type, in camelCase | `calendarEventResult: CalendarEventResult`, not `checked` or `result` |
| Several values of one type: the role comes first | `startDate`, `untilDate` (both `DateOnly`) |
| No generic or one-letter names (a loop index is fine) | not `data`, `answer`, `r` |
| Simple English everywhere | short sentences, common words |
| Mark every example with "e.g." | `// e.g. "tomorrow": not supported yet` |
| Names use the words in [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) | "repeat", not "recurrence" |

### Casing

| What | Casing | Example |
|---|---|---|
| Variables, functions, fields | camelCase | `calendarEventResult`, `pickYear`, `wrongWeekday` |
| Types, interfaces, classes | PascalCase | `CalendarEvent`, `UserQuotaPolicy` |
| Constants at module level | UPPER_SNAKE_CASE | `MIN_REPEAT_CONFIDENCE` |
| `kind` and `reason` values | kebab-case | `"from-message"`, `"repeat-declined"` |
| Files and folders | kebab-case | `calendar-event/create-calendar-event.ts` |
| Env vars and secrets | UPPER_SNAKE_CASE | `GEMINI_API_KEY` |
| Docs | UPPER_SNAKE_CASE | `CODE_STRUCTURE.md` |
| Log event names and attributes | OpenTelemetry: lowercase, dots between parts, snake_case inside a part (see [Logging](#logging)) | `user_activity.time_zone_set`, `http.response.status_code` |

Files and folders are all lowercase because macOS ignores letter case in file
names and Linux (CI) does not. So a wrong case in an import works on a Mac and
fails in CI.

### Comments: what, why, how

| Kind | Where | Form |
|---|---|---|
| **What** | Above a type or function | One line, e.g. "Returns …" or "Represents …". |
| **Why** | Inside the body, on the line it explains | Only when the code would look wrong without it. |
| **How** | Nowhere | If the code needs it, split it into functions with clear names. |
| **Product rules** (e.g. the year rule, the time zone order) | [docs/EDGE_CASES.md](EDGE_CASES.md) | The comment names the rule, e.g. "See 'A missing year' in EDGE_CASES.md". |

### Logging

Log events use OpenTelemetry (OTel) names. See ADR-9 in
[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).

| Part | Rule | Example |
|---|---|---|
| The event's own fields | The field names of an OTel log record | `severityText`, `eventName`, `traceId`, `scope.name` |
| Event names | One name per kind of event. Each logger lists its names in a union: `Logger<EventName>` | `quota.consumed` |
| Attributes | OTel's name, when OTel has one | `user.id`, `http.response.status_code` |
| Our own names | Start with our area. Never start with an OTel namespace (e.g. `user.`, `http.`, `error.`, `event.`, `session.`, `message.`, `service.`): check the [OTel registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/) | `telegram.chat.id`, `extraction.message_text` |
| Values from a fixed list | snake_case | `no_model` |
| Levels | `error`: a developer must act. `warn`: something failed, but the bot handled it. `info`: normal behaviour. | |
| One fact, one event | Never log the same fact twice. | |
| Errors | `exceptionAttributesOf(error)`, never nested under another attribute | |

The attribute names every area shares:

| Idea | Attribute |
|---|---|
| The user | `user.id`, `user.name` (the Telegram username), `user.full_name` (the first name and the last name) |
| The chat | `telegram.chat.id` |
| An error | `exception.type`, `exception.message`, `exception.stacktrace` |
| An HTTP status | `http.response.status_code` |
| The model | `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` |
| The reply language | `telegram.reply_language` |
| The message text and the model answer | `extraction.message_text`, `extraction.model_answer` |

## What replaces what

Paths are under `src/`. Status: ✅ done, ⏳ to do.

The old tests are the specification. Each area's tests are ported to the new
code, together with that area.

| Old code (`legacy/`) | New code | Status |
|---|---|---|
| `time/dateOnly.ts` | `generic/date-time/date-only.ts`, `generic/date-time/time-of-day.ts`; `nowIn` → `localDateTimeIn` in `generic/date-time/time-zone.ts`; `parseTime` → the edge that reads the model's answer | ✅ (`parseTime` ⏳) |
| `time/timezone.ts`, `time/canonicalTimezone.ts` | `generic/date-time/time-zone.ts` (`parseTimeZoneName`), `domain/user/user-time-zone-rule.ts` (`parseUserTimeZoneName`) | ✅ |
| `extractedEvents/toGregorian.ts` | `generic/date-time/calendar-conversion.ts`, `domain/calendar-event/calendar.ts` (`CalendarId`), `domain/calendar-event/year-rule.ts` (`pickYear`, `pickEndYear`), `domain/calendar-event/create-calendar-event.ts` (the dates of an event); the calendar names the model uses → `adapters/models/` | ✅ (names ⏳) |
| `extractedEvents/extractedEvent.ts` | `domain/calendar-event/calendar-event-draft.ts`, `domain/calendar-event/event-time.ts`; turning the model's answer into a draft → `adapters/models/` | ✅ (answer → draft ⏳) |
| `extractedEvents/eventPlan.ts` | `domain/calendar-event/calendar-event.ts`, `event-time-zone.ts`, `time-zone-order-rule.ts`, `wrong-guess-rule.ts`, `create-calendar-event.ts` (all in `domain/calendar-event/`) | ✅ |
| `extractedEvents/recurrence.ts` (rules) | `repeat.ts`, `first-date-rule.ts`, `repeat-decline-rule.ts`, `repeat-calendar-rule.ts` (all in `domain/calendar-event/`) | ✅ |
| `RECURRENCE_MIN_CONFIDENCE` in `extractedEvents/recurrence.ts` | `todo/repeat-confidence.ts`, until we decide where it belongs | ⏳ |
| `extractedEvents/eventUid.ts` | `domain/calendar-event/event-uid-rule.ts`, `generic/hash/sha256-hex.ts` | ✅ |
| `policy/userQuotaPolicy.ts` | `domain/quota/user-quota-policy.ts`, with the `UsageStore` port in `domain/quota/usage-store.ts` | ✅ |
| `policy/userQuotaPolicyLogger.ts` | the quota use case in `app/` logs the line with a `Logger` (step 5) | ⏳ |
| the user's language and time zone (`repositories/userPreferenceRepository.ts`) | `domain/user/user-settings.ts` (type) | ✅ |
| `extractedEvents/calendarEvent.ts` (`.ics` part) | `output/calendar-file.ts`, `generic/icalendar/` | ✅ |
| `extractedEvents/calendarEvent.ts` (link part) | `output/google-calendar-link.ts` | ✅ |
| `extractedEvents/calendarEvent.ts` (caption texts), the caption in `eventMessageHandler.ts` | `output/caption.ts`, `output/localized-number.ts`; `telegramHtml.ts` → `generic/html/escape-html.ts` | ✅ |
| `extractedEvents/recurrence.ts` (RRULE) | `output/rrule.ts` | ✅ |
| `extractedEvents/recurrence.ts` (the English repeat sentence) | `output/repeat-sentence.ts` | ✅ |
| date formatting in a language (in `calendarEvent.ts`) | `output/localized-date-time.ts` | ✅ |
| `time/formatWait.ts` | not decided yet (the quota refusal message) | ⏳ |
| `interactiveMessages/messages.ts`, `translation/translate.ts`, `translation/translations/*` | `i18n/bot-message.ts`, `i18n/translation.ts`, `i18n/translations/*` | ✅ |
| `translation/language.ts` | `i18n/supported-language.ts` (the list, `parseLanguageCode`); the `/lang` name parsing and language names → with `/lang` in step 5 | ✅ (`/lang` part ⏳) |
| `translation/placeholders.ts` | `generic/text/fill-placeholders.ts` | ✅ |
| `telegram/messageHandlers/updateHandler.ts` | `app/handle-update.ts` | ⏳ |
| `telegram/messageHandlers/eventMessageHandler.ts` | `app/create-event-from-message.ts` | ⏳ |
| `telegram/commands/*` | `app/commands/*` | ⏳ |
| `extractedEvents/extractEvent.ts`, `event_schema.ts`, `prompts/event_extract.txt` | `adapters/models/`, with the answer → draft parser (step 4d-3) | ⏳ |
| `telegram/telegramWebhook.ts`, `telegramClient.ts`, `telegramTypes.ts`, `telegramHtml.ts`, `replier.ts` | `adapters/telegram/` | ⏳ |
| `db/*/userUsage*`, `db/*/userPreference*`, `repositories/userUsageRepository.ts`, `repositories/userPreferenceRepository.ts` | `adapters/database/d1-usage-store.ts`, `adapters/database/d1-user-settings-store.ts`, `adapters/database/batch-with-table.ts`; the port `domain/user/user-settings-store.ts`; `QUOTA_RESET_AFTER_MS` → `domain/quota/user-quota-policy.ts` | ✅ |
| `db/*/geminiUsage*`, `db/*/groqUsage*`, `repositories/geminiUsageRepository.ts`, `repositories/groqUsageRepository.ts`, `time/dateTimeAest.ts` | `adapters/database/`, with the models (step 4d) | ⏳ |
| `providers/*` | `adapters/models/model.ts` (`ProviderConfig` → `Model`, `ProviderLimits` → `ModelLimits`), `model-result.ts`, `provider-client.ts`; `adapters/models/providers/` (`registry.ts` → `model-list.ts`, the clients, the answer parsers, `jsonSchema.ts` → `groq-json-schema.ts`) | ✅ |
| `router/*`, `quotaLimit/*` | `adapters/models/` (step 4d-2) | ⏳ |
| `prompts/diag_ping.txt` | with `/diag` in `app/commands/` (step 5) | ⏳ |
| `logging/*` | `adapters/logging/`: `log-event.ts`, `logger.ts`, `log-session.ts`, `axiom.ts`, `user-activity.ts` (`Activity` → `UserActivity`, `logActivity` → `logUserActivity`), with OpenTelemetry names (see [Logging](#logging)); `truncate` → `generic/text/truncate-text.ts`, `safeStringify` → `generic/json/safe-json-stringify.ts` | ✅ |
| `web/*` | `adapters/web/` | ⏳ |
| `appConfig/appConfig.ts`, `env.ts` | `config/app-config.ts` (`appConfig` → `APP_CONFIG`, `defaultTimezone` → `floatingTimeZoneName`), `config/env.ts` | ✅ |
| `buildCalendarEvent` (used only by tests) | a helper in `tests/` | ⏳ |
| `text-modules.d.ts`, `node-modules.d.ts` | stay in `src/` | ✅ |

## Order of the work

The new code is built **beside** the old code. The old code keeps running
until the last step, so the bot is never half broken, and the work can stop
after any step. Rewrite one area per commit, with its tests. All tests pass
after each commit.

| Step | What | Status |
|---|---|---|
| 0 | The folder skeleton, and the import-rule test | ✅ |
| 1 | The domain model: the types for dates, time zones, events, repeats, the quota and user settings. `null` only where a value is optional by nature (principle 7). | ✅ |
| 2 | The domain rules, as pure functions: creating a calendar event from a draft, calendars, the year rule, repeats, the quota | ✅ |
| 3a | Output: the calendar file (`.ics`) | ✅ |
| 3b | Output: the Google Calendar link | ✅ |
| 3c-1 | Output: dates and times in the reply language | ✅ |
| 3c-2 | Output: the repeat sentence, in English (as in the old code) | ✅ |
| 3c-3 | i18n: the message texts, the translations, and the lookup | ✅ |
| 3c-4 | Output: the repeat sentence in the reply language, with stored templates (a bug fix: no English inside a non-English reply) | ✅ |
| 3c-5 | Output: the caption, with numbers in the reply language (a bug fix: "9974" in a Farsi reply) | ✅ |
| 4a | Config: `APP_CONFIG` and `Env` | ✅ |
| 4b | Adapters: logging (the logger, the log session, Axiom, user activity) | ✅ |
| 4c | Adapters: the database for users (the quota usage and the user settings) | ✅ |
| 4d-1 | Adapters: the provider clients (Gemini, Groq), the model list and limits, the model result types | ✅ |
| 4d-2 | Adapters: the model usage (windows, the `gemini_usage` and `groq_usage` stores) and the router | ⏳ |
| 4d-3 | Adapters: extraction (the prompt, the answer schema, the model answer → `CalendarEventDraft`) | ⏳ |
| 4e | Adapters: Telegram (the client, update types, the webhook, replies) | ⏳ |
| 4f | Adapters: the web pages (the /tz page and its routes) | ⏳ |
| 5 | App: one use case per file (create an event, set a language, set a time zone, …). `UserQuotaPolicy` decides the daily quota itself (from `APP_CONFIG` now, from the user's tier later), so the app calls `tryConsume(userId, now)`. | ⏳ |
| 6 | Point `wrangler.toml` `main` at the new entry point, delete the old code, and update the README | ⏳ |

## How the rules are checked

- **Import rule:** a unit test (`tests/unit/code-structure.test.ts`) reads every
  source file. It fails if a file in `generic/`, `domain/`, `output/`,
  `i18n/`, `config/` or `adapters/` imports from a folder that the "Who may import whom" table
  does not allow.
- **Casing:** the same test fails if a folder or file outside `legacy/` is not
  kebab-case.
- **Types:** `npm run typecheck` in CI.
- **Behaviour:** every step keeps all unit and live tests passing.
- **Review:** the project `CLAUDE.md` tells Claude Code to follow this file for
  every change.
