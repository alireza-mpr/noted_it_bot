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
2. **One module, one job.** Name a file after its job (`icsFile.ts`). If a file
   does two jobs, split it.
3. **Dependencies point inward.** `domain/` and `output/` never import from
   `app/` or `adapters/`. (A unit test checks this. See
   [How the rules are checked](#how-the-rules-are-checked).)
4. **Check data once, at the edge.** Turn raw input (the model's answer, a
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
     (e.g. no time zone = `{ kind: "floating" }`, not `zone: null`).
   - Several cases with different data → a union with `kind`.
   - `?` and `undefined` are fine for optional parameters and options, usually
     with a default (e.g. `now: Date = new Date()`). Don't use both `null` and
     `undefined` for the same thing.
   - Raw outside data (the model's answer, Telegram updates, database rows) is
     converted once, at the edge.

## Folders

```
src/
  domain/      pure rules, no input or output
    dates/     dates, times, time zones, other calendars, picking a year
    event/     CalendarEventDraft → a checked CalendarEvent, repeat rules
    quota/     the daily quota rules (user tiers later)
    user/      the user's settings: language and time zone
  output/      pure formats made from domain values
               (.ics file, Google Calendar link, caption texts, dates in a language)
  i18n/        the bot's messages and their translations (data and lookup only)
  app/         use cases: one file per thing a user can do; connects domain,
               output and adapters
  adapters/    the edges
    telegram/  webhook, Telegram client, sending replies
    database/  SQL, table definitions, repositories (D1 today)
    models/    Gemini, Groq, the router, model limits
    logging/   the logger and Axiom
    web/       web pages the Worker serves: the /tz page and its routes
  config/      appConfig and Env
```

**Adapter folders are named by their job, not by the product:** `database/`,
not `d1/`. Then only that folder knows which product is used, and a switch
later changes one folder. The one exception is `telegram/`: the bot is a
Telegram bot, so the product is the job.

**Who may import whom:**

| Folder | May import from |
|---|---|
| `domain/` | `domain/` only |
| `output/` | `domain/`, `i18n/` |
| `i18n/` | nothing (only its own data) |
| `app/` | `domain/`, `output/`, `i18n/`, `adapters/`, `config/` |
| `adapters/` | `domain/`, `output/`, `i18n/`, `config/`, other adapters |
| `config/` | nothing |

When a rule in `domain/` needs data from outside (for example the quota needs
the user's usage), it declares an **interface** (a "port"). An adapter
implements it, and `app/` connects the two.

## Coding rules

| Rule | Example |
|---|---|
| Results are a union with an `ok` field | `{ ok: true; … } \| { ok: false; … }` |
| A failure carries its own details | `ProviderFailure` has `ok: false`, `kind`, `detail` |
| Parse once, then use typed values | `checkEvent` turns a `CalendarEventDraft` into a `CalendarEvent` |
| One type per idea | `DateOnly` for every date, not three look-alike types |
| No test-only code in `src/` | helpers only tests use go in `tests/` |
| Comments: MSDN wording, `//` style | `// Represents a date in a message where …` |
| Every name explains itself: types, functions, variables, fields, files | rename instead of explaining with a comment (`statedWeekday`, not `stated` + a comment) |
| No comments on fields | the field's name explains it |
| Variable names follow their type, in camelCase | `checkResult: CheckResult`, not `checked` or `result` |
| Several values of one type: the role comes first | `startDate`, `untilDate` (both `DateOnly`) |
| No generic or one-letter names (a loop index is fine) | not `data`, `answer`, `r` |
| Simple English everywhere | short sentences, common words |
| Mark every example with "e.g." | `// e.g. "tomorrow": not supported yet` |

## What replaces what

Paths are under `src/`. Status: ✅ done, ⏳ to do.

The old tests are the specification. Each area's tests are ported to the new
code, together with that area.

| Old code (`legacy/`) | New code | Status |
|---|---|---|
| `time/dateOnly.ts` | `domain/dates/dateOnly.ts` (types) | ✅ |
| `time/timezone.ts`, `time/canonicalTimezone.ts` | `domain/dates/timeZone.ts` | ⏳ (type ✅) |
| `extractedEvents/toGregorian.ts` | `domain/dates/calendar.ts` | ⏳ (type ✅) |
| `extractedEvents/extractedEvent.ts` | `domain/event/calendarEventDraft.ts` | ⏳ (type ✅) |
| `extractedEvents/eventPlan.ts` | `domain/event/calendarEvent.ts` (type ✅), `domain/event/checkEvent.ts` | ⏳ |
| `extractedEvents/recurrence.ts` (rules) | `domain/event/repeatRule.ts` | ⏳ (type ✅) |
| `extractedEvents/eventUid.ts` | `domain/event/eventUid.ts` | ⏳ |
| `policy/userQuotaPolicy.ts` | `domain/quota/quota.ts` (uses the `UsageStore` port) | ⏳ (types ✅) |
| `policy/userQuotaPolicyLogger.ts` | `adapters/logging/` | ⏳ |
| the user's language and time zone (`repositories/userPreferenceRepository.ts`) | `domain/user/userSettings.ts` (type) | ✅ |
| `extractedEvents/calendarEvent.ts` (`.ics` part) | `output/icsFile.ts` | ⏳ |
| `extractedEvents/calendarEvent.ts` (link part) | `output/googleCalendarLink.ts` | ⏳ |
| `extractedEvents/calendarEvent.ts` (caption texts), the caption in `eventMessageHandler.ts` | `output/caption.ts` | ⏳ |
| `extractedEvents/recurrence.ts` (RRULE, sentence) | `output/icsFile.ts`, `output/caption.ts` | ⏳ |
| date formatting in a language (in `calendarEvent.ts`), `time/formatWait.ts` | `output/localizedDates.ts` | ⏳ |
| `interactiveMessages/messages.ts`, `translation/*` | `i18n/` | ⏳ |
| `telegram/messageHandlers/updateHandler.ts` | `app/handleUpdate.ts` | ⏳ |
| `telegram/messageHandlers/eventMessageHandler.ts` | `app/createEventFromMessage.ts` | ⏳ |
| `telegram/commands/*` | `app/commands/*` | ⏳ |
| `extractedEvents/extractEvent.ts`, `event_schema.ts`, `prompts/event_extract.txt` | `app/extraction/` | ⏳ |
| `telegram/telegramWebhook.ts`, `telegramClient.ts`, `telegramTypes.ts`, `telegramHtml.ts`, `replier.ts` | `adapters/telegram/` | ⏳ |
| `db/schema/*`, `db/sql/*`, `repositories/*`, `time/dateTimeAest.ts` | `adapters/database/` | ⏳ |
| `providers/*`, `router/*`, `quotaLimit/*`, `prompts/diag_ping.txt` | `adapters/models/` | ⏳ |
| `logging/*` | `adapters/logging/` | ⏳ |
| `web/*` | `adapters/web/` | ⏳ |
| `appConfig/appConfig.ts`, `env.ts` | `config/` | ⏳ |
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
| 2 | The domain rules, as pure functions: checking a draft into a calendar event, calendars, the year rule, repeats, the quota | ⏳ |
| 3 | Output: the `.ics` file, the Google Calendar link, the caption | ⏳ |
| 4 | Adapters: Telegram, the database, the models, logging, the web pages | ⏳ |
| 5 | App: one use case per file (create an event, set a language, set a time zone, …) | ⏳ |
| 6 | Point `wrangler.toml` `main` at the new entry point, delete the old code, and update the README | ⏳ |

## How the rules are checked

- **Import rule:** a unit test (`tests/unit/codeStructure.test.ts`) reads every
  source file. It fails if a file in `domain/`, `output/`, `i18n/`, `config/`
  or `adapters/` imports from a folder that the "Who may import whom" table
  does not allow.
- **Types:** `npm run typecheck` in CI.
- **Behaviour:** every step keeps all unit and live tests passing.
- **Review:** the project `CLAUDE.md` tells Claude Code to follow this file for
  every change.
