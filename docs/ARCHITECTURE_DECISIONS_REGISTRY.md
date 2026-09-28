# Architecture Decision Registry

This file lists the main design decisions of Noted, and why we made them.
The daily quota's rules and what each message costs in D1 are in
[The daily quota in detail](#the-daily-quota-in-detail), after the decisions.

## Requirements

### Functional

- **FR1 — Message to calendar event.** The user forwards a message (text, or
  a caption on a photo). The bot replies with a Google Calendar link and an
  `.ics` file.
- **FR2 — Messages in any language.** The bot reads events in any language
  the models understand, not only in the 16 languages it replies in.
- **FR3 — Recurring events.** Clear repeats ("every Thursday", "first Friday
  of the month") become a real repeat rule.
- **FR4 — Replies in the user's language.** 16 languages. The bot uses the
  Telegram language. The user can change it with the `/lang` command.
- **FR5 — Time zone per user.** The user sets it with the `/tz` command.
- **FR6 — A fair daily quota.** Each user can send a fixed number of messages
  per day to a model. The replies can show the quota and the requests left
  (`APP_CONFIG.showDailyQuota`). A user who used the quota up is always told
  why, and when to try again.

### Non-functional

- **NFR1 — Zero cost.** Everything runs on free plans: Cloudflare Workers, D1,
  and free LLM models.
- **NFR2 — Resistant to abuse.** No user, and no group of users, can use up
  the shared capacity. Shared capacity means:
  - Cloudflare's free requests, and D1 reads and writes.
  - The free LLM quotas, per minute and per day.
- **NFR3 — Strong consistency.** The user quota and the model usage are
  updated atomically. Parallel requests cannot use more than the limit.
- **NFR4 — Availability.** If a model or a provider fails, the bot tries the
  next one. If none can answer, the user gets a clear message. The bot never
  stays silent.

## Decisions

| ADR | Decision                                            | Serves          |
| --- | --------------------------------------------------- | --------------- |
| 1   | Daily quota per user, stored in D1                  | NFR1, NFR2      |
| 2   | Check the quota before using it                     | NFR1, NFR2      |
| 3   | Reserve quota, give it back if no model answers     | FR6, NFR3       |
| 4   | Try free models one after another                   | NFR1, NFR4      |
| 5   | Get the user's time zone from a signed web page     | FR5             |
| 6   | Translate the bot's messages once, ahead of time    | FR4, NFR1, NFR2 |
| 7   | Pure rules in the middle, input and output at the edges | all        |
| 8   | Always answer Telegram with 200 after the auth check | NFR4, NFR2 |
| 9   | Logging and monitoring: OpenTelemetry names, sent to Axiom | NFR1, NFR2, NFR4 |

---

### ADR-1 — Daily quota per user, stored in D1

**Problem.** The bot is open to everyone. A large group of users could use up
the free capacity that all users share: Worker requests, D1 reads and writes,
and LLM calls.

**Options**

| Option | Good | Bad |
|---|---|---|
| Counters in memory | Free | Workers do not keep memory between requests |
| Cloudflare Rate Limiting binding | Free, no storage | Only 10- or 60-second windows, no daily quota |
| Cache API "blocked until" marker | Free, no daily limit | Does not work on `workers.dev` (needs a paid domain). Can lose entries. |
| One D1 row per user | Reliable, daily quota possible | Costs D1 reads and writes |

**Decision.** One D1 row per user. The quota resets 24 hours after the last
use.

**Trade-offs.**
- Every Telegram message still counts as one Worker request (100k per day on
  the free plan). Only a paid plan removes that limit.
- Every new Telegram account gets a full quota.

### ADR-2 — Check the quota before using it

**Problem.** An abuser sends many messages after the quota runs out. So a
refused message must be as cheap as possible.
- "Use first, then read the result" costs 2 reads.
- `RETURNING` does not help. D1 counts it as a read too.

**Decision.** Check the quota on the user read at the start of the update.
If nothing is left, stop, with no write. The user row (profile, settings and
quota usage, see ADR-3) is read once per update anyway, for the reply
language. A quota in its own table would cost a second read on every message.

**Trade-offs.**
- A refused message costs 1 read and 0 writes.
- An allowed message costs 2 reads and 1 write for the user row: the load,
  and the save (an `UPDATE` reads the row it changes).

### ADR-3 — Reserve quota, give it back if no model answers

**Problem.**
- If no model answers, the message should not use quota.
- But Telegram sends messages in parallel (up to 40 at once). If we charge
  only after an answer, a burst of messages can all pass before the first
  charge.

**Options**

| Option | Good | Bad |
|---|---|---|
| Charge after a model answers | Simple | A burst of messages gets around the quota |
| Reserve first, give back if no answer | Safe with parallel messages | One extra write when no model answers |

**How parallel messages are kept apart**

| Option | Good | Bad |
|---|---|---|
| A conditional upsert, with the rule in SQL (`WHERE remaining > 0`) | One statement, no retries | The quota rule is split between SQL and code |
| Optimistic concurrency on one user row | The whole quota rule is pure, in the domain | A save that loses a race is tried again |

**Decision.**
- The user is one aggregate, in one D1 row: the profile, the settings and the
  quota usage, with a `version`.
- The domain decides (`domain/quota/daily-quota-rule.ts`): reset, consume,
  refund. The repository saves the user only if its `version` is still the
  loaded one. A save that loses a race loads the user again and applies the
  change again (`app/update-user.ts`, up to 10 times).
- If no model answers, give the unit back. `lastUsedAt` is also put back, so
  the reset time does not move.
- Only messages that go to a model reserve quota. Commands, empty messages
  and unknown `/commands` never do. So they cannot be used to create endless
  reserve-and-give-back writes.

**Trade-offs.**
- A test sends 10 messages at once to D1, with 5 units left. Exactly 5 get
  through.
- Races only happen while units are left: at most once per user per day. A
  burst of 10 with 5 units left costs 85 rows read and 5 written for the
  user row: every lost race costs a read for the refused save and a read to
  load the user again. Every later burst that day costs 10 rows read and no
  write.
- When all models are down, every message gets its unit back. So the quota
  stops nobody during that time.

### ADR-4 — Try free models one after another

**Problem.**
- Free LLM plans have small limits per model: requests per minute, requests
  per day, and tokens per minute.
- The limits count per project, not per API key. More keys do not help.
- One model runs out quickly. Any model can also be overloaded or removed.

**Options**

| Option | Bad |
|---|---|
| Use one model | Runs out within hours |
| Retry the same model later | Slow, and it still runs out |
| Pay for a model | Breaks NFR1 (zero cost) |
| Try many free models, and count each model's usage | (chosen) |

**Decision.** A router tries Gemini's free models in a fixed order, then
Groq's.
- It counts each model's usage in D1. It uses the same time windows as the
  provider. For example, Gemini's daily limit resets at midnight Pacific time.
- It skips a model that is already at its limit, without calling it.
- A 429 error marks the model as used up, for the minute or the day. For
  Groq: until its `retry-after` time.
- A 503 error, a 12-second timeout, or any other error: skip only that model.
- A 401 or 403 error means the API key is bad. The router skips the whole
  provider.

**Trade-offs.**
- Each usage write is atomic. But nothing is reserved before a call. So
  parallel requests can go slightly over a model's limit, until its 429
  corrects the count.
- Answer quality is different for each model.
- The worst case (all models but the last are rate-limited) costs 29 reads
  and 18 writes.

### ADR-5 — Get the user's time zone from a signed web page

**Problem.** Telegram never tells a bot the user's time zone or location.

**Options**

| Option | Bad |
|---|---|
| Ask for a place name and guess the zone | Not reliable: one country can have many zones |
| Ask the user to share their location | Only on phones, too much to ask, needs a location-to-zone lookup |
| Guess from the language | Wrong for most people |
| Let the user's device report its zone | (chosen) |

**Decision.**
- `/tz` replies with a button. It opens a small page on the Worker.
- The page reads the device's time zone and asks the user to confirm with
  one tap. The user can also search a list of all zones.
- The page knows the user only from a signed token (HMAC). The link works for
  1 minute. The save token works for 10 minutes. The page never trusts
  anything the browser sends.
- `/tz Australia/Melbourne` (an exact zone name) skips the page.
- Separately, the model reads a time zone from the message itself, when the
  message states one or names a place.

**Trade-offs.**
- The user needs one tap and one page load.
- The device's zone can be wrong when the user is travelling. The search list
  covers that.
- Events use, in this order: the zone from the message, then the user's `/tz`
  zone, then no zone at all ("floating" time: the time as written, in the
  calendar's own zone). We first tried UTC as a default. It moved a 6pm
  Melbourne event to 4am the next day. In the last two cases, the caption
  tells the user and points to `/tz`.

### ADR-6 — Translate the bot's messages once, ahead of time

**Problem.** The bot replies in 16 languages. Its messages must be translated
somehow.

**Options**

| Option | Good | Bad |
|---|---|---|
| Dynamic: translate each reply with an LLM | Any language | Uses LLM quota on every reply. Open to abuse: a user can switch languages to spend the quota. |
| Static: translate once, ship the translations with the bot | No LLM cost, fast, same text every time | Only a fixed list of languages. Every new message needs 16 translations. |

**Decision.** Static. Every message is translated ahead of time and stored in
`src/i18n/translations/*.json`. Choosing a language never calls a
model. Other languages fall back to English. A unit test checks that every
translation keeps the same placeholders, HTML tags, emoji and commands as the
English text.

**Trade-offs.**
- Only 16 languages.
- The translations were written by an AI assistant. Native speakers have not
  reviewed them yet.

### ADR-7 — Pure rules in the middle, input and output at the edges

**Problem.** The hard parts of this bot are rules: dates, calendars, repeats,
time zones, the quota. When folders are grouped partly by technical layer and
partly by feature, and one file mixes several jobs (e.g. the `.ics` rules, the
Google link and the caption texts in one file), those rules are hard to find
and hard to test.

**Options**

| Option | Good | Bad |
|---|---|---|
| OOP as the main style (classes with behaviour, inheritance) | Familiar | Not the usual style in TypeScript. Adds classes where plain functions are enough. |
| Full DDD (aggregates, bounded contexts, domain events) | Strong model for large systems | Far too heavy for a bot of about 5,000 lines |
| Group by feature only | Easy to find a feature | Rules and input/output mix again inside each feature |
| Functional core, imperative shell, with separation of concerns and light "ports and adapters" | Fits the problem: the hard parts are pure rules. Easy to test. Usual style in TypeScript. | More, smaller files |

**Decision.** Pure rules in `domain/` and `output/`. Input and output only in
`adapters/`. `app/` connects them. `domain/` and `output/` never import from
`app/` or `adapters/`. Two ideas are taken from DDD: shared words across code
and docs, and a domain model made of types. The full rules are in
[CODE_STRUCTURE.md](CODE_STRUCTURE.md).

**Trade-offs.**
- A small feature can touch several folders, e.g. a new command needs a
  message text, a use case and a line in `handle-update.ts`.
- A unit test checks the import rule, so the structure cannot drift silently.

### ADR-8 — Always answer Telegram with 200 after the auth check

**Problem.** Telegram sends messages to the bot in order. If the bot answers
with an error (or times out), Telegram sends the same message again and again,
and every message behind it waits. One broken message can stop the bot for all
users. This happened once: a failure inside the bot returned a 500, and the
queue stayed stuck until it was cleared by hand.

**Options**

| Option | Bad |
|---|---|
| Return an error when something fails | One broken message blocks the queue for everyone |
| Always answer 200 after the auth check, and handle errors inside | (chosen) |

**Decision.**
- Once the webhook secret is correct, the bot always answers 200, even when
  something fails inside.
- Failures are logged, and the user gets a general error message.
- A wrong webhook secret still gets a real 401.

**Trade-offs.**
- A failed message is not retried. The user has to send it again.
- The logs show what failed.

---

### ADR-9 — Logging and monitoring

**Problem.**
- The bot runs on free plans with hard daily limits (NFR1, NFR2). We must see
  when a limit gets close, before users do.
- Free-text log names, with mixed casing and several names for one idea,
  break queries without any error when a message is reworded.

**Options**

| Option | Bad |
|---|---|
| Keep our own free-text names | Queries break silently; no standard for new names |
| Our own naming convention | A convention nobody else knows; other tools do not understand it |
| OpenTelemetry (OTel) names, sent by our own code to Axiom | (chosen) |
| Cloudflare's own OTel export to Axiom | Needs the Workers Paid plan; billed from 1 Oct 2026; still in beta |

**Decision.**
- Every log event uses the OTel log record's field names (`severityText`,
  `eventName`, `traceId`, `scope.name`) and OTel attribute names (e.g.
  `user.id`, `exception.message`). The rules are in "Logging" in
  [CODE_STRUCTURE.md](CODE_STRUCTURE.md#logging).
- Our own names start with our area (e.g. `telegram.chat.id`), never with an
  OTel namespace. We do not add an app prefix: only this bot writes to the
  dataset, and `service.name` names it.
- One request is one log session with one `traceId`. Its events are sent to
  the `app-logs` dataset in Axiom in one batch, after the response. Each
  dotted name is sent as nested fields (`user.id` as `{ user: { id } }`):
  Axiom's filters do not find a flat key with dots in its name. Every
  event is also printed to the console, so Workers Logs keeps a copy.
- Because the names are OTel names, a later switch to Cloudflare's OTel export
  changes only the sender.

**Trade-offs.**
- The names are long, and APL needs quotes for names with dots:
  `['user.id']`.
- Some OTel names (`user.*`, `gen_ai.*`) are still "development" in OTel, so
  they may change.
- The logs hold message texts and user names.
- Every printed line counts toward the Workers Logs limit (200k lines per day
  on the free plan).

**What to monitor (draft).** The limits for alerts are first guesses: set
them after a few weeks of normal traffic. The event names are listed in
"Logs" in the [README](../README.md#logs).

| Risk | What to watch | Where | Alert when |
|---|---|---|---|
| **A swarm of abusers** (NFR2) | New users per hour (`user_activity.bot_started`); users who used up their quota (`user_activity.quota_used_up`); messages per user per hour | Axiom | New users per hour are far above normal (e.g. 10×); many new users use up their quota within minutes |
| **Cloudflare capacity** (NFR1) | Worker requests per day (free: 100k); D1 rows read (5M) and written (100k) per day; Workers Logs lines per day (200k) | Cloudflare dashboard (exact numbers). Early warning in Axiom: log D1's `meta.rows_read` and `meta.rows_written` per request | A daily count passes 70% of its limit |
| **LLM usage, and running out** (NFR1, NFR4) | Calls per model against its limits; models used up for the day; messages that no model answered; tokens per day (`gen_ai.usage.*`) | Axiom; the D1 tables `gemini_usage` and `groq_usage` | The first message of the day that no model answered; all Gemini models used up early in their day |
| **Errors** (NFR4) | Every `ERROR` event (by the level rule, a developer must act); a jump in `WARN` events; a provider's 401 or 403 (a bad API key); webhook 401s (a wrong or cleared webhook secret); failed sends to Axiom (console only) | Axiom; Workers Logs for failed sends to Axiom | Any `ERROR`; any 401 or 403 at once |

**Open questions.**
- How many Axiom monitors does our plan allow, and where should alerts go
  (e.g. email, or a Telegram message to the owner)?
- Should the bot stop taking new users when a daily limit gets close?

---

## The daily quota in detail

Each user can send a fixed number of messages per day to a model:
`APP_CONFIG.dailyQuota` (now 10). `APP_CONFIG.showDailyQuota` decides whether
the replies mention it. It is off for now, so a new user does not feel
limited. The decisions behind the quota are ADR-1 to ADR-3.

### Rules

- **Only messages that go to a model use quota.** These never do: commands
  (including unknown ones) and messages with no text.
- **No answer, no quota.** If no model answers (all failed, or none was
  available), the unit is given back. An answer that is not usable at all
  (e.g. not JSON) is given back too.
- **An answer that gives no event still uses the unit**, e.g. an unclear
  repeat, or a message with no date.
- **The quota is full again 24 hours after the last use**
  (`QUOTA_RESET_AFTER_MS`). A unit given back puts the usage back exactly as
  it was, `lastUsedAt` too, if no other unit was used since. So an unanswered
  message does not move the reset time.
- **A user with no quota left gets a reply every time** ("try again in …"). It
  costs no D1 write. Telegram limits how fast one chat can send.
- If the bot crashes after taking a unit, the unit is not given back.

### Flow of one message

In `src/app/handle-update.ts` and `src/app/create-event-from-message.ts`:

1. Load the user (`loadUserOfUpdate`). A new user, or a changed Telegram name,
   is saved.
2. Commands and messages with no text are answered. No quota is used.
3. Take a unit (`consumeUnit`, saved with `updateUser`). If none is left,
   refuse, with no write. If another message of the same user saved first,
   load the user again and try again.
4. Call the router: Gemini's models in order, then Groq's.
5. If no model gave a usable answer, give the unit back (`refundUnit`). It
   starts from the user saved in step 3, so it needs no load first.

### D1 cost per message

The rows read and written for one event message, by path. The model tables
have one row per model: 7 for Gemini, 2 for Groq.

| Path | Rows read | Rows written |
|---|---|---|
| A command, or a message with no text | 1 | 0 |
| **A user with no quota left** | **1** | **0** |
| **Success: the first model answers** | **10** | **2** |
| **Success after other models** (the worst case: all 7 Gemini models and the first Groq model are rate-limited, the second Groq model answers) | **28** | **18** |
| No model: none available (all are marked as used up, so none is called) | 12 | 2 |
| No model: every model is called and rate-limited (the worst case) | 30 | 20 |

On top of these:
- a new user, or a changed Telegram name: 1 read and 1 write, once;
- `/lang`, and `/tz` with a zone, save the user: 1 read and 1 write;
- a save that loses a race: 2 reads (the refused save, and the load again).

**Where the rows go:**

| Step | Read | Written |
|---|---|---|
| Load the user | 1 | 0 |
| Save the user (create, take a unit, give it back, change a setting) | 1 | 1 |
| A save that loses a race | 1 | 0 |
| List the available Gemini models (reads the whole table) | 7 | 0 |
| List the available Groq models (reads the whole table) | 2 | 0 |
| A model answers (record the usage) | 1 | 1 |
| A model is rate-limited (mark it as used up, and record the error) | 2 | 2 |
| A model fails in another way (record the error) | 1 | 1 |

More models means more reads to list them, and more writes in the worst case.

### Capacity

**The plans:**
- **D1 Free:** 5M rows read and 100k rows written per day.
- **Workers Paid ($5/month):** includes D1 with 25B rows read and 50M rows
  written per month. That is about 1.6M writes per day.
- On both plans, writes run out long before reads.

| Path | Messages per day, free D1 writes | Messages per day, paid D1 writes (~1.6M/day) |
|---|---|---|
| Success, first model (2 writes) | ~50,000 | ~820,000 |
| Success, worst case (18 writes) | ~5,500 | ~91,000 |
| No model, worst case (20 writes) | ~5,000 | ~82,000 |
| A user with no quota left | no writes; about 5M per day (reads) | no real limit |

Example: in the worst case (18 writes per message), the free plan supports
about 550 users per day who each use all 10 requests.

**Worker requests usually run out first.**
- Workers Free allows 100k requests per day.
- Every Telegram update is one request: answered, refused, or ignored.
- Workers Paid includes 10M requests per month, with no daily limit. More
  requests cost extra per million.

### Known risks

- **Giving back units makes the no-model path unlimited.** While all models
  are down, every message gets its unit back. So the quota stops no one.
  - Each such message costs 12 reads and 2 writes (20 writes if every model
    is called and fails).
  - At 2 writes each, about 50k messages per day use up the free D1 writes.
- **Every new account gets a full quota.** Many new Telegram accounts can cost
  1 write each to create the user, then model calls and 2 to 18 writes per
  message, until each account runs out.
- **Every message costs 1 read** (the user load), even a refused one.

### How we measured

- We used the local D1 of the Workers test runtime. It uses the same SQLite
  engine as production.
- We ran each step of the D1 adapters on tables with one row per model, and
  added up `meta.rows_read` and `meta.rows_written` of each result.
- To check this in production: look at the D1 analytics in the Cloudflare
  dashboard, or log `meta.rows_read` and `meta.rows_written` of the D1
  results for a day.
