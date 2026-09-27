# Architecture Decision Registry

The decisions that shape how Noted is built, and why. Measured D1 costs are in
[USER_QUOTA_DESIGN.md](USER_QUOTA_DESIGN.md).

## Requirements

### Functional

- **FR1 — Message to calendar event.** Forward any message (text, or a caption
  on media) and get a one-tap Google Calendar link plus an `.ics` file.
- **FR2 — Messages in any language.** Events are extracted from messages in
  any language the models understand, not only the 16 the bot replies in.
- **FR3 — Recurring events.** Explicit repeats ("every Thursday", "first Friday
  of the month") become a proper repeat rule.
- **FR4 — Replies in the user's language.** 16 languages, detected from
  Telegram and changeable with the `/lang` command.
- **FR5 — Per-user time zone.** Set with the `/tz` command.
- **FR6 — Visible daily quota.** `/start` tells users their daily quota, and
  every answer says how much is left.

### Non-functional

- **NFR1 — Zero cost.** Runs entirely on free tiers: Cloudflare Workers, D1,
  and free LLM models.
- **NFR2 — Abuser resistance.** No user, or swarm of users, can exhaust the
  capacity everyone shares: Cloudflare's free request and D1 read/write
  budgets, and the free LLM models' per-minute and per-day quotas.
- **NFR3 — Strong consistency.** User quota and model usage are updated
  atomically, so parallel requests can't overspend them.
- **NFR4 — Availability.** When a model or a whole provider is rate-limited,
  overloaded or broken, the bot moves on to another; if none can answer, the
  user gets a clear message instead of silence.

## Decisions

| ADR | Decision                                            | Serves     |
| --- | --------------------------------------------------- | ---------- |
| 1   | Per-user daily quota in D1                          | NFR1, NFR2 |
| 2   | Check the user quota before consuming it            | NFR1, NFR2 |
| 3   | Reserve user quota, refund it when no model answers | FR6, NFR3  |
| 4   | Cycle through free models across providers          | NFR1, NFR4 |
| 5   | Find the user's time zone with a signed web page    | FR5        |

---

### ADR-1 — Per-user daily quota in D1

**Problem.** An open bot lets a swarm of users spend the free budgets that
every real user shares (Worker requests, D1 reads and writes, LLM calls).

**Options**

- In-memory counters: free, but Workers keep no reliable state between requests.
- Cloudflare Rate Limiting binding: free and stateless, but windows are only
  10 or 60 seconds (no daily quota).
- Cache API "denied until" marker: free, no daily cap, but it doesn't work on
  `workers.dev` (needs a paid domain) and can lose entries.
- D1 row per user.

**Decision.** D1, one row per user, reset 24 hours after last use.

**Trade-offs.** Every Telegram update still counts as a Worker request
(100k a day free); only a paid plan lifts that. Each new account gets a full
quota.

### ADR-2 — Check the quota before consuming it

**Problem.** A refused message is what an abuser repeats, so it must be as
cheap as possible. Consuming first and then reading the result cost 2 reads;
`RETURNING` doesn't help, because D1 bills it as a read too.

**Decision.** `SELECT` first and stop if nothing is left; only then run the
consuming upsert.

**Trade-offs.** A refused message costs 1 read and no writes. An allowed one
takes two D1 round trips instead of one: a few milliseconds before an LLM
call that takes seconds.

### ADR-3 — Reserve quota, refund it when no model answers

**Problem.** A message no model answers shouldn't use quota. But Telegram
delivers updates in parallel (up to 40 at once), so charging only after an
answer lets a burst of messages all pass before any charge lands.

**Options**

- Charge after a model answers: simple, but bursts get around it.
- Reserve atomically first, refund if no model answered.

**Decision.** Reserve with a conditional upsert (`WHERE remaining > 0`), and
refund if no model answered, restoring `lastUsedAt` too, so the reset time
doesn't move. Only a message that goes to a model reserves a unit: commands,
empty messages and unknown `/commands` never touch the quota, so they can't be
used to loop reserve-and-refund writes.

**Trade-offs.** A test sends 10 messages at once with a quota of 3; exactly 3
get through. But while every model is down, every message is refunded, so the
quota stops nobody. Each such message costs about 13 reads and 2 writes.

### ADR-4 — Cycle through free models across providers

**Problem.** Free LLM tiers have small per-model limits (requests per minute
and per day, tokens per minute), counted per project rather than per API key.
One model runs out quickly, and any model can be overloaded or retired.

**Options**

- One model: runs out within hours.
- Retry the same model with backoff: slow, and it still runs out.
- A paid tier: breaks NFR1.
- Route across many free models and providers, tracking each one's usage.

**Decision.** A router tries Gemini's free models in registry order, then
Groq's.

- Each model's usage is counted in D1, using the same windows as the provider
  (Gemini's daily limits reset at midnight Pacific time). Models already at
  their limits are skipped without being called.
- A 429 marks that model exhausted for the minute or the day (Groq: until its
  `retry-after`).
- A 503, a 12-second timeout or any other failure skips just that model.
- A 401/403 means the key itself is bad, so the router abandons that provider.

**Trade-offs.** Each usage write is atomic, but nothing is reserved before a
call, so parallel requests can overshoot a model's limit until its 429
corrects the count. Answer quality varies from model to model. The worst case
(every model but the last rate-limited) costs 29 reads and 18 writes.

### ADR-5 — Find the user's time zone with a signed web page

**Problem.** Telegram never tells a bot the user's time zone or location.

**Options**

- Ask for a place name and guess its zone: unreliable, since a country can
  span several zones.
- Ask the user to share their location: mobile-only, too much to ask for, and
  it needs a location-to-zone lookup.
- Infer it from the language: wrong for most people.
- Let the user's own device report it.

**Decision.** `/tz` replies with a button to a small page served by the
Worker. The page reads the device's zone
(`Intl.DateTimeFormat().resolvedOptions().timeZone`) and asks for a one-tap
confirmation, or offers a searchable list of every zone. The page knows the
user only from a signed token (HMAC, 1-minute link, 10-minute save token), not
from anything the browser sends. Typing an exact zone (`/tz Australia/Melbourne`)
skips the page. Separately, the model reads a zone from the message itself
when the message states one or names a place.

**Trade-offs.** It costs the user a tap and a page load. The device's zone can
be wrong when travelling, which the list covers. Events use, in order: a zone
the message gives, the user's `/tz` choice, then UTC. In the last two cases
the caption says which zone was used and points to `/tz`, so a wrong guess is
visible.

- translation:
  dynamic --> llm usage, open for abuse
  static --> one time transaltion, limited number of languages no llm cost
