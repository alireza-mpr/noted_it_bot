# User Quota — Design and D1 Cost

Each user can send a fixed number of messages per day that go to a model.
The number is `appConfig.dailyQuota` (now 5).

This file explains:
- how the quota is used and given back,
- what each kind of message costs in D1 rows,
- how many messages the free and paid plans can handle.

## Rules

- **Only messages that go to a model use quota.** These never use quota:
  `/start`, `/ver`, `/diag`, `/lang`, `/tz`, unknown `/commands`, and messages
  with no text.
- **No answer, no quota.** If no model answers (all failed, or none was
  available), the unit is given back.
- **An answer uses the unit.** This is true even if the answer is not usable
  (for example, a declined repeat, or no event could be built).
- **The quota resets 24 hours after the last use** (`QUOTA_RESET_AFTER_MS`).
  When a unit is given back, `lastUsedAt` is also put back. So an unanswered
  message does not move the reset time.
- **A user with no quota left gets a reply every time** ("try again in …").
  Telegram limits how fast one chat can send. A refused message costs no D1
  write.
- If the bot crashes after taking a unit, the unit is not given back.

## Flow

In `src/telegram/messageHandlers/updateHandler.ts` → `handleMessage`:

1. Read the user's language and time zone (`user_preference`). This happens
   for every message.
2. Commands, messages with no text, and unknown `/commands` are answered
   here. No quota is used.
3. **Check first** (`UserUsageRepository.tryConsume`):
   - Read the quota that is left (`SELECT`).
   - If it is 0: refuse. This is the whole cost of a user with no quota.
   - Otherwise, use one unit with a conditional upsert (`CONSUME_USER_QUOTA`,
     with `WHERE remaining > 0`). If no row changes, another message from the
     same user took the last unit a moment earlier. Refuse.
4. Call the router (Gemini models in order, then Groq).
5. If no model answered: give the unit back (`REFUND_USER_QUOTA`).

### Why "check, use, then give back"?

- **Using quota only after an answer is not safe.** Telegram sends messages in
  parallel (up to 40 at once). A burst of 20 messages would all pass the
  check before any unit is used. That means 20 model calls with a quota of 3.
  The upsert with `WHERE` is atomic, so a burst gets exactly the units that
  are left. The unit test "lets only the available units through when
  messages race" checks this.
- **Checking first is cheaper for refused users.** An upsert and then a
  `SELECT` costs 2 reads. Checking first costs 1 read. An upsert with
  `RETURNING` does not help: D1 counts `RETURNING` as another read.

## D1 cost per message

These are the rows read and written for one message.
- `CREATE TABLE IF NOT EXISTS` costs nothing once the table exists.
- The model tables have one row per model: 7 for Gemini, 2 for Groq.

| Path | Rows read | Rows written |
|---|---|---|
| Command, no text, or unknown `/command` | 1 | 0 |
| **User with no quota left** | **2** | **0** |
| **Success: the first model answers** | **11** | **2** |
| **Success after trying other models** (worst case: all 7 Gemini models and the first Groq model are rate-limited, the second Groq model answers) | **29** | **18** |
| No model: none available (all are marked as used up, so none is called) | 13 | 2 |
| No model: every model is called and rate-limited (the worst case) | 31 | 20 |

The command row does not include what the command itself does. For example,
`/lang` and `/tz` each write one `user_preference` row.

### Where the rows go

| Step | Read | Written |
|---|---|---|
| Language and time zone (`user_preference`) | 1 | 0 |
| Quota check (`SELECT`) | 1 | 0 |
| Use one unit (upsert) | 1 | 1 |
| Give the unit back | 1 | 1 |
| List available Gemini models (reads the whole table) | 7 | 0 |
| List available Groq models (reads the whole table) | 2 | 0 |
| A model answers (record usage) | 1 | 1 |
| A model is rate-limited (mark as used up, record the error) | 2 | 2 |
| A model fails in another way (record the error) | 1 | 1 |

More models means more reads to list them, and more writes in the worst case.

## Capacity

**The plans:**
- **D1 Free:** 5M rows read and 100k rows written per day.
- **Workers Paid ($5/month):** includes D1 with 25B rows read and 50M rows
  written per month. That is about 1.6M writes per day.
- On both plans, writes run out long before reads.

| Path | Messages per day, free D1 writes | Messages per day, paid D1 writes (~1.6M/day) |
|---|---|---|
| Success, first model | ~50,000 | ~820,000 |
| Success, worst case (18 writes) | ~5,500 | ~91,000 |
| No model, worst case (20 writes) | ~5,000 | ~82,000 |
| User with no quota left | no writes; about 2.5M per day (reads) | no real limit |

Example: in the worst case (18 writes per message), the free plan supports
about 1,100 users per day who each use all 5 requests.

**Worker requests usually run out first.**
- Workers Free allows 100k requests per day.
- Every Telegram message is one request: answered, refused, or ignored.
- Workers Paid includes 10M requests per month, with no daily limit. More
  requests cost extra per million.

## Known risks

- **Giving back units makes the no-model path unlimited.** While all models
  are down, every message gets its unit back. So the quota stops no one.
  - Each such message costs 13 reads and 2 writes (20 writes if every model
    is called and fails).
  - At 2 writes each, about 50k messages per day use up the free D1 writes.
- **Every new account gets a full quota.** Many new Telegram accounts can
  cost model calls and 2 to 18 writes per message, until each account runs
  out.
- **The language read happens before any check.** So every message costs 1
  read, even refused and ignored ones.

## How we measured

- We used a local D1 (wrangler's `getPlatformProxy`). It uses the same SQLite
  engine as the Workers runtime.
- We ran the real SQL from `src/db/sql/*` on tables with one row per model.
- For each path, we added up `meta.rows_read` and `meta.rows_written` of each
  result.

To check this in production: log `meta.rows_read` and `meta.rows_written` of
the `D1Result`s for a day, or look at the D1 analytics in the Cloudflare
dashboard.
