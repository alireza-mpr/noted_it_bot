# Changelog

What changed in Noted, newest first. Each section is one prod release.

Every deploy is a **build**, e.g. `v1.0.135-6fb8240`: `/ver` shows it, and
git has a tag with the same name. A prod release lists its prod builds; the
builds in between ran only on the dev bots.

## Unreleased (on the dev bots only)

- **A second opinion for unsure answers.** When a light model is unsure about
  a message (confidence below 0.7), a stronger model reads it again, and its
  answer is used. See [ORCHESTRATION.md](docs/ORCHESTRATION.md).

## 1.0.135 (3 Oct 2026)

Prod builds: `v1.0.134`, `v1.0.135`.

- **A time with no date** (e.g. "lunch with friends at 1, Sadaf restaurant")
  is now an event: today, or tomorrow if the time has passed. Like relative
  dates, it needs a time zone.
- **Places without a city name.** A street, venue or area in only one city now
  sets the event's time zone (e.g. a talk on "Karimkhan Street" is in
  Tehran). A place in several cities, like "Notting Hill", still gets none.
- A blank line after the `/start` greeting, and new Persian wording.
- Logs: the trace id is now `trace_id`, and a request that gives no event logs
  why (`user_activity.problem`, e.g. "no date").

## 1.0 — the rewrite (28–29 Sep 2026)

Version 1 is a rewrite of the whole bot. For users, it keeps everything from
the beta, and adds the features below. The biggest change is inside: the code
was redesigned from scratch.

Prod builds: `v1.0.107` (1.0.0), `v1.0.108`, `v1.0.110`, `v1.0.111`,
`v1.0.115`, `v1.0.120`, `v1.0.121`, `v1.0.128`.

### New for users

- **Two editions, two bots** (`v1.0.120`):
  - English: @noted_it_bot. It replies in the user's Telegram language, or the
    one chosen with `/lang`.
  - Persian: @noted_it_fa_bot. It replies in Persian, and its `/` menu
    describes the commands in Persian.
  - Why: falling back to English was demoralising for Persian speakers, and
    English command names didn't appeal to them.
  - Each bot has its own name and descriptions. The dev bots end in " - Dev".
- **Relative dates** (`v1.0.128`): "today", "tonight", "tomorrow", "the day
  after tomorrow", "Friday", "this Friday" and "next Friday".
  - They are counted from now, in the event's time zone.
  - The model only says which kind of relative date the message has. Our code
    works out the date.
  - Weeks start on Monday. "Friday" is the coming Friday; "next Friday" is
    Friday of next week.
  - They need a time zone. Without one (from the message or `/tz`), the bot
    asks the user to set `/tz` first. UTC would give a wrong date for some
    hours of every day.
  - Other relative dates (e.g. "in two weeks") still give no event.
- **`/help`** (1.0.0): how the bot works, what users can set, and the daily
  quota. `/start` became short and friendly, and points to `/help`.
- **"Event"** in the reply language when the message gives no title (1.0.0).
- **Titles and locations stay in the message's language** (1.0.0): an English
  place name in a Persian message stays in English.
- **More calendars** (1.0.0): Solar Hijri (Persian), Hebrew, Buddhist and
  Indian national dates are converted to Gregorian. A plain "Hijri" is refused,
  because it means a different calendar in different countries.
- **A daily quota of 10** messages that go to a model (1.0.0). The replies
  don't show it for now, so new users don't feel limited.
- Friendlier, more casual texts in all languages.

### The redesign (1.0.0)

The beta grew fast, and its code mixed rules with input and output. For
example, one file held the `.ics` rules, the Google link and the caption
texts. The rules were hard to find and hard to test. Version 1 was rebuilt in
steps, next to the old code, and then replaced it.

