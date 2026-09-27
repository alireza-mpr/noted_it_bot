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
| `/tz`         | Set your time zone on a web page the bot links to (a button that works for 1 minute); an exact zone name typed after it (`/tz Asia/Tehran`) is applied directly. Doesn't use up daily quota |
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
the shared pieces (quota policy, message logger), builds the router and the
Telegram client, and hands the update to `updateHandler`. The rest of the Telegram
code sits next to it in `src/telegram/`:

- `messageHandlers/updateHandler.ts` is the flow for one update: `updateHandler` reads it and works
  out the reply language, then `handleMessage` dispatches: a
  command (a plain `if` per command, so that is where a new one is added), or,
  for anything else, event extraction via Gemini, behind the
  [daily quota](#access-and-daily-quota). `updateHandler` never throws;
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

The dev D1 database is a **remote binding** (`remote = true` in
[wrangler.toml](wrangler.toml)), so a test run reads and writes the real dev
database — locally exactly as in CI. The one exception is `TEST_DB`, a local-only D1 declared in
`vitest.config.ts`, which the repository tests use to run real SQL without touching dev. Everything comes from environment
variables, the same three CI sets:

```bash
export GEMINI_API_KEY=...          # from the dev environment's secrets
export GROQ_API_KEY=...            # optional: lets the router reach Groq in the tests
export CLOUDFLARE_API_TOKEN=...    # needs D1: Edit
export CLOUDFLARE_ACCOUNT_ID=...
npm ci && npm run typecheck && npm test
```

`vitest.config.ts` takes `GEMINI_API_KEY` and `GROQ_API_KEY` from the environment, or else from your local
`secrets/dev.json` (so you don't have to export them), and fails fast if `GEMINI_API_KEY` is missing. Runs are slower
than a simulated setup (every D1 call is a network round trip) and leave usage
rows in the dev `gemini_usage` table. To run only the offline tests:
`npx vitest run tests/unit`.

## CI/CD

- `.github/workflows/ci.yml` — two jobs, on every push (the PR run stops after `build`):
  - `build` installs deps, typechecks, and runs the test suite (real Gemini API,
    real dev D1 via a remote binding; needs `GEMINI_API_KEY`, `GROQ_API_KEY`,
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

The bot speaks a **fixed list of languages**: English plus `fa ar es fr de it pt ru tr zh ja ko hi nl pl`
(`SUPPORTED_LANGUAGES` in `src/translation/language.ts`). Anything else falls back to English. The
language is the user's `/lang` choice if they made one, else Telegram's `message.from.language_code`
(`pt-BR` becomes `pt`, and so on).

Every fixed message is translated **ahead of time**: `src/translation/translations/<lang>.json`, one file
per language, maps each message id (`START_MESSAGE`, `TZ_LINK_MESSAGE`, …) to its translation; the English
is the `MESSAGES` object in `src/interactiveMessages/messages.ts`. Code refers to messages only by id, typed as
`MessageId`, so a message that isn't in the catalog doesn't compile. `translateStatic`
(`src/translation/translate.ts`) looks the id up, so no reply calls a model to be translated, and an
abuser can't run up the LLM quota by trying languages. The recurrence line under an event ("Repeats every 2 weeks on Monday and Wednesday, until Jan 5, 2027") is
event content, like the title and location, not one of the bot's own messages, so it is **not translated**:
`describeRecurrence` (`src/extractedEvents/recurrence.ts`) always writes it in English. It is the readable
copy of the repeat rule, which the `.ics` file carries exactly, for someone setting the repeat by hand on a phone.

**Changing a message.** Edit the English in `src/interactiveMessages/messages.ts`, then update the value under
the same id in all 15 JSON files. Nothing forces this: the old translations keep being served until you do, so
remember to change them in the same commit. **Adding a message** means a new id in `MESSAGES` and in every JSON
file. `tests/unit/translations.test.ts` fails until every language has every id, no stale id is left behind,
and each translation still has the
same `{0}` placeholders, HTML tags, emoji and `/lang` / `/tz` command names as the English. **Adding a
language** means adding its code to `SUPPORTED_LANGUAGES`, a JSON file, and its import in
`src/translation/translations/index.ts`. The translations were written by an AI assistant and haven't been
reviewed by native speakers.

Users can override the auto-detected language with `/lang <language>`: a code (`fa`, `pt-BR`), the English name
(`Persian`) or the language's own name (`فارسی`, `Deutsch`), matched locally with no model call (see
`resolveLanguage`). An unsupported language gets a reply listing the supported ones. `/lang auto` resets it. The override is stored per user in the
`user_preference` table of the `USAGE_DB` D1 database (`src/db/sql/userPreference.ts`,
`src/repositories/userPreferenceRepository.ts`): `userId` (primary key), `lang` (`NULL` means
auto-detect; `/lang auto` calls `setLang(userId, null)`) and `timezone` (set by `/tz` through
`setTimezone`; `NULL` until the user picks one). Both are read in one query at the start of every update.
The table is created on first use like the others.

**Which time zone an event uses.** In order: a zone the message states or implies (the model's
`timezone_hint`); otherwise the user's `/tz` choice; otherwise none: the times are written **floating** (no `TZID`
in the `.ics`, and local times with no `ctz` in the Google link), so every calendar shows them as written in its
own zone. In the last two cases the caption says so and points to `/tz` (`TZ_USER_NOTE` / `TZ_FLOATING_NOTE`);
all-day events get no note, since their date doesn't depend on a zone. "Today" (for picking a missing year and the
past-date note) still needs a zone: the one above, or `appConfig.defaultTimezone` (`UTC`, in
[appConfig.ts](src/appConfig/appConfig.ts)) for floating times.

