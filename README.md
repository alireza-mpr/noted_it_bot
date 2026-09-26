# noted_it

Telegram bot running on Cloudflare Workers, in two environments:

| Env  | Telegram bot          | Worker name        | Deploys on                          |
|------|------------------------|---------------------|--------------------------------------|
| dev  | `@noted_it_dev_bot`    | `noted-it-dev-bot`  | every push to `main`                 |
| prod | `@noted_it_bot`        | `noted-it-bot`      | manually, via a pushed `v*.*.*` tag (see [Promoting to prod](#promoting-a-commit-to-prod)) |

Forward it any message with an event in it (a flyer photo with a caption
works too), and it replies with a one-tap "add to Google Calendar" link plus
an `.ics` file for Apple Calendar/Outlook/anywhere else.

## Commands

| Command       | What it does                                                         |
|---------------|------------------------------------------------------------------------|
| `/start`      | Intro message                                                        |
| `/lang`       | Set the reply language (`/lang fa`, `/lang Persian`) or `/lang auto` to go back to auto-detect; a bare `/lang` replies with how to use it |
| `/ver`        | Show the running version                                             |
| `/diag`       | Gemini connectivity check — functional but intentionally not listed in Telegram's `/` autocomplete menu |

Any other message is treated as event content and sent to Gemini for extraction.

### Recurring events

Explicit repetition ("every Thursday 7:30pm", "every 2 weeks until 29 Nov",
"first Friday of the month") is extracted as a `recurrence` object (see
`src/extractedEvents/event_schema.ts`) and turned into an `RRULE` in the `.ics` file
by `src/extractedEvents/recurrence.ts` — the model only describes the pattern; all date
arithmetic (first occurrence, end date, validation) is done in code, using
today's date in the event's timezone when no start date is stated.

- Series without an end date are open-ended (no cap).
- A repeat rule that is invalid or low-confidence (`RECURRENCE_MIN_CONFIDENCE`,
  0.7) is declined with a message instead of guessed.
- The Google Calendar link also carries the rule (`recur=RRULE:...`), which the
  **web** editor honours but the **phone app ignores** (it adds one event). So
  for repeating events the attached `.ics` is the dependable route, and the
  caption and `/start` tell users that.

## How it works

Telegram calls the Worker's URL as a webhook for every update (no polling, no
always-on process). [src/telegram/telegramWebhook.ts](src/telegram/telegramWebhook.ts) is the Worker's
entry point (`main` in `wrangler.toml`) and is deliberately tiny: it
verifies the request came from Telegram (via a shared secret token), initialises
the shared pieces (whitelist policy, message logger), builds the router and the
Telegram client, and hands the update to `updateHandler`. The rest of the Telegram
code sits next to it in `src/telegram/`:

- `messageHandlers/updateHandler.ts` is the flow for one update: `updateHandler` reads it and works
  out the reply language, then `handleMessage` checks the sender against the
  [whitelist](#access-control-whitelist) (`/lang` is exempt) and dispatches: a
  command (a plain `if` per command, so that is where a new one is added), or,
  for anything else, event extraction via Gemini. `updateHandler` never throws;
  errors are reported to the chat, because Telegram retries any non-2xx update and
  would block the queue.
- `commands/` has one handler file per command (`startCommandHandler.ts`,
  `versionCommandHandler.ts`, `diagCommandHandler.ts`, `langCommandHandler.ts`
  for `/start`, `/ver`, `/diag`, `/lang`), each a plain function taking only what
  it needs.
- `messageHandlers/eventMessageHandler.ts` is the forwarded-event flow: extract, log the message,
  decline untrustworthy repeat rules, build the calendar event and caption, send
  the `.ics`.
- `replier.ts` is the one place that does "translate the template, fill `{0}`,
  send", used by every reply; `telegramClient.ts` (`sendMessage`,
  `sendDocument`), `telegramTypes.ts` and `telegramHtml.ts` are the Telegram API
  pieces.

`Env` is in `src/env.ts`; `extractEvent` is in
`src/extractedEvents/extractEvent.ts`.

## Local dev

```bash
npm install
npx wrangler secret put BOT_TOKEN --env dev      # paste noted_it_dev_bot_token from secrets/dev.json
npx wrangler secret put WEBHOOK_SECRET --env dev # any random string
npx wrangler secret put GEMINI_API_KEY --env dev # your Gemini API key
npx wrangler secret put GROQ_API_KEY --env dev   # your Groq API key
npx wrangler secret put AXIOM_TOKEN --env dev    # optional locally: without it, logs stay in the console
npx wrangler dev --env dev
```

`wrangler dev` gives you a local/tunnel URL — point Telegram's webhook at it with:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=<your dev URL>" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

## Tests

`tests/integration/extractEvent.test.ts` calls the real Gemini API with a table of
message → expected-JSON cases (partial match via `toMatchObject`, so you only
assert the fields you care about), through the real router. Runs inside the
Workers runtime via `@cloudflare/vitest-plugin`.

Tests use no local files or simulated storage: the `dev` KV namespaces and the
dev D1 database are **remote bindings** (`remote = true` in
[wrangler.toml](wrangler.toml)), so a test run reads and writes the real dev
resources — locally exactly as in CI. Everything comes from environment
variables, the same three CI sets:

```bash
export GEMINI_API_KEY=...          # from the dev environment's secrets
export GROQ_API_KEY=...            # optional: lets the router reach Groq in the tests
export CLOUDFLARE_API_TOKEN=...    # needs Workers KV Storage: Edit and D1: Edit
export CLOUDFLARE_ACCOUNT_ID=...
npm ci && npm run typecheck && npm test
```

`vitest.config.ts` fails fast if `GEMINI_API_KEY` is missing. Runs are slower
than a simulated setup (every KV/D1 call is a network round trip) and leave usage
rows in the dev `gemini_usage` table. To run only the offline tests:
`npx vitest run tests/unit`.

## CI/CD

- `.github/workflows/ci.yml` — two jobs, on every push (the PR run stops after `build`):
  - `build` installs deps, typechecks, and runs the test suite (real Gemini API,
    real dev KV and D1 via remote bindings; needs `GEMINI_API_KEY`, `GROQ_API_KEY`,
    `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`).
  - `deploy-dev` needs `build`, so it runs only when the tests pass, and only on
    `main`. To deploy despite failing tests (say, the dev Gemini quota is used up),
    run the CI workflow by hand from the Actions tab on `main` and tick
    **Deploy to dev even if the tests fail**. On success, it pushes a git tag matching exactly what `/ver`
    reports for that deploy (e.g. `v0.2.42-beta-abc1234`), so a specific dev
    deployment can be found later with `git tag`. A failed deploy leaves no tag.
    Because the tests share the dev quota, a run that fails on quota blocks the
    dev deploy too.
- `.github/workflows/deploy.yml` — `deploy-prod` **never runs automatically** — it's
  `workflow_dispatch`-only (manually triggered), gated to only run against a
  `v*.*.*` tag. See [Promoting a commit to prod](#promoting-a-commit-to-prod).
- Each deploy goes via `wrangler` to its own Worker and re-points that
  environment's Telegram webhook + command list at it.

### Promoting a commit to prod

GitHub's native "Required reviewers" approval gate for Environments isn't
available on private repos on the Free plan, so `deploy-prod` uses manual
triggering as the guard instead — nothing reaches prod without a deliberate
click, even though the tag itself doesn't auto-deploy.

1. Make sure `main` has everything you want in prod (push it, let `deploy-dev`
   confirm it's healthy).
2. Tag the commit and push the tag (stay in `0.x.y` while the bot is Beta —
   semver reserves `1.0.0`+ for a stable release):
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
   This does **not** deploy anything by itself — it just marks the commit.
3. Go to the repo's **Actions** tab → **Deploy** workflow → **Run workflow**.
4. In the ref dropdown, pick the tag you just pushed (e.g. `v0.2.0`) instead of `main`.
5. Click **Run workflow**. This runs `deploy-prod` (and only `deploy-prod` —
   `deploy-dev` won't run for a `workflow_dispatch` event) against exactly
   that tagged commit.

To roll prod back to an older tagged version later, repeat steps 3–5 picking
that older tag from the dropdown.

### Where secrets live

**Locally**: `secrets/dev.json` / `secrets/prod.json` (gitignored, never committed).

**In CI**: as [GitHub Environments](../../settings/environments) named `dev` and `prod`
(Settings → Environments → New environment), each holding its own copies of:

| Secret            | Where it comes from                                                        |
|--------------------|------------------------------------------------------------------------------|
| `BOT_TOKEN`        | the matching `secrets/{dev,prod}.json` token                                |
| `WEBHOOK_SECRET`   | a random string you generate once per env (e.g. `openssl rand -hex 32`)     |
| `WORKER_URL`       | `https://<worker-name>.<your-subdomain>.workers.dev` (visible after first deploy) |
| `GEMINI_API_KEY`   | your Gemini API key                                                          |
| `GROQ_API_KEY`     | your Groq API key                                                            |
| `AXIOM_TOKEN`      | an Axiom API token allowed to ingest into the `app-logs` dataset            |

Using GitHub *Environments* (not plain repo secrets) means `dev` and `prod` never
share a `BOT_TOKEN` by accident. (Required-reviewers approval gates on
Environments need a paid GitHub plan on a private repo, which is why prod is
guarded by manual `workflow_dispatch` triggering instead — see
[Promoting a commit to prod](#promoting-a-commit-to-prod).)

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are the same Cloudflare account
for both environments, so those live once as plain **repository** secrets
(Settings → Secrets and variables → Actions), not inside either Environment.

### Multilingual replies

The bot's own reply text (not extracted event content) is translated on demand
based on Telegram's `message.from.language_code`, via `src/translation/translate.ts`.
Translations are cached in a Workers KV namespace (`I18N` binding) keyed by a
hash of the English text + language, so each fixed string is only translated
once per language, ever. Falls back to English on any translation failure.

Users can override the auto-detected language with `/lang <language>` (e.g.
`/lang Persian` or `/lang fa` — free-text names are resolved via Gemini), or
reset to auto-detection with `/lang auto`. The override is stored per chat in
a separate `USER_LANG` KV namespace.

**One-time setup**: create both KV namespaces per environment and put their
IDs in [wrangler.toml](wrangler.toml) (it ships with placeholder IDs):

```bash
npx wrangler kv namespace create I18N --env dev
npx wrangler kv namespace create I18N --env prod
npx wrangler kv namespace create USER_LANG --env dev
npx wrangler kv namespace create USER_LANG --env prod
```

### Message logging

Per the `/start` disclosure ("I may keep your messages to fix bugs"), every
message that goes through event extraction is logged to a `MESSAGE_LOG` KV
namespace by `messageLogger` (`MessageLogger` in `src/logging/messageLogger.ts`,
initialised per request in the handler): the sender's numeric Telegram user id, the message/caption text as received,
what was sent to Gemini, Gemini's response, and the `model` that gave it (null
when no model answered), plus a
`{logger: "messageLogger", time: {date_time_aest}}` header — each entry expires
automatically after **14 days**
(`expirationTtl`). Logging failures are swallowed (best-effort) and never
affect the actual reply.

```bash
npx wrangler kv namespace create MESSAGE_LOG --env dev
npx wrangler kv namespace create MESSAGE_LOG --env prod
```

### Axiom logging

Every log line is sent to the **`app-logs`** dataset in [Axiom](https://axiom.co)
by the generic `Logger` in `src/logging/logger.ts` (dataset, ingest region and service
name: `src/logging/axiomConfig.ts`; the region there is `us-east-1`, change it if your Axiom
org is in another one). There are no direct `console.*` calls in `src/`: everything logs through
a `Logger`, which prints one JSON line to the console (so Workers Logs still has it) and queues
the same event for Axiom.

- The existing loggers — `RouterLog`, `MessageLogger`, `WhitelistPolicyLogger` and
  `UserQuotaPolicyLogger` — each take a `Logger` (default `new Logger("<name>")`).
- Every other call site uses a module-level `new Logger("<name>")`; the name becomes the event's
  `source`. Pass extra structured fields as the second argument (`logger.error("threw", describeError(err))`,
  `logger.info("extracted", { model, tokens })`) rather than gluing them into the message.
  Don't use `message`, `source`, `level`, `seq`, `correlation_id`, `service`, `version` or `_time` as field names;
  they're the event's own keys.
- **A message is a fixed sentence; the data goes in fields.** `"rejected non-whitelisted user"` with
  `userId` and `chatId` fields, never `"rejected non-whitelisted user id 42, chat 7"`. That keeps a
  message groupable and lets you filter on the fields (`where userId == 42`).

**One request = one `correlation_id`.** `runLogSession` (called from the webhook's `fetch`)
generates a UUID per incoming update and keeps it in `AsyncLocalStorage` (the `nodejs_als`
flag in [wrangler.toml](wrangler.toml)), so concurrent requests can't mix ids. Every event of
that request carries it, plus `userId`, `username` (`null` when the user has none) and `chatId` once the update is parsed. Filter one
request's whole story with APL:

```
['app-logs'] | where correlation_id == "<id>" | sort by _time asc, seq asc
```

`_time` is set by the logger when the line is logged (Axiom uses it as the event time; it only
falls back to its own ingest time when an event has none). Workers freeze the clock until the next
I/O, so several lines can share the same `_time`. `seq` is a per-request counter (1, 2, 3, …) that
breaks those ties, so always sort by both.

Events are buffered during the request and sent as one batch after the response
(`ctx.waitUntil`), so logging adds one subrequest per request and no latency. Each event has
`_time`, `seq`, `level`, `source`, `message`, `correlation_id`, `service`, `version` plus any fields
passed to the logger (`model`, `tokens`, `userId`, `username`, …). Strings longer than 10,000 characters
are truncated. Without an `AXIOM_TOKEN` (local runs, tests) nothing is sent; an Axiom
failure is only printed to the console and never affects the reply. Message text
(what users send and what the models return) is included in these logs.

**What gets logged for a request** (all `info` unless noted; success as well as failure):

| `message` | fields | when |
|---|---|---|
| `update received` | `command`, `lang` | start of every update |
| `whitelist check passed` | | sender is whitelisted |
| `rejected non-whitelisted user` (warn) | `userId`, `chatId` | sender is not |
| `quota consumed` | `remainingQuota` | daily quota decremented |
| `daily quota exhausted` (warn) | `userId` | quota used up |
| `available models` / `attempting model` / `model succeeded` | `models`, `model`, `tokens` | router steps (warn/error for rate limited, unavailable, failed) |
| `extracted` | `sourceText`, `event` | event extraction result |
| `message received` | `userId`, `receivedMessage`, `providerRequest`, `providerResponse`, `model` | message log entry |
| `calendar event created` | `recurring`, `allDay` | a calendar file is about to be sent |
| `translation generated` / `translation cache hit` (debug) | `lang`, `model` | reply translation |
| `language override set` / `language override cleared` | `language` | `/lang` |
| `diag check completed` | `check`, `healthy` | `/diag` |
| `reply sent` | `type` (`text`/`document`), `lang`, `filename` | after Telegram accepted the reply |
| `update processed` | `outcome` (`ok`/`error`), `durationMs` | end of every update |

A normal request is roughly 5 to 12 events. Each is also printed to the console, so it counts
towards the Workers Logs limit as well (200,000 lines a day on the free plan, then 1% sampling).

### Viewing and searching logs

Every log line also goes to **Axiom** (see [Axiom logging](#axiom-logging)); the
places below are where each kind lived before that and still do. Logs are in four
places, depending on what they are (dashboard menu names are from memory):

| Log | Where | See it |
|---|---|---|
| User messages (sender, text sent to Gemini, reply) | KV `MESSAGE_LOG`, keys `<timestamp>-<uuid>`, 14-day TTL | `npx wrangler kv key list --binding MESSAGE_LOG --env dev --remote`, then `npx wrangler kv key get --binding MESSAGE_LOG --env dev --remote "<key>"`; or dashboard → Workers KV → the namespace |
| Router steps (`routerLog`) | Workers Logs (console) | dashboard → Workers & Pages → the Worker → Logs; live: `npx wrangler tail --env dev --format pretty` |
| Whitelist rejections (`whitelistPolicyLogger`) | KV `MESSAGE_LOG`, keys `whitelist:<timestamp>-<uuid>`, and Workers Logs | same as above, add `--prefix whitelist:` to the list command |
| Last failure per model | D1 table `gemini_usage` (`lastError`, `lastErrorAest`, `lastSuccessAest`) | `npx wrangler d1 execute noted-it-dev-usage --remote --command "SELECT model, lastErrorAest, lastError, lastSuccessAest FROM gemini_usage"` |

Replace `dev` with `prod` (and the D1 name with `noted-it-prod-usage`) for prod.
Test runs don't write to KV, and their router lines print to your terminal.

**Searching by keyword**

- **Live Worker logs:** `npx wrangler tail --env dev --search "unavailable"`
  shows only console lines containing that text (router lines are JSON, so this
  matches inside `"message"`). Add `--status error` for failed invocations or
  `--format json` to pipe into `jq`. It streams from now on; it doesn't search
  history. For history, use the Logs page in the dashboard, which has a search
  box and filters.
- **KV has no search.** It can only list keys by prefix. To search entry
  contents, fetch and grep them (fine for a few hundred entries, slow beyond):

  ```bash
  npx wrangler kv key list --binding MESSAGE_LOG --env dev --remote \
    | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8")).forEach(k=>console.log(k.name))' \
    | xargs -P 8 -I{} sh -c 'npx wrangler kv key get --binding MESSAGE_LOG --env dev --remote "{}"; echo' \
    | grep -i "keyword"
  ```

- **D1 is real SQL**, so use `LIKE`:
  `npx wrangler d1 execute noted-it-dev-usage --remote --command "SELECT model, lastErrorAest, lastError FROM gemini_usage WHERE lastError LIKE '%503%'"`

### Gemini quota tracking

Gemini enforces per-model quotas on the free tier, so usage is counted per model
and the next model with headroom is picked. **Status:** wired into event
extraction, `/diag`, reply translation and `/lang` resolution.

- **Daily window = Pacific time.** Google's rate-limits page states: "Requests
  per day (RPD) quotas reset at midnight Pacific time." The day key is the
  `America/Los_Angeles` calendar date (`src/quotaLimit/quotaWindows.ts`), so daylight
  saving is handled by the named zone. Do not switch this to UTC or local time.
- **Per project, not per key.** Google applies limits per project, so extra keys
  in the same project add no capacity. Quotas are per model, so each model is
  tracked separately.
- **Per-minute window is assumed fixed.** Google's page doesn't say whether RPM
  is fixed or rolling; counters use the UTC minute. A 429 from Gemini is the
  correction if the assumption drifts.
- **Storage:** one row per model in a `gemini_usage` table in a Cloudflare **D1**
  database (`model`, `day`, `minute`, `aestTime`, `rpm`, `tpm`, `rpd`, `lastError`,
  `lastErrorAest`, `lastSuccessAest`, all `NOT NULL`; `aestTime` is the last usage write in Australian
  Eastern time, to the second; `lastError` / `lastErrorAest` are the model's most
  recent failure and when it happened, empty until it fails and replaced only by
  the next failure; `lastSuccessAest` is the time of its last successful call, so
  an error older than that is stale and the model has recovered). Stale windows reset
  lazily on the next write; a model with no row counts as zero usage. The table
  is created on first use (each query is batched with
  `CREATE TABLE IF NOT EXISTS`, `src/db/schema/geminiUsageTable.ts`); all SQL:
  `src/db/sql/geminiUsage.ts`.
- **Where it runs.** The bot code talks to the `Router` (`src/router/router.ts`)
  and never to Gemini. Its one public method is
  `generate({systemPrompt?, userPrompt, temperature?, responseSchema?})`.
  `telegramWebhook.ts` builds it once with `createRouter(env)` (in
  `src/router/router.ts`) and passes it into `updateHandler`, which hands it to
  `extractEvent(router, text)` and `/diag`. The router is built from a logger and
  a list of **metered providers**, each a pair: a **provider client**
  (`GeminiClient`, `src/providers/gemini/geminiClient.ts`) that makes one call
  to one model (endpoint, request body, response parsing), and a **usage
  repository** (`src/repositories/geminiUsageRepository.ts`, D1 binding
  `USAGE_DB`) that says which of its models are still available and stores
  usage and errors. The router owns the loop: it tries a provider's available
  models in order, then moves on to the next provider (today two, Gemini then
  Groq, in `createRouter`; adding another means adding one more
  `{providerClient, usageRepository}` pair there). Groq's repository
  (`src/repositories/groqUsageRepository.ts`, table `groq_usage`) tracks only
  when to try again: a 429's `retry-after` marks that model unavailable until then. A failure only skips the model that failed and is saved on its
  row, so one retired or broken model can't block the rest; the exception is a 401/403, where the key is
  bad for every model, so the router abandons that provider and moves on to the
  next one.
  D1 calls are async, so `generate` is too. Each upsert
  is a single atomic statement. The D1 binding is in [wrangler.toml](wrangler.toml)
  for both envs; **create the databases and paste their ids over the placeholder
  `database_id`s:**

  ```bash
  npx wrangler d1 create noted-it-dev-usage
  npx wrangler d1 create noted-it-prod-usage
  ```
- **Result type.** `generate` returns `{result: "ok", text, totalTokens}` or
  `{result: "failed", failure}`, where `failure` is `{kind, httpStatus?, detail}`
  (a `rateLimited` failure also carries `quotaLimitScope`: `minute` or `day`). `kind` says
  what went wrong: `rateLimited` (a 429, or no model under its limits),
  `unavailable` (503), `badRequest` (other 4xx), `unauthorized` (401/403),
  `serverError` (other 5xx), `emptyResponse` (200 with no text, e.g. a safety
  block) or `internal`. When the models run out it is the kind of the last
  attempt. The Gemini parser (`src/providers/gemini/geminiResponse.ts`) produces this
  same type directly. `extractEvent` passes the failure on in its result and
  logs it; `/diag` shows it (`Gemini: Broken (unauthorized)`).
- **Flow: pick, call, record.** `router.pickAvailableModels()` lists the models under
  their caps (registry order); the `Router` loops through them. On success,
  `recordUsage` bumps `rpm` and `rpd` by 1 and adds the response's
  `usageMetadata.totalTokenCount` to `tpm`, in one upsert. On a 429,
  `markQuotaExhausted` sets `rpd` (per-day quota) or `rpm` (otherwise) to its
  cap so the model is skipped, and the loop moves to the next model. A 503
  (`UNAVAILABLE`, "high demand") is a capacity error, not a quota: it is logged
  and the loop moves to the next model without touching the row. A call that
  gets no answer within 12 seconds (`GeminiClient`'s timeout) is treated the same
  way, so one stalled model can't hold up a request. Any other
  failure (other 5xx, 4xx, empty 200) stops the loop and fails the request. Only
  a 429 touches the row. Nothing is reserved up front, so two simultaneous requests can both take
  the last free slot; the 429 corrects that. Gemini responses are parsed by
  `src/providers/gemini/geminiResponse.ts`.
- **Logging.** Two places, nothing that grows:
  - **Workers Logs.** `RouterLog` (`src/router/routerLog.ts`) writes every routing
    step (available models, attempting, succeeded, rate limited, unavailable,
    failed, no model succeeded) as one JSON line via `console`, e.g.
    `{"level":"info","source":"routerLog","message":"model succeeded","correlation_id":"…","model":"gemini-3.1-flash-lite","tokens":812}`
    (`warn` for rate limited/unavailable, `error` for failures). Observability is
    on in [wrangler.toml](wrangler.toml); search them in the dashboard under the
    Worker's Logs. Retention is short on the free plan, and test runs log to your
    terminal, not the dashboard.
  - **Last error per model.** A rate limit, 503 or other failure is also saved on
    that model's `gemini_usage` row (`lastError`, `lastErrorAest`), e.g.
    `unavailable (HTTP 503): UNAVAILABLE: This model is currently experiencing high demand…`.
    Only the latest failure is kept, and it isn't cleared by a success: a later `lastSuccessAest` means the model has recovered: `npx wrangler d1 execute noted-it-dev-usage --remote --command "SELECT model, lastErrorAest, lastError FROM gemini_usage"`.
- **Caps** live in `src/providers/registry.ts` (`limits`), copied from the
  AI Studio free-tier usage table. Try order is registry order.
- **Verification:** `tests/integration/extractEvent.test.ts` runs a table of
  messages through the real router and Gemini: a failed model (429, 503, 404…)
  moves on to the next one, and the test fails only if no model answers. `tests/unit/geminiResponse.test.ts` checks the
  parser against a real captured 503 (`tests/unit/fixtures/gemini503Unavailable.ts`).

### Access control (whitelist)

The bot is invite-only: `whitelistPolicy.isWhiteListed` in `src/policy/whitelistPolicy.ts` (its D1 and KV bindings are set once per request by `whitelistPolicy.init`) checks the sender's numeric Telegram user id against the `whitelist` table in the `USAGE_DB` D1 database before processing anything (including `/start`) —
a non-whitelisted user gets a polite rejection message instead. **The one
exception is `/lang`**, which works for everyone regardless of whitelist
status, so even a rejected user can set their preferred language and get
the rejection message itself back in it. There's no admin command for
whitelisting; entries are added manually. The table has one column, `userId`
(`INTEGER PRIMARY KEY`), and is created on first use like the other tables
(`src/db/sql/whitelist.ts`, `src/repositories/whitelistRepository.ts`). The bot's own rejection
message includes the user's id, so it can be relayed to you.

```bash
# Add one user (creating the table first if the bot hasn't run yet).
# --remote is required — d1 commands default to a LOCAL simulated database,
# which silently does nothing to the real deployed bot.
npx wrangler d1 execute noted-it-dev-usage --remote --command "CREATE TABLE IF NOT EXISTS whitelist (userId INTEGER NOT NULL PRIMARY KEY); INSERT OR IGNORE INTO whitelist (userId) VALUES (123456789)"

# Remove one user, or list everyone:
npx wrangler d1 execute noted-it-dev-usage --remote --command "DELETE FROM whitelist WHERE userId = 123456789"
npx wrangler d1 execute noted-it-dev-usage --remote --command "SELECT userId FROM whitelist"
```

The whitelist used to live in a `WHITELIST` KV namespace (plain numeric-id keys), and
that binding has been removed. To copy the old entries over, find the namespace id
with `npx wrangler kv namespace list`, then (needs `jq`; entries keyed by a username
instead of a numeric id are skipped, since they can't be matched any more):

```bash
npx wrangler kv key list --namespace-id <WHITELIST_NAMESPACE_ID> --remote \
  | jq -r '"CREATE TABLE IF NOT EXISTS whitelist (userId INTEGER NOT NULL PRIMARY KEY);", (.[].name | select(test("^[0-9]+$")) | "INSERT OR IGNORE INTO whitelist (userId) VALUES (\(.));")' > whitelist.sql
npx wrangler d1 execute noted-it-dev-usage --remote --file whitelist.sql   # and noted-it-prod-usage for prod
```

Rejections are logged by `whitelistPolicy.logger`
(`WhitelistPolicyLogger` in `src/policy/whitelistPolicyLogger.ts`) to `MESSAGE_LOG` under
`whitelist:<timestamp>-<uuid>` (14-day TTL), as
`{"logger":"whitelistPolicyLogger","time":{"date_time_aest":"2026-09-25 14:51:39"},"message":"rejected non-whitelisted user id 42, chat 7"}`.

### Rolling back

Cloudflare keeps a history of every deployment per Worker — the fastest revert is
`npx wrangler rollback --env dev` (or `--env prod`), which instantly swaps the live
Worker back to its previous deployment without going through CI. To redeploy an
older *tagged* prod version from source instead, use the manual dispatch flow in
[Promoting a commit to prod](#promoting-a-commit-to-prod), picking that older tag.
