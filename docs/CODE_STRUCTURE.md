# Code Structure

This file sets the rules for how the code is organised. All code must follow
it.

The decision and the other options are in ADR-7 of
[ARCHITECTURE_DECISIONS_REGISTRY.md](ARCHITECTURE_DECISIONS_REGISTRY.md).

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
   | **O**pen/closed | Add new behaviour by adding code, not by changing working code (e.g. a new provider is a new adapter behind the same port; a new command is a new file in `app/commands/`). |
   | **L**iskov substitution | Every implementation of a port keeps the port's promises (e.g. `InMemoryUserRepository` in the tests refuses a stale save, like the D1 one). |
   | **I**nterface segregation | Ports are small: only what the caller needs (e.g. `UserRepository` has two methods). |
   | **D**ependency inversion | The inside declares ports, adapters implement them, and `app/` connects them (principle 3). |

## Folders

```
src/
  generic/     generic helpers any app could use, not our business (DDD: a
               "generic subdomain"): e.g. do date math, convert data,
               format text
    date-time/        dates, times of day, time zones, calendar conversion
    encoding/         base64url text
    hash/             hashing a text
    html/             escaping text for HTML
    icalendar/        RFC 5545 text and date formats
    intl/             numbers and spans of time in a language (Intl)
    json/             turning a value into JSON text, without throwing;
                      reading typed fields from JSON
    text/             filling {0}, {1}, … in a text; cutting a long text
  domain/      pure rules, no input or output
    bot-edition/      the bot editions (english, persian) and their default
                      languages
    calendar-event/   CalendarEventDraft → a CalendarEvent, the calendars we
                      accept, the year rule, repeats
    quota/            the quota usage and the daily quota rule (user tiers later)
    user/             the user aggregate (profile, settings, quota usage) and its
                      repository port; the languages the bot replies in
  output/      pure formats made from domain values
               (.ics file, Google Calendar link, caption texts, dates in a language)
  i18n/        the bot's messages and their translations (data and lookup only)
  app/         use cases: one file per thing a user can do; connects domain,
               output and adapters
  adapters/    the edges
    telegram/  reading updates, the webhook secret check, the Telegram
               client, replies
    database/  SQL, table definitions, repositories (D1 today)
    models/    the model types, the router, extraction; no product names
      providers/  the only place that knows Gemini and Groq: their clients,
                  answer parsers and model lists
    logging/   the logger and Axiom
    web/       web pages the Worker serves: the /tz page and its routes
  config/      APP_CONFIG and Env
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
| `i18n/` | `domain/` (e.g. `SupportedLanguage`) |
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
| A failure carries its own details | `ModelFailure` has `ok: false`, `kind`, `detail` |
| Parse once, then use typed values | `createCalendarEvent` turns a `CalendarEventDraft` into a `CalendarEvent` |
| One type per idea | `DateOnly` for every date, not three look-alike types |
| No test-only code in `src/` | helpers only tests use go in `tests/` |
| Comments: MSDN wording, `//` style | `// Represents a date in a message where …` |
| Every name explains itself: types, functions, variables, fields, files | rename instead of explaining with a comment (`writtenWeekday`, not `weekday` + a comment) |
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
| Types, interfaces, classes | PascalCase | `CalendarEvent`, `UserRepository` |
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
[ARCHITECTURE_DECISIONS_REGISTRY.md](ARCHITECTURE_DECISIONS_REGISTRY.md).

| Part | Rule | Example |
|---|---|---|
| The event's own fields | The field names of an OTel log record; the trace id is `trace_id`, OTel's name for it outside OTLP | `severityText`, `eventName`, `trace_id`, `scope.name` |
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
| The user | `user.id`, `user.name` (the Telegram username), `user.full_name` (the first name and the last name), all set by `setUserLogAttributes` |
| The chat | `telegram.chat.id` |
| An error | `exception.type`, `exception.message`, `exception.stacktrace` |
| An HTTP status | `http.response.status_code` |
| The model | `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` |
| The reply language, and how it was chosen | `telegram.reply_language`, `telegram.reply_language_source`, `telegram.user_language_code` |
| The message text and the model answer | `extraction.message_text`, `extraction.model_answer` |

## How the rules are checked

- **Imports and casing:** `tests/unit/code-structure.test.ts` reads every
  source file. It fails when a file imports from a folder that "Who may import
  whom" doesn't allow, or when a file or folder name is not kebab-case.
- **Types:** `npm run typecheck`, in CI too.
- **Behaviour:** every commit keeps the offline tests passing. Run the live
  tests when a change affects what the model reads (the prompt, the schema,
  the parser).
- **Review:** the project `CLAUDE.md` tells Claude Code to follow this file for
  every change.