`timezone` used to be `NOT NULL`, with `/lang` filling in the default. SQLite can't loosen that constraint in
place, so an existing table is rebuilt once (the data is copied unchanged; a stored `UTC` behaves the same as
`NULL` while the default is `UTC`). Run it **before** deploying code that writes `NULL`:

```bash
npx wrangler d1 execute noted-it-dev-usage --remote --env dev --command "CREATE TABLE user_preference_new (userId INTEGER NOT NULL PRIMARY KEY, lang TEXT, timezone TEXT); INSERT INTO user_preference_new (userId, lang, timezone) SELECT userId, lang, timezone FROM user_preference; DROP TABLE user_preference; ALTER TABLE user_preference_new RENAME TO user_preference;"
# and noted-it-prod-usage --env prod for prod
```

### Setting the time zone (`/tz`)

Guessing a zone from a typed place name was unreliable (a country can span several zones), so `/tz`
uses a small web page instead, served by the Worker itself, with no model involved:

1. `/tz` replies with a button linking to `https://<worker>/tz?token=…`. The link's origin is taken from
   the request Telegram made, so there is no URL to configure.
2. The page (`src/web/tzPage.ts`, markup in `src/web/tzPage.html`) reads the device's zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
   and shows it with the local time there and a **Yes, use this time zone** button, or a searchable list of every
   zone (`Intl.supportedValuesOf('timeZone')`) to pick a different one. Zone names only cover one city each, so the
   search also matches each zone's plain-language name in the user's language ("Eastern Time", from `Intl`), and a
   list of well-known cities in English (`src/web/tzCities.ts`: "Washington" finds America/New_York). It ignores
   case and accents, and ranks exact matches first. It's in the user's language, right-to-left
   for Persian and Arabic.
3. Saving `POST`s to `/tz/save`, which validates the zone with `Intl`, stores it in `user_preference.timezone`, and
   sends the confirmation to the chat.

An exact zone name typed after the command (`/tz asia/tehran`) is applied directly without the page; any other text
just gets the link. `/tz` doesn't use up daily quota (there's no model call).

**Who is asking.** The page and endpoint learn the user from a signed token, never from anything the browser
sends (`src/web/tzToken.ts`): `base64url(payload).base64url(HMAC-SHA256)`, keyed by `WEBHOOK_SECRET` with a domain
prefix, so no new secret is needed. The payload is `{uid, username, firstName, lang, purpose, exp}`; `username` and `firstName` are only there so the page's logs name the user. There are two tokens: the **link**
(`purpose: "open"`) is valid for **1 minute**; opening it returns the page with a separate **save** token
(`purpose: "save"`, **10 minutes**), so a leaked link is useless after a minute, but someone searching the list isn't cut
off. Neither can be used for the other's job, tampering is detected, and a token must be spelled exactly as it was
signed. Requests with a missing, forged, expired or wrong-purpose token get a `403` and touch neither D1 nor Telegram.
The page is served with a per-response CSP nonce, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and no
framing. A save token can be reused until it expires, which lets a user change only their own row.

**Testing it.** `tests/unit/tzToken.test.ts`, `tzRoutes.test.ts` and `tzCommand.test.ts` cover the tokens, both routes
and the command. To see the real page, run `npx wrangler dev`, send `/tz` to the bot and open the link.

