# Architecture Decision Registry

This file lists the main design decisions of Noted, and why we made them.
The D1 costs we measured are in [USER_QUOTA_DESIGN.md](USER_QUOTA_DESIGN.md).

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
- **FR6 — Visible daily quota.** `/start` shows the daily quota. Every answer
  shows how many requests are left.

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

**Decision.** First read the quota (`SELECT`). If nothing is left, stop. Only
then use one unit (an upsert).

**Trade-offs.**
- A refused message costs 1 read and 0 writes.
- An allowed message needs two D1 calls instead of one. This adds a few
  milliseconds. The LLM call after it takes seconds anyway.

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

**Decision.**
- Reserve one unit with a conditional upsert (`WHERE remaining > 0`).
- If no model answers, give the unit back. `lastUsedAt` is also put back, so
  the reset time does not move.
- Only messages that go to a model reserve quota. Commands, empty messages
  and unknown `/commands` never do. So they cannot be used to create endless
  reserve-and-give-back writes.

**Trade-offs.**
- A test sends 10 messages at once with a quota of 3. Exactly 3 get through.
- When all models are down, every message gets its unit back. So the quota
  stops nobody during that time. Each such message costs about 13 reads and 2
  writes.

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
`src/legacy/translation/translations/*.json`. Choosing a language never calls a
model. Other languages fall back to English. A unit test checks that every
translation keeps the same placeholders, HTML tags, emoji and commands as the
English text.

**Trade-offs.**
- Only 16 languages.
- The translations were written by an AI assistant. Native speakers have not
  reviewed them yet.

### ADR-7 — Pure rules in the middle, input and output at the edges

**Problem.** The code had no single structure. Some folders were grouped by
technical layer (`repositories/`, `providers/`), others by feature
(`extractedEvents/`, `telegram/`). Some files mixed several jobs: for example,
`calendarEvent.ts` held the `.ics` rules, the Google link, and the Telegram
caption texts. So the core logic was hard to find.

**Options**

| Option | Good | Bad |
|---|---|---|
| OOP as the main style (classes with behaviour, inheritance) | Familiar | Not the usual style in TypeScript. Adds classes where plain functions are enough. |
| Full DDD (aggregates, bounded contexts, domain events) | Strong model for large systems | Far too heavy for a bot of about 5,000 lines |
| Keep the current mix | No work | The problem stays and grows |
| Functional core, imperative shell, with separation of concerns and light "ports and adapters" | Fits the problem: the hard parts are pure rules. Easy to test. Usual style in TypeScript. | Needs a one-time move of many files |

**Decision.** Pure rules in `domain/` and `output/`. Input and output only in
`adapters/`. `app/` connects them. `domain/` and `output/` never import from
`app/` or `adapters/`. Two ideas are taken from DDD: shared words across code
and docs, and a domain model made of types. The full rules, the target place of
every file, and the order of the work are in
[CODE_STRUCTURE.md](CODE_STRUCTURE.md).

**Trade-offs.**
- The move touches many files. It is done in small steps, and file moves are
  never mixed with logic changes.
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
- The old log names were free text, with mixed casing and several names for
  one idea. A reworded message broke queries without any error.

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
  the `app-logs` dataset in Axiom in one batch, after the response. Every
  event is also printed to the console, so Workers Logs keeps a copy.
- Because the names are OTel names, a later switch to Cloudflare's OTel export
  changes only the sender.

**Trade-offs.**
- The names are long, and APL needs quotes for names with dots:
  `['user.id']`.
- Some OTel names (`user.*`, `gen_ai.*`) are still "development" in OTel, so
  they may change.
- The logs hold message texts and user names. `/start` tells users (see
  [PRODUCT.md](PRODUCT.md)).
- Every printed line counts toward the Workers Logs limit (200k lines per day
  on the free plan).

**What to monitor (draft).** The event names come from each area when it is
rewritten (steps 4c–5). The limits for alerts are first guesses: set them
after a few weeks of normal traffic.

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