- **Pure rules in the middle, input and output at the edges** ("functional
  core, imperative shell", with light "ports and adapters"). See ADR-7.

  | Layer | What it holds |
  |---|---|
  | `generic/` | Helpers any app could use: date math, time zones, calendar conversion, JSON, `.ics` text |
  | `domain/` | Pure product rules: the calendar event, the year rule, repeats, relative dates, the quota, the user |
  | `output/` | Pure formats: the `.ics` file, the Google Calendar link, the caption, dates in a language |
  | `i18n/` | The bot's messages and their translations |
  | `app/` | One file per thing a user can do (e.g. create an event, set a time zone) |
  | `adapters/` | The edges: Telegram, the database, the models, logging, the web page |

- **Dependencies point inward.** The rules never import the edges. A unit
  test checks this, so the structure can't drift.
- **One idea per file.** A data file is named after a word in the glossary
  (e.g. `repeat.ts`). A rule file (`*-rule.ts`) holds one product rule from
  `EDGE_CASES.md`.
- **Shared words** in code and docs, from `UBIQUITOUS_LANGUAGE.md` (a
  Domain-Driven Design idea).
- **Raw data is checked once, at the edge** (a Telegram update, a model
  answer, a database row). After that, the code uses typed values.
- **Results are unions with an `ok` field**, and modes are named with `kind`
  (e.g. a floating time zone is `{ kind: "floating" }`, not `null`).
- **One user record.** One `users` table holds the profile, the settings and
  the quota usage. A `version` column stops two requests from overwriting each
  other. It replaced the beta's separate tables for preferences, usage and the
  whitelist.
- **Models behind a port.** Only `adapters/models/providers/` knows Gemini
  and Groq. A new provider is a new adapter.
- **Logs with OpenTelemetry names**, e.g. `user.id`, `eventName`,
  `severityText`, and one trace id per request. See ADR-9.
- **Tests:** about 440 offline tests, plus live tests that call the real
  models.
- **Docs in simple English:** the architecture decision registry (ADR-1 to
  ADR-10), the code structure rules, the edge cases, and the glossary.

### Delivery

- **One code base, one Worker per edition** (ADR-10): `dev`, `dev-fa`,
  `prod` and `prod-fa`. Each edition has its own GitHub Environment and
  secrets. The editions share one database per stage.
- Each deploy sets the bot's `/` menu, name and descriptions. The name and
  descriptions are only sent when they changed, because Telegram rate-limits
  those calls.
- A wrong secret fails its edition's deploy, with the real error in the log.
  The other edition still deploys.
- A manual CI run can skip the integration tests, e.g. when the dev Gemini
  quota is used up. The offline tests still run and must pass.
- Every log event carries `bot.edition`.

## 0.2 beta (26–27 Sep 2026)

Prod builds: `v0.2.85` to `v0.2.102`.

- **Open to everyone**, with a daily quota per user. Only messages that a
  model answers use the quota. If no model answers, the unit is given back.
- **Groq** as a second provider, after Gemini.
- **`/tz`** sets the user's time zone on a signed web page. The page detects
  the device's zone and asks the user to confirm. Users can also search by
  city or by zone name. The link works for one minute.
- **The time zone order:** the zone in the message; otherwise the user's
  `/tz` zone; otherwise "floating" time, shown as written in every calendar.
  The caption says which one was used.
- **Dates in other calendars** (e.g. Solar Hijri, Hebrew) are converted to
  Gregorian, in one step, with calendars as data.
- **A missing year** is picked from the stated weekday. The caption flags a
  date in the past (💡) and a weekday that doesn't match the date (🤔).
- **16 languages**, translated ahead of time and shipped with the bot. So
  choosing a language never calls a model.
- The repeat sentence in the reply language.
- "Extracting the event…" is shown once a model is about to be tried.
- **Logs in Axiom**, with a trace id per request and user activity events. The
  old message log in KV was removed.
- Prod moved to its own Cloudflare account.
- CI gates the dev deploy. Unit tests and live tests are split.
- The first architecture decision registry, and the docs rewritten in simple
  English.

## 0.1 beta (25 Sep 2026)

- **A model router:** it tries free Gemini models one after another, and
  tracks each model's usage in D1.
- A stalled call times out after 12 seconds, and the router moves to the next
  model. A failed model is skipped, not the whole provider.
- Gemini 3.1 Flash Lite as the first model. The retired Gemini 2.5 models were
  removed.
- The code was restructured into Telegram, router and provider modules.

## 0.0 beta (11–25 Sep 2026)

The first version, built in a few days. Prod builds: `v0.0.37`, then deploys
from `main` on 21, 24 and 25 Sep.

- **The core:** forward a message, get a calendar event. Gemini reads the
  event with structured output.
- **An `.ics` file** for any calendar app, and a **one-tap Google Calendar
  link**, with a short summary above it. Long `.ics` lines are folded, so
  non-Latin titles don't break strict calendar apps.
- **Photos and files with a caption** work: the bot reads the caption.
- **A date with no time** becomes an all-day event, with a note. The bot never
  guesses a time.
- **Repeating events** (21 Sep): "every Thursday", "every 2 weeks", "first
  Friday of the month", with an end date or a number of times. On phones, the
  Google link adds only one event, so the caption points to the file or a
  computer.
- **Replies in the user's Telegram language**, and `/lang` to choose another.
- **Commands:** `/start`, `/lang`, `/ver`, and a hidden `/diag`. The `/`
  menu is set on every deploy.
- **Access by a whitelist** of usernames or user ids.
- **Delivery:** Cloudflare Workers, a webhook, separate dev and prod bots.
  Dev deploys on every push; prod deploys only by hand, from a tag. Every dev
  deploy is tagged with its exact version.
- The bot always answers Telegram's request, even when something fails, so one
  error can't block the message queue.
