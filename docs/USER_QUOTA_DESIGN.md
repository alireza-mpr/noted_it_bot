# User Quota — Design & D1 Cost

Each user gets a daily quota of messages (`featureFlags.dailyQuota`, currently
3) that go to a model. This document describes how the quota is taken and
given back, and what each kind of message costs in D1 rows. The numbers are
there so the free and paid limits can be checked against expected load.

## Rules

- **Only a message that goes to a model uses quota.** `/start`, `/ver`,
  `/diag`, `/lang`, `/tz`, unknown `/commands` and messages with no text never
  touch the quota.
- **No model, no quota.** If no model answers (every model failed, or none
  was available), the unit is given back.
- **A model answered, so the unit is used,** even if the answer was then
  unusable (a declined recurring event, or no calendar event could be built).
- **The window is 24 h from the last use** (`QUOTA_RESET_AFTER_MS`). A refund
  puts `lastUsedAt` back as well, so a message nobody answered doesn't push the
  reset time out.
- **A user who has run out gets a reply every time** ("try again in …").
  Telegram limits how fast one chat can send, and a denied message costs no
  D1 write.
- An unexpected crash after the quota was taken keeps the unit.

## Flow

In `src/telegram/messageHandlers/updateHandler.ts` → `handleMessage`:

1. Read the user's language (`user_preference`). This runs for every message,
   before anything else.
2. Commands, messages with no text and unknown `/commands` are answered here,
   with no quota involved.
3. **Check first** (`UserUsageRepository.tryConsume`):
   - `SELECT` the user's effective remaining quota.
   - If it's 0, deny. That's the whole cost of a rate-limited user.
   - Otherwise run the conditional upsert (`CONSUME_USER_QUOTA`, guarded by
     `WHERE remaining > 0`). If it changes no row, another message from the
     same user took the last unit in the meantime, so deny.
4. Call the router (Gemini models in order, then Groq).
5. If no model answered, run `REFUND_USER_QUOTA`.

### Why check first, then consume, then refund

- **Consuming only after a model answers is unsafe.** Telegram delivers
  webhook updates in parallel (up to 40 at once by default). A burst of 20
  messages would all pass the check before any consume lands, which means 20
  model calls on a quota of 3. The upsert's `WHERE` guard makes the
  reservation atomic, so a burst gets exactly the remaining units. The
  unit test "lets only the available units through when messages race"
  covers this.
- **A plain upsert followed by a `SELECT` costs 2 reads for a denied user.**
  Checking first costs 1. An upsert with `RETURNING` doesn't help, because D1
  counts the `RETURNING` as its own read.

## D1 cost per message

Rows read and written for one message. Every `CREATE TABLE IF NOT EXISTS` in a
batch costs 0 once the table exists. The provider tables hold one row per
model: 7 Gemini and 2 Groq.

| Path | Rows read | Rows written |
|---|---|---|
| Command, no text, or unknown `/command` | 1 | 0 |
| **Rate-limited user** | **2** | **0** |
| **Success: first model answers** | **11** | **2** |
| **Success: after fallbacks** (worst case: all 7 Gemini + first Groq rate-limited, second Groq answers) | **29** | **18** |
| No model: none available (all already marked exhausted, so none is called) | 13 | 2 |
| No model: every model tried and rate-limited (worst case overall) | 31 | 20 |

Command costs don't include what the command itself does. For example, `/lang`
and `/tz` each write one `user_preference` row.

### Where the rows go

| Step | Read | Written |
|---|---|---|
| Language (`user_preference`) | 1 | 0 |
| Quota check (`SELECT`) | 1 | 0 |
| Quota consume (upsert) | 1 | 1 |
| Quota refund | 1 | 1 |
| List available Gemini models (reads the whole table) | 7 | 0 |
| List available Groq models (reads the whole table) | 2 | 0 |
| A model answers (record usage) | 1 | 1 |
| A model is rate-limited (mark exhausted + record error) | 2 | 2 |
| A model fails any other way (record error) | 1 | 1 |

Adding models grows both the list reads and the worst-case writes.

## Capacity

The limits used below are **D1 Free**: 5M rows read and 100k rows written per
day. **Workers Paid ($5/month)** includes D1 at 25B rows read and 50M rows
written per month, about 1.6M writes a day. On both plans, writes run out
long before reads.

| Path | Messages/day on free D1 writes | Messages/day on paid D1 writes (~1.6M/day) |
|---|---|---|
| Success, first model | ~50,000 | ~820,000 |
| Success, worst case (18 writes) | ~5,500 | ~91,000 |
| No model, worst case (20 writes) | ~5,000 | ~82,000 |
| Rate-limited | no writes; about 2.5M a day on reads | effectively unlimited |

For example, at the worst-case 18 writes per successful message, the free plan
covers about 1,800 users a day who each use their full quota of 3.

**Workers requests usually run out first.** Workers Free allows 100k requests
a day. Every Telegram update is one request, whether it's served, denied or
ignored. Workers Paid includes 10M requests a month, with no daily limit,
billed per extra million after that.

## Known exposures

- **Refunds make the no-model path unlimited per user.** While every model is
  down or exhausted, each message is refunded, so the quota never stops a user.
  Each such message costs 13 reads and 2 writes, or 20 writes if every model
  is actually called and fails. At 2 writes, a flood of about 50k messages a
  day uses up the free D1 writes.
- **Fresh accounts each get a full quota.** A swarm of new Telegram accounts
  costs model calls and about 2–18 writes per message until each account runs
  out.
- **The language read runs before any gate**, so every update, including
  denied and ignored ones, costs 1 read.

## How these numbers were measured

The numbers were measured on local D1 (wrangler's `getPlatformProxy`, the same
SQLite engine the Workers runtime uses), running the real SQL from
`src/db/sql/*` against tables filled with one row per model. Each result's
`meta.rows_read` and `meta.rows_written` were summed per path.

To confirm on production, log `meta.rows_read` and `meta.rows_written` from the
`D1Result`s for a day, or check the D1 analytics in the Cloudflare dashboard.
