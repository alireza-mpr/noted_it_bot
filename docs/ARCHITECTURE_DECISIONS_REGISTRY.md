# Architecture Decision Registry

The main design decisions of Noted, and why we made them. After the
decisions, [The daily quota in detail](#the-daily-quota-in-detail) gives the
quota's rules and what each message costs in D1.

## Requirements

### Functional

- **FR1 — Message to calendar event.** The user forwards a message (text, or a
  caption). The bot replies with a Google Calendar link and an `.ics` file.
- **FR2 — Messages in any language** the models understand, not only the 16
  the bot replies in.
- **FR3 — Repeats.** Clear repeats ("every Thursday", "first Friday of the
  month") become a real repeat rule.
- **FR4 — Replies in the user's language,** in 16 languages: the user's
  choice (`/lang`), else the edition's choice.
- **FR5 — A time zone per user,** set with `/tz`.
- **FR6 — A fair daily quota** of messages per user. A user who used it up is
  always told why, and when to try again.

### Non-functional

- **NFR1 — Zero cost.** Everything runs on free plans: Cloudflare Workers, D1
  and free LLM models.
- **NFR2 — Resistant to abuse.** No user or group of users can use up the
  shared capacity: Cloudflare's free requests, D1 reads and writes, and the
  free model quotas.
- **NFR3 — Strong consistency.** The user quota and the model usage are
  updated atomically. Parallel requests can't pass a limit.
- **NFR4 — Availability.** When a model or provider fails, the bot tries the
  next one. When none answers, the user gets a clear message. The bot is never
  silent.

## Decisions

| ADR | Decision | Serves |
|---|---|---|
| 1 | Daily quota per user, stored in D1 | NFR1, NFR2 |
| 2 | Check the quota before using it | NFR1, NFR2 |
| 3 | Reserve quota, give it back if no model answers | FR6, NFR3 |
| 4 | Try free models one after another | NFR1, NFR4 |
| 5 | Get the user's time zone from a signed web page | FR5 |
| 6 | Translate the bot's messages once, ahead of time | FR4, NFR1, NFR2 |
| 7 | Pure rules in the middle, input and output at the edges | all |
| 8 | Always answer Telegram with 200 after the auth check | NFR2, NFR4 |
| 9 | Logging and monitoring: OpenTelemetry names, sent to Axiom | NFR1, NFR2, NFR4 |
| 10 | One code base, one Worker per bot edition | FR4, NFR1 |

---

### ADR-1 — Daily quota per user, stored in D1

**Problem.** The bot is open to everyone. A large group of users could use up
the free capacity all users share: Worker requests, D1 reads and writes, and
model calls.

| Option | Good | Bad |
|---|---|---|
| Counters in memory | Free | Workers don't keep memory between requests |
| Cloudflare's Rate Limiting binding | Free, no storage | Only 10- or 60-second windows: no daily quota |
| A "blocked until" marker in the Cache API | Free | Doesn't work on `workers.dev` (needs a paid domain), and can lose entries |
| **One D1 row per user** | Reliable; a daily quota is possible | Costs D1 reads and writes |

**Decision.** One D1 row per user. The quota is full again 24 hours after the
last use.

**Trade-offs.**
- Every Telegram message is still one Worker request (100k a day on the free
  plan). Only a paid plan removes that limit.
- Every new Telegram account gets a full quota.

### ADR-2 — Check the quota before using it

**Problem.** An abuser keeps sending messages after the quota runs out, so a
refused message must be as cheap as possible. "Use first, then read the
result" costs 2 reads, and `RETURNING` doesn't help: D1 counts it as a read.

**Decision.** Check the quota on the user row, which is read once per update
anyway (for the reply language). If nothing is left, stop with no write. A
quota in its own table would cost a second read on every message.

**Trade-offs.** A refused message costs 1 read and no write. An allowed one
costs 2 reads and 1 write for the user row (an `UPDATE` reads the row it
changes).

### ADR-3 — Reserve quota, give it back if no model answers

**Problem.** A message no model answered shouldn't use quota. But Telegram
sends up to 40 messages at once, so if we charge only after an answer, a burst
can pass before the first charge.

| Option | Good | Bad |
|---|---|---|
| Charge after a model answers | Simple | A burst gets around the quota |
| **Reserve first, give back if no answer** | Safe with parallel messages | One extra write when no model answers |

And to keep parallel messages apart:

| Option | Good | Bad |
|---|---|---|
| A conditional upsert, with the rule in SQL (`WHERE remaining > 0`) | One statement, no retries | The quota rule is split between SQL and code |
| **Optimistic concurrency on one user row** | The whole quota rule is pure, in the domain | A save that loses a race is tried again |

**Decision.**
- The user is one aggregate in one D1 row: profile, settings and quota usage,
  with a `version`.
- The domain decides (`domain/quota/daily-quota-rule.ts`): reset, consume,
  refund. The repository saves only if the `version` is still the loaded one.
  A save that loses a race loads the user again and applies the change again
  (`app/update-user.ts`, up to 10 times).
- A unit given back also puts `lastUsedAt` back, so the reset time doesn't
  move.
- Only messages that go to a model reserve quota. Commands, empty messages and
  unknown commands never do, so they can't cause endless
  reserve-and-give-back writes.

**Trade-offs.**
- A test sends 10 messages at once with 5 units left: exactly 5 get through.
- Races happen only while units are left, so at most once per user per day. A
  burst of 10 with 5 units left costs 85 rows read and 5 written; every later
  burst that day costs 10 reads and no write.
- While all models are down, every unit is given back, so the quota stops no
  one.

### ADR-4 — Try free models one after another

**Problem.** Free model plans have small limits per model: requests per
minute, requests per day, tokens per minute. They count per project, so more
keys don't help. One model runs out quickly, and any model can be overloaded
or removed.

| Option | Bad |
|---|---|
| Use one model | Runs out within hours |
| Retry the same model later | Slow, and it still runs out |
| Pay for a model | Breaks NFR1 |
| **Try many free models, and count each one's usage** | (chosen) |

**Decision.** A router tries Gemini's free models in a fixed order, then
Groq's. It counts each model's usage in D1, in the provider's own time windows
(e.g. Gemini's day ends at midnight Pacific time), and skips a model that is
already at its limit without calling it. How it reacts to each error is in the
[DEVELOPMENT.md](DEVELOPMENT.md#models-and-routing).

**Trade-offs.**
- Nothing is reserved before a call, so parallel requests can go slightly over
  a limit until the model's 429 corrects the count.
- Answer quality differs between models.
- Each model tried costs D1 reads and writes (see
  [D1 cost per message](#d1-cost-per-message)).

### ADR-5 — Get the user's time zone from a signed web page

**Problem.** Telegram never tells a bot the user's time zone or location.

| Option | Bad |
|---|---|
| Ask for a place and guess the zone | Not reliable: one country can have many zones |
| Ask the user to share their location | Only on phones, too much to ask, and needs a location-to-zone lookup |
| Guess from the language | Wrong for most people |
| **Let the user's device report its zone** | (chosen) |

**Decision.** `/tz` replies with a button to a small page on the Worker. The
page reads the device's time zone and asks the user to confirm it with one
tap, or to search all zones. It knows the user only from a signed token (HMAC)
and never trusts anything the browser sends. `/tz Australia/Melbourne` skips
the page. How it works is in [DEVELOPMENT.md](DEVELOPMENT.md#the-tz-page).

**Trade-offs.**
- The user needs one tap and one page load.
- The device's zone can be wrong while travelling; the search covers that.
- The user's zone is only the second choice. The event's time zone comes from
  the message first, and is floating when neither exists. See "Time zones" in
  [EDGE_CASES.md](EDGE_CASES.md#time-zones).

### ADR-6 — Translate the bot's messages once, ahead of time

**Problem.** The bot replies in 16 languages, so its messages must be
translated somehow.

| Option | Good | Bad |
|---|---|---|
| Translate each reply with a model | Any language | Uses model quota on every reply, and a user can switch languages to spend it |
| **Translate once, ship the translations with the bot** | No model cost, fast, the same text every time | A fixed list of languages; every new message needs 15 translations |

**Decision.** Every message is translated ahead of time
(`src/i18n/translations/*.json`), so choosing a language never calls a model.
A language the bot doesn't have falls back to the edition's default. A unit
test checks that every translation keeps the English text's placeholders,
HTML tags, emoji and commands.

**Trade-offs.** Only 16 languages, translated by an AI assistant.

### ADR-7 — Pure rules in the middle, input and output at the edges

**Problem.** The hard parts of this bot are rules: dates, calendars, repeats,
time zones, the quota. The beta grouped folders partly by layer and partly by
feature, and one file could mix several jobs (e.g. the `.ics` rules, the
Google link and the caption texts). Rules were hard to find and to test.

| Option | Good | Bad |
|---|---|---|
| OOP as the main style | Familiar | Not the usual style in TypeScript; adds classes where functions are enough |
| Full DDD (aggregates, bounded contexts, domain events) | Strong for large systems | Far too heavy for about 5,000 lines |
| Group by feature only | Easy to find a feature | Rules and input/output mix again inside each feature |
| **Functional core, imperative shell, with light "ports and adapters"** | Fits the problem: the hard parts are pure rules, easy to test; the usual style in TypeScript | More, smaller files |

**Decision.** Pure rules in `domain/` and `output/`, input and output only in
`adapters/`, and `app/` connects them. `domain/` and `output/` never import
from `app/` or `adapters/`. From DDD we take only shared words across code and
docs, and a domain model made of types. The rules are in
[CODE_STRUCTURE.md](CODE_STRUCTURE.md).

**Trade-offs.** A small feature can touch several folders, e.g. a new command
needs a message text, a use case and a line in `handle-update.ts`. A unit test
checks the import rule, so the structure can't drift.

### ADR-8 — Always answer Telegram with 200 after the auth check

**Problem.** Telegram delivers updates in order. If the bot answers with an
error or times out, Telegram sends the same update again and again, and every
update behind it waits. This happened once: a failure returned a 500, and the
queue stayed stuck until it was cleared by hand.

**Decision.** Once the webhook secret is correct, the bot always answers 200,
even when something fails inside. The failure is logged and the user gets a
general error. A wrong secret still gets a real 401.

**Trade-offs.** A failed message is not retried; the user has to send it
again.

### ADR-9 — Logging and monitoring

**Problem.** The bot runs on free plans with hard daily limits, so we must see
a limit coming before users do. And free-text log names, with mixed casing and
several names for one idea, break queries silently when a message is
reworded.

| Option | Bad |
|---|---|
| Our own free-text names | Queries break silently; no standard for new names |
| Our own naming convention | Nobody else knows it; other tools don't understand it |
| **OpenTelemetry (OTel) names, sent by our code to Axiom** | (chosen) |
| Cloudflare's own OTel export to Axiom | Needs the Workers Paid plan, and is still in beta |

**Decision.**
- Every event uses the OTel log record's field names (`severityText`,
  `eventName`, `scope.name`) and OTel attribute names (e.g. `user.id`). The
  trace id is `trace_id`, OTel's name for it outside OTLP ("Trace Context in
  non-OTLP Log Formats"). The rules are in
  [CODE_STRUCTURE.md](CODE_STRUCTURE.md#logging).
- Our own names start with our area (e.g. `telegram.chat.id`), never with an
  OTel namespace. No app prefix: only this bot writes to the dataset, and
  `service.name` names it.
- One request is one log session with one `trace_id`, sent to Axiom in one
  batch after the response, and printed to the console for Workers Logs.
- With OTel names, a later switch to Cloudflare's export changes only the
  sender.

**Trade-offs.**
- The names are long, and APL needs quotes around names with dots:
  `['user.id']`.
- Some OTel names (`user.*`, `gen_ai.*`) are still in development, so they may
  change.
- The logs hold message texts and user names.

**What to monitor (draft).** The alert levels are first guesses; set them after
a few weeks of normal traffic. The events are listed in the
[DEVELOPMENT.md](DEVELOPMENT.md#logs).

| Risk | What to watch | Where | Alert when |
|---|---|---|---|
| **A swarm of abusers** (NFR2) | New users per hour (`user_activity.bot_started`); quotas used up (`user_activity.quota_used_up`); messages per user per hour | Axiom | New users per hour far above normal (e.g. 10×); many new users use up their quota within minutes |
| **Cloudflare capacity** (NFR1) | Worker requests per day (free: 100k); D1 rows read (5M) and written (100k) per day; Workers Logs lines per day (200k) | The Cloudflare dashboard; for early warning, log D1's `meta.rows_read` and `meta.rows_written` | A daily count passes 70% of its limit |
| **Model usage** (NFR1, NFR4) | Calls per model against its limits; models used up for the day; messages no model answered; tokens per day (`gen_ai.usage.*`) | Axiom; the `gemini_usage` and `groq_usage` tables | The first message of the day that no model answered; all Gemini models used up early in their day |
| **Errors** (NFR4) | Every `ERROR` (a developer must act); a jump in `WARN`; a provider's 401 or 403 (a bad key); webhook 401s (a wrong or cleared secret); failed sends to Axiom | Axiom; Workers Logs for failed sends to Axiom | Any `ERROR`; any 401 or 403 at once |

**Open questions.** How many Axiom monitors does our plan allow, and where
should alerts go (e.g. email, or a Telegram message to the owner)? Should the
bot stop taking new users when a daily limit gets close?

### ADR-10 — One code base, one Worker per bot edition

**Problem.** Persian speakers were put off by English: many got English
replies (their Telegram app is in English), and the `/` menu described the
commands in English. One bot has one menu, in one language, for everyone. We
may also want each language to scale on its own later: its own free limits,
model keys and database.

| Option | Good | Bad |
|---|---|---|
| One bot for everyone | Nothing to set up | One menu language; the reply language guessed from the Telegram app |
| One Worker for several bots (told apart by the webhook secret) | One deploy | Splitting later needs code changes; one bad deploy breaks every bot |
| **One Worker per bot, from the same code** | Each bot is set up on its own; splitting later is configuration only | Two deploys per release (one workflow runs both) |

**Decision.**
- One Worker per **bot edition**: `english` (@noted_it_bot) and `persian`
  (@noted_it_fa_bot). `BOT_EDITION` in `wrangler.toml` tells a Worker which
  one it runs. Each has its own bot token, webhook secret and `/` menu.
- **Everything an edition uses comes from its configuration, never from
  code:** its Worker (`wrangler.toml`), and its D1 database, model keys and
  Cloudflare account (its GitHub Environment). Code never names an edition to
  pick a resource.
- For now, the editions of a stage share one Cloudflare account, one D1
  database and the same model keys.
- **One `gemini_usage` table per Google project.** Gemini counts usage per
  project, so editions with the same key must share the table, and an edition
  with its own key needs its own D1 database.
- Every log event has `bot.edition`, so each edition's users and usage can be
  told apart from the first day.
- `BOT_EDITION` must be set. A Worker with an unknown one answers every
  request with 500 and logs an `ERROR`, before the auth check, so Telegram
  keeps the updates until it is fixed.

**Trade-offs.**
- The editions share their stage's free limits: Worker requests, D1 reads and
  writes, and the model quotas.
- The `users` table is shared, so a user of both bots has one quota and one
  `/tz` setting.
- To separate an edition later: give it a new D1 database in `wrangler.toml`,
  and new keys (maybe a new Cloudflare account) in its GitHub Environment. No
  code changes. Its users start with fresh settings unless their rows are
  copied.

---

## The daily quota in detail

Each user can send `APP_CONFIG.dailyQuota` (now 10) messages a day to a
model. `APP_CONFIG.showDailyQuota` decides whether the replies mention it;
it is off for now, so new users don't feel limited. The decisions behind the
quota are ADR-1 to ADR-3.

### Rules

- **Only messages that go to a model use quota.** Commands (unknown ones too)
  and messages with no text never do.
- **No answer, no quota.** When no model answers, or the answer is not usable
  at all (e.g. not JSON), the unit is given back.
- **An answer that gives no event still uses the unit,** e.g. an unclear
  repeat or a message with no date.
- **The quota is full again 24 hours after the last use**
  (`QUOTA_RESET_AFTER_MS`). A unit given back restores the usage exactly,
  `lastUsedAt` too, if no other unit was used since. So an unanswered message
  doesn't move the reset time.
- **A user with no quota left gets a reply every time** ("try again in …"),
  with no D1 write. Telegram limits how fast one chat can send.
- If the bot crashes after taking a unit, the unit is not given back.

### Flow of one message

In `src/app/handle-update.ts` and `src/app/create-event-from-message.ts`:

1. Load the user (`loadUserOfUpdate`). A new user or a changed Telegram name is
   saved.
2. Commands and messages with no text are answered. No quota is used.
3. Take a unit (`consumeUnit`, saved with `updateUser`). If none is left,
   refuse with no write. If another message of the same user saved first, load
   the user again and retry.
4. Ask the router: Gemini's models in order, then Groq's.
5. If no model gave a usable answer, give the unit back (`refundUnit`),
   starting from the user saved in step 3, so no load is needed.

### D1 cost per message

Rows read and written for one event message. The model tables have one row
per model: 7 for Gemini, 2 for Groq.

| Path | Rows read | Rows written |
|---|---|---|
| A command, or a message with no text | 1 | 0 |
| **A user with no quota left** | **1** | **0** |
| **Success: the first model answers** | **10** | **2** |
| **Success after other models** (worst case: all 7 Gemini models and the first Groq model are rate-limited, the second Groq model answers) | **28** | **18** |
| No model: none available (all marked as used up, so none is called) | 12 | 2 |
| No model: every model is called and rate-limited (worst case) | 30 | 20 |

On top of these:
- a new user, or a changed Telegram name: 1 read and 1 write, once;
- `/lang`, and `/tz` with a zone: 1 read and 1 write;
- a save that loses a race: 2 reads (the refused save, and the load again).

**Where the rows go:**

| Step | Read | Written |
|---|---|---|
| Load the user | 1 | 0 |
| Save the user (create, take a unit, give it back, change a setting) | 1 | 1 |
| A save that loses a race | 1 | 0 |
| List the available Gemini models (the whole table) | 7 | 0 |
| List the available Groq models (the whole table) | 2 | 0 |
| A model answers (record the usage) | 1 | 1 |
| A model is rate-limited (mark it as used up, record the error) | 2 | 2 |
| A model fails in another way (record the error) | 1 | 1 |

More models mean more reads to list them, and more writes in the worst case.

### Capacity

- **D1 Free:** 5M rows read and 100k rows written per day.
- **Workers Paid ($5/month):** includes 25B rows read and 50M rows written per
  month, about 1.6M writes a day.
- On both plans, writes run out long before reads.

| Path | Messages per day, free D1 | Messages per day, paid D1 |
|---|---|---|
| Success, first model (2 writes) | ~50,000 | ~820,000 |
| Success, worst case (18 writes) | ~5,500 | ~91,000 |
| No model, worst case (20 writes) | ~5,000 | ~82,000 |
| A user with no quota left (reads only) | ~5M | no real limit |

e.g. in the worst case, the free plan supports about 550 users a day who each
use all 10 requests.

**Worker requests usually run out first.** Workers Free allows 100k requests a
day, and every Telegram update is one request: answered, refused or ignored.
Workers Paid includes 10M requests a month with no daily limit, then charges
per million.

### Known risks

- **Giving units back makes the no-model path unlimited.** While all models are
  down, the quota stops no one. Each such message costs 12 reads and 2 writes
  (20 writes if every model is called and fails), so about 50k of them use up
  the free D1 writes.
- **Every new account gets a full quota.** Many new Telegram accounts cost 1
  write each to create, then model calls and 2 to 18 writes per message, until
  each runs out.
- **Every message costs 1 read** (the user load), even a refused one.

### How we measured

We ran each step of the D1 adapters on the local D1 of the Workers test
runtime (the same SQLite engine as production), with one row per model, and
added up `meta.rows_read` and `meta.rows_written`. To check in production,
use the D1 analytics in the Cloudflare dashboard, or log those two values for
a day.
