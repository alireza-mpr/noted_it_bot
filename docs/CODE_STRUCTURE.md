# Code Structure

This file sets the rules for how the code is organised. All new and changed
code must follow it. Where the code does not follow it yet, the table in
[Where each file goes](#where-each-file-goes) says so.

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
6. **Files read top down.** The main exported function comes first. Helpers
   come after it.
7. **Model with types.** Use discriminated unions for "one of several cases".
   Use `null` only when "nothing" is a real, normal value.

## Folders

```
src/
  domain/      pure rules, no input or output
    dates/     dates, times, time zones, other calendars, picking a year
    event/     the model's answer → a checked EventPlan, repeat rules
    quota/     the daily quota rules (user tiers later)
  output/      pure formats made from domain values
               (.ics file, Google Calendar link, caption texts, dates in a language)
  i18n/        the bot's messages and their translations (data and lookup only)
  app/         use cases: one file per thing a user can do; connects domain,
               output and adapters
  adapters/    the edges
    telegram/  webhook, Telegram client, sending replies
    d1/        SQL, table definitions, repositories
    models/    Gemini, Groq, the router, model limits
    logging/   the logger and Axiom
    tzPage/    the /tz web page and its routes
  config/      appConfig and Env
```

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
| Parse once, then use typed values | `planEvent` turns `ExtractedEvent` into `EventPlan` |
| One type per idea | `DateOnly` for every date, not three look-alike types |
| No test-only code in `src/` | helpers only tests use go in `tests/` |
| Comments: MSDN wording, `//` style | `// Represents a date in a message where …` |
| Every name explains itself: types, functions, variables, fields, files | rename instead of explaining with a comment (`statedWeekday`, not `stated` + a comment) |
| No comments on fields | the field's name explains it |
| Simple English everywhere | short sentences, common words |

## Where each file goes

Status: ✅ done, ⏳ planned.

| Now | Target | Status |
|---|---|---|
| `time/dateOnly.ts` | `domain/dates/dateOnly.ts` | ⏳ |
| `time/timezone.ts`, `time/canonicalTimezone.ts` | `domain/dates/timeZones.ts` | ⏳ |
| `extractedEvents/toGregorian.ts` | `domain/dates/calendars.ts` | ⏳ |
| `extractedEvents/extractedEvent.ts` | `domain/event/extractedEvent.ts` | ⏳ |
| `extractedEvents/eventPlan.ts` | `domain/event/eventPlan.ts` | ⏳ |
| `extractedEvents/recurrence.ts` (rules) | `domain/event/repeatRules.ts` | ⏳ |
| `extractedEvents/eventUid.ts` | `domain/event/eventUid.ts` | ⏳ |
| `policy/userQuotaPolicy.ts` | `domain/quota/userQuotaPolicy.ts` (uses a usage port) | ⏳ |
| `policy/userQuotaPolicyLogger.ts` | `adapters/logging/userQuotaPolicyLogger.ts` | ⏳ |
| `extractedEvents/calendarEvent.ts` (`.ics` part) | `output/icsFile.ts` | ⏳ |
| `extractedEvents/calendarEvent.ts` (link part) | `output/googleCalendarLink.ts` | ⏳ |
| `extractedEvents/calendarEvent.ts` (caption texts) + the caption in `eventMessageHandler.ts` | `output/caption.ts` | ⏳ |
| `extractedEvents/recurrence.ts` (RRULE, sentence) | `output/icsFile.ts`, `output/caption.ts` | ⏳ |
| date formatting in a language (now in `calendarEvent.ts`), `time/formatWait.ts` | `output/localizedDates.ts` | ⏳ |
| `interactiveMessages/messages.ts`, `translation/*` | `i18n/` | ⏳ |
| `telegram/messageHandlers/updateHandler.ts` | `app/handleUpdate.ts` | ⏳ |
| `telegram/messageHandlers/eventMessageHandler.ts` | `app/createEventFromMessage.ts` | ⏳ |
| `telegram/commands/*` | `app/commands/*` | ⏳ |
| `extractedEvents/extractEvent.ts`, `event_schema.ts`, `prompts/event_extract.txt` | `app/extraction/` | ⏳ |
| `telegram/telegramWebhook.ts`, `telegramClient.ts`, `telegramTypes.ts`, `telegramHtml.ts`, `replier.ts` | `adapters/telegram/` | ⏳ |
| `db/schema/*`, `db/sql/*`, `repositories/*`, `time/dateTimeAest.ts` | `adapters/d1/` | ⏳ |
| `providers/*`, `router/*`, `quotaLimit/*`, `prompts/diag_ping.txt` | `adapters/models/` | ⏳ |
| `logging/*` | `adapters/logging/` | ⏳ |
| `web/*` | `adapters/tzPage/` | ⏳ |
| `appConfig/appConfig.ts`, `env.ts` | `config/` | ⏳ |
| `buildCalendarEvent` (used only by tests) | a helper in `tests/` | ⏳ |
| `text-modules.d.ts`, `node-modules.d.ts` | stay in `src/` | ✅ |

## Order of the work

Each step is its own commit. All tests pass after each step. **Moving files
and changing logic are never in the same commit**, so every diff stays easy to
read.

1. Write this plan and the project `CLAUDE.md`. ✅
2. Split `calendarEvent.ts` into `output/icsFile.ts`,
   `output/googleCalendarLink.ts`, `output/caption.ts` and
   `output/localizedDates.ts`. Remove `BuiltCalendarEvent`: the caption reads
   the `EventPlan` directly. Move `buildCalendarEvent` into `tests/`. (logic)
3. Move the pure date and event code into `domain/`. (moves only)
4. Add the import-rule test (see below). From here on, CI checks the rule.
5. Quota: `UserQuotaPolicy` gets a usage port and moves to `domain/quota/`.
   (logic, then a move)
6. Move the edges into `adapters/`, and point `wrangler.toml` `main` at the new
   webhook path. (moves only)
7. Move the use cases into `app/`: split `updateHandler.ts` into routing and one
   file per use case. (logic, then moves)
8. Move `translation/` and `messages.ts` into `i18n/`, and config into
   `config/`. (moves only)
9. Update the README "How it works" section to the new layout.

## How the rules are checked

- **Import rule:** a unit test (`tests/unit/codeStructure.test.ts`, added in
  step 4) reads every file in `domain/` and `output/`. It fails if one of them
  imports from `app/` or `adapters/`.
- **Types:** `npm run typecheck` in CI.
- **Behaviour:** every step keeps all unit and live tests passing.
- **Review:** the project `CLAUDE.md` tells Claude Code to follow this file for
  every change.