The recurrence sentences used to be translated by a model and cached in an `I18N` KV namespace; that
binding has been removed, and the namespaces can be deleted (`npx wrangler kv namespace list`, then
`npx wrangler kv namespace delete --namespace-id <id>`).

The language override used to live in a `USER_LANG` KV namespace, keyed `chat:<chatId>`; that
binding has been removed. For private chats the chat id is the user id, so the old entries can be
copied over (needs `jq`; group chats, whose ids are negative, and anything that isn't a valid
language code are skipped). Find the namespace id with `npx wrangler kv namespace list`:

```bash
NS=<USER_LANG_NAMESPACE_ID>
{
  echo "CREATE TABLE IF NOT EXISTS user_preference (userId INTEGER NOT NULL PRIMARY KEY, lang TEXT, timezone TEXT);"
  npx wrangler kv key list --namespace-id "$NS" --remote | jq -r '.[].name | select(test("^chat:[0-9]+$"))' | while read -r key; do
    lang=$(npx wrangler kv key get --namespace-id "$NS" --remote "$key")
    if [[ "$lang" =~ ^[a-z]{2,3}(-[A-Z]{2})?$ ]]; then
      echo "INSERT INTO user_preference (userId, lang, timezone) VALUES (${key#chat:}, '$lang', NULL) ON CONFLICT(userId) DO UPDATE SET lang = excluded.lang;"
    fi
  done
} > user_preference.sql
npx wrangler d1 execute noted-it-dev-usage --remote --file user_preference.sql   # and noted-it-prod-usage for prod
```

### Message logging

Per the `/start` disclosure ("I may keep your messages to fix bugs"), every message that goes through event
extraction is logged to Axiom as a `provider response received` event: the text as received
(`receivedMessage`), the model's answer (`providerResponse`) and the `model` that gave it (null when no model
answered), plus the request's `userId`, `username` and `firstName`. There is no separate store for messages; they are kept
as long as the Axiom dataset keeps its data.

### User activity

What a user does is logged as one `user activity` event with an `activity` field
(`src/logging/activityLog.ts`), next to the request's `userId`, `username`, `firstName` and `chatId`:

| `activity` | extra fields | when |
|---|---|---|
| `start`, `ver`, `diag` | | the command was sent |
| `lang_set` / `lang_reset` | `language` | `/lang <language>` / `/lang auto` |
| `tz_link_sent`, `tz_page_opened` | | `/tz` without an exact zone, then the link opened |
| `tz_set` | `timezone`, `via` (`command`/`page`) | a time zone was saved |
| `event_requested` | `outcome` (`created`, `declined`, `no_event`, `no_model`, `no_text`); `recurring`, `allDay` when created | a message went to event extraction |
| `quota_exhausted` | | a message was refused for quota |
| `bot_blocked` | `via` (`membership`, or `send_refused` when Telegram refused a send with 403 "blocked") | the user blocked the bot |
| `bot_unblocked` | | the user unblocked or restarted the bot |

Blocking reaches the bot as a `my_chat_member` update (status `kicked`, then `member` on unblock). A user who
deletes the chat without blocking sends nothing, so that can't be seen.

```
['app-logs'] | where message == "user activity" and userId == 42 | sort by _time asc
['app-logs'] | where activity == "bot_blocked" | summarize count() by bin(_time, 1d)
```

The `/tz` page and `/tz/save` are separate web requests; their events get `userId`, `username` and `firstName` from the
signed token (see [Setting the time zone](#setting-the-time-zone-tz)).

### Axiom logging

Every log line is sent to the **`app-logs`** dataset in [Axiom](https://axiom.co)
by the generic `Logger` in `src/logging/logger.ts` (dataset, ingest region and service
name: `src/logging/axiomConfig.ts`; the region there is `us-east-1`, change it if your Axiom
org is in another one). There are no direct `console.*` calls in `src/`: everything logs through
a `Logger`, which prints one JSON line to the console (so Workers Logs still has it) and queues
the same event for Axiom.

- The existing loggers — `RouterLog` and
  `UserQuotaPolicyLogger` — each take a `Logger` (default `new Logger("<name>")`).
- Every other call site uses a module-level `new Logger("<name>")`; the name becomes the event's
  `source`. Pass extra structured fields as the second argument (`logger.error("threw", describeError(err))`,
  `logger.info("extracted", { model, tokens })`) rather than gluing them into the message.
  Don't use `message`, `source`, `level`, `seq`, `correlation_id`, `service`, `version` or `_time` as field names;
  they're the event's own keys.
- **A message is a fixed sentence; the data goes in fields.** `"daily quota exhausted"` with
  a `userId` field, never `"daily quota exhausted for user 42"`. That keeps a
  message groupable and lets you filter on the fields (`where userId == 42`).

**One request = one `correlation_id`.** `runLogSession` (called from the webhook's `fetch`)
generates a UUID per incoming update and keeps it in `AsyncLocalStorage` (the `nodejs_als`
flag in [wrangler.toml](wrangler.toml)), so concurrent requests can't mix ids. Every event of
that request carries it, plus `userId`, `username` (`null` when the user has none; Telegram usernames are optional), `firstName` (every account has one) and `chatId` once the update is parsed. Filter one
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
passed to the logger (`model`, `tokens`, `userId`, `username`, `firstName`, …). Strings longer than 10,000 characters
are truncated. Without an `AXIOM_TOKEN` (local runs, tests) nothing is sent; an Axiom
failure is only printed to the console and never affects the reply. Message text
(what users send and what the models return) is included in these logs.

**What gets logged for a request** (all `info` unless noted; success as well as failure):

| `message` | fields | when |
|---|---|---|
| `update received` | `command`, `lang` | start of every update |
| `quota consumed` | `remainingQuota` | daily quota decremented |
| `daily quota exhausted` (warn) | `userId` | quota used up |
| `quota refunded` | `remainingQuota` | no model answered, so the unit was given back |
| `available models` / `attempting model` / `model succeeded` | `models`, `model`, `tokens` | router steps (warn/error for rate limited, unavailable, failed) |
| `extracted` | `sourceText`, `event` | event extraction result |
| `provider response received` | `receivedMessage`, `providerResponse`, `model` | message log entry |
| `user activity` | `activity`, … | see [User activity](#user-activity) |
| `translation generated` / `translation cache hit` (debug) | `lang`, `model` | reply translation |
| `diag check completed` | `check`, `healthy` | `/diag` |
| `reply sent` | `type` (`text`/`document`), `lang`, `filename` | after the reply was sent |
| `telegram send failed` (warn) | `method`, `status`, `description` | Telegram refused a reply (other than a block) |
| `update processed` | `outcome` (`ok`/`error`), `durationMs` | end of every update |

A normal request is roughly 5 to 12 events. Each is also printed to the console, so it counts
towards the Workers Logs limit as well (200,000 lines a day on the free plan, then 1% sampling).

### Viewing and searching logs

Every log line also goes to **Axiom** (see [Axiom logging](#axiom-logging)); the
places below are where some of them can also be seen (dashboard menu names are from memory):

| Log | Where | See it |
|---|---|---|
| Router steps (`routerLog`) | Workers Logs (console) | dashboard → Workers & Pages → the Worker → Logs; live: `npx wrangler tail --env dev --format pretty` |
| Last failure per model | D1 table `gemini_usage` (`lastError`, `lastErrorAest`, `lastSuccessAest`) | `npx wrangler d1 execute noted-it-dev-usage --remote --command "SELECT model, lastErrorAest, lastError, lastSuccessAest FROM gemini_usage"` |

Replace `dev` with `prod` (and the D1 name with `noted-it-prod-usage`) for prod.
Test runs don't send to Axiom, and their router lines print to your terminal.

**Searching by keyword**

- **Live Worker logs:** `npx wrangler tail --env dev --search "unavailable"`
  shows only console lines containing that text (router lines are JSON, so this
  matches inside `"message"`). Add `--status error` for failed invocations or
  `--format json` to pipe into `jq`. It streams from now on; it doesn't search
  history. For history, use the Logs page in the dashboard, which has a search
  box and filters.
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

### Access and daily quota

The bot is open to everyone. What limits abuse is the per-user daily quota: only a message that goes to a model
uses a unit, and the unit is given back if no model answers. Commands never use quota. How it works, and what each
kind of message costs in D1 rows, is in [docs/USER_QUOTA_DESIGN.md](docs/USER_QUOTA_DESIGN.md).

### Rolling back

Cloudflare keeps a history of every deployment per Worker — the fastest revert is
`npx wrangler rollback --env dev` (or `--env prod`), which instantly swaps the live
Worker back to its previous deployment without going through CI. To redeploy an
older *tagged* prod version from source instead, use the manual dispatch flow in
[Promoting a commit to prod](#promoting-a-commit-to-prod), picking that older tag.
