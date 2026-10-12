# Development and operations

How to run, test, deploy and debug Noted. What the bot does is in
[PRODUCT.md](PRODUCT.md); the other docs are listed in the
[README](../README.md#docs).

## Bots and environments

One code base runs two **bot editions**, English and Persian (ADR-10). Each
edition is its own Worker, with its own bot, `/` menu and secrets.
`BOT_EDITION` in [wrangler.toml](../wrangler.toml) tells a Worker which edition it
runs. The editions of a stage share its Cloudflare account and D1 database.

| Environment | Edition | Bot | Worker | Deploys |
|---|---|---|---|---|
| `dev` | english | `@noted_it_dev_bot` | `noted-it-dev-bot` | on every push to `main` |
| `dev-fa` | persian | `@noted_it_dev_fa_bot` | `noted-it-dev-fa-bot` | on every push to `main` |
| `prod` | english | `@noted_it_bot` | `prod` | by hand, from a `v…` tag |
| `prod-fa` | persian | `@noted_it_fa_bot` | `prod-fa` | together with `prod` |

Dev and prod use different Cloudflare accounts.

## How a request flows

Telegram calls the Worker's URL (a webhook) for every update. There is no
polling and no server that runs all the time.

1. **`src/app/worker.ts`** starts one log session per request. `GET /tz` and
   `POST /tz/save` go to the time zone page. Any other `POST` is the webhook:
   a wrong secret gets 401, everything else gets 200 (ADR-8).
2. **`src/app/handle-update.ts`** handles one update: a message, a block or
   unblock, or something the bot ignores. For a message, it loads the user,
   picks the reply language, then runs the command
   (`src/app/commands/`, one file each) or creates the event. It never throws:
   a failure gets a general error reply.
3. **`src/app/create-event-from-message.ts`** takes a quota unit, asks the
   model, creates the calendar event and replies. It gives the unit back when
   no model answers.
4. **`src/app/update-user.ts`** loads and saves a user, and tries again when
   two updates race (ADR-3).

The rest of `src/` follows one rule: pure rules in `domain/` and `output/`,
input and output only in `adapters/`, and `app/` connects them
([CODE_STRUCTURE.md](CODE_STRUCTURE.md)).

## Local dev

```bash
npm install
npx wrangler secret put BOT_TOKEN --env dev      # the dev bot token, from secrets/dev.json
npx wrangler secret put WEBHOOK_SECRET --env dev # any random string
npx wrangler secret put GEMINI_API_KEY --env dev
npx wrangler secret put GROQ_API_KEY --env dev
npx wrangler secret put AXIOM_TOKEN --env dev    # optional: without it, logs only print to the console
npx wrangler dev --env dev
```

`wrangler dev` gives you a URL. Point the Telegram webhook at it **with the
secret token**:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=<your dev URL>" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

A `setWebhook` call without `secret_token` clears Telegram's secret, and then
every webhook call fails with 401.

## Tests

| Kind | Where | Run |
|---|---|---|
| Offline unit tests | `tests/unit/`, in the same folders as `src/` | `npx vitest run tests/unit` |
| Live tests: real messages through the real router and models | `tests/integration/extract-draft.test.ts` (English) and `extract-draft.fa.test.ts` (Persian) | part of `npm test` |
| Manual: fills the Gemini quota on purpose, to check that the router moves on | `tests/manual/quota-fill.test.ts` | `npm run test:quota-fill` (never in CI) |

- All tests run inside the Workers runtime (`@cloudflare/vitest-plugin`).
- **Tests of Persian messages go in `*.fa.test.ts` files,** next to the
  English ones (e.g. `create-calendar-event.fa.test.ts`). Their shared helpers
  are in plain `.ts` files beside them (e.g. `create-at.ts`,
  `send-message.ts`, `expect-extraction.ts`). To run only the Persian tests:
  `npx vitest run fa.test --exclude "tests/integration/**"` (offline), or
  `npx vitest run fa.test` (the live ones too, which use the quota).
- `tests/unit/code-structure.test.ts` checks the import rule and the file name
  casing.
- The live tests check only the fields they list (`toMatchObject`). When a
  model fails, the router moves on, so the test still passes if a later model
  answers well.
- **The live tests use the dev Gemini quota, which the dev bot shares.** A run
  makes about 22 calls, one of them from the strong models' small budget (the
  escalation test). Frequent runs push requests to later, sometimes weaker
  models. To run one case: `npx vitest run tests/integration -t "<part of the
  message>"`.

**Databases in tests:** the dev D1 database is a remote binding
(`remote = true` in `wrangler.toml`), so tests that use it read and write the
real dev database. `TEST_DB`, a local D1 declared in `vitest.config.ts`, lets
the database tests run real SQL without touching dev.

**To run all tests**, set what CI sets:

```bash
export GEMINI_API_KEY=...          # from the dev environment's secrets
export GROQ_API_KEY=...            # optional: lets the router reach Groq
export CLOUDFLARE_API_TOKEN=...    # needs D1: Edit
export CLOUDFLARE_ACCOUNT_ID=...
npm ci && npm run typecheck && npm test
```

`vitest.config.ts` also reads `GEMINI_API_KEY` and `GROQ_API_KEY` from your
local `secrets/dev.json`, and stops at once if `GEMINI_API_KEY` is missing.

## CI/CD

**`.github/workflows/ci.yml`** runs on every push:

1. **`build`:** installs, typechecks, runs the offline tests, then the live
   tests. A pull request runs only this job.
2. **`deploy-dev`:** only when `build` passes, and only on `main`. Each dev
   edition deploys as its own job, so a wrong secret fails only its own
   edition, with Telegram's or Cloudflare's error in the log.
3. **`tag-dev`:** after both editions deployed, tags the commit with the
   version that `/ver` shows, e.g. `v1.0.135-6fb8240`.

**When the dev Gemini quota is used up:**
- Run CI by hand on `main` (Actions → CI → Run workflow) and tick **Skip the
  integration tests**. The typecheck and offline tests still run and must
  pass.
- Add `[skip ci]` to the commit message, so the push starts no run. Otherwise
  the push run uses the quota, or shows ❌ on the commit if you cancel it.
- A docs-only commit can also use `[skip ci]`: it needs no deploy.

**Every deploy** (dev and prod) deploys the edition's Worker with `wrangler`,
points the bot's webhook at it, and sets:
- the `/` menu, from `.github/bot-menus/<edition>.json`;
- the name, description and short description, from
  `.github/bot-profiles/<edition>.json`. The file holds the prod name; dev adds
  " - Dev". Each is sent only when it changed, because Telegram rate-limits
  these calls.

### Deploy to prod

**`.github/workflows/deploy.yml` never runs by itself.** The guard is a
deliberate manual start, from a tag. (GitHub's "required reviewers" are free
now that the repo is public; see the backlog.)

1. Let `deploy-dev` check what is on `main`.
2. **Check for database changes.** If the release needs a D1 change, make it
   on prod first. Once, `/lang` failed on prod because an old column there was
   still `NOT NULL`.
3. Pick the tag: every dev deploy has one (`v1.0.N-<commit>`).
4. Run it, for both prod editions:
   ```bash
   gh workflow run Deploy --ref v1.0.135-6fb8240
   ```
   Or: Actions → Deploy → Run workflow, and pick the tag (not `main`).
5. Move the "Unreleased" lines in [CHANGELOG.md](../CHANGELOG.md) under the new
   release.

**To roll back:** `npx wrangler rollback --env prod` (and `--env prod-fa`)
switches a Worker back to its previous deploy at once. Or deploy an older tag.

### Secrets

**Locally:** `secrets/dev.json` and `secrets/prod.json`, ignored by git.

**In CI:** in the GitHub Environments `dev`, `dev-fa`, `prod` and `prod-fa`
(Settings → Environments). Each has its own copy of every secret, so dev and
prod can never share a `BOT_TOKEN` by mistake.

| Secret | Value |
|---|---|
| `BOT_TOKEN` | the bot's token, in `secrets/{dev,prod}.json`; one per edition |
| `WEBHOOK_SECRET` | a random string, one per edition (e.g. `openssl rand -hex 32`). It also signs the `/tz` links. |
| `WORKER_URL` | `https://<worker-name>.<your-subdomain>.workers.dev`; one per edition |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | the model keys |
| `AXIOM_TOKEN` | an Axiom token that can write to the `app-logs` dataset |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | the stage's Cloudflare account |

The editions of a stage share the values of the last four rows. To separate an
edition later, give it its own values (ADR-10).

## Storage (D1)

One D1 database per stage (binding `USAGE_DB`): `noted-it-dev-usage` and
`noted-it-prod-usage`. Each table is created on first use: every query runs
together with its `CREATE TABLE IF NOT EXISTS`.

| Table | One row per | What it holds | Code |
|---|---|---|---|
| `users` | user | The Telegram profile (username, first and last name, app language), the chosen language and time zone, the quota usage, and a `version` for races (ADR-3) | `src/adapters/database/d1-user-repository.ts` |
| `gemini_usage` | Gemini model | Requests and tokens this minute, requests today, the last error and the last success | `src/adapters/database/d1-counted-model-usage-store.ts` |
| `groq_usage` | Groq model | When the model can be tried again, Groq's daily request count, the last error and the last success | `src/adapters/database/d1-retry-after-model-usage-store.ts` |

- In `users`, `NULL` means "not chosen" (language, time zone) or "never used"
  (quota). What a user did, and when, is in the logs.
- `*Aest` columns are Australian Eastern times, for reading by hand.

## Models and routing

The free Gemini plan has small limits per model. So the bot counts each
model's usage, and tries the next model that still has room (ADR-4).

- Everything calls `Router.ask` (`src/adapters/models/router.ts`), never a
  provider directly.
- The router tries Gemini's models in order, then Groq's. The models, their
  tier ("light" or "strong"), limits and order are in
  `src/adapters/models/providers/model-list.ts`.
- Only `src/adapters/models/providers/` knows the names Gemini and Groq.
- **Escalation** (`extractDraft`): when a light model's draft has a confidence
  below `APP_CONFIG.escalateBelowConfidence` (0.7), the message is asked again
  of strong models only (`RouteOptions.onlyTier`). Their usable answer is
  used, even if it is unsure too; with no usable strong answer, the first one
  is kept. Each escalation logs `extraction.escalated`.

| Result | What the router does |
|---|---|
| An answer | Records the usage, and returns the answer |
| 429 (rate limit) | Marks the model as used up for the minute or the day (Groq: until its `retry-after`, else 60 seconds), and tries the next model |
| 401 or 403 (a bad API key) | Skips the whole provider |
| Anything else: 503, no answer in 12 seconds, another error, an empty answer | Records the error, and tries the next model |

When every model fails, `ask` returns the last failure: `rate-limited`,
`unavailable`, `bad-request`, `unauthorized`, `empty-answer`, `server-error`
or `internal`. `/diag` shows it, e.g. "Models: Broken (rate-limited)".

**What we learnt about Gemini's limits:**
- **The day ends at midnight Pacific time** ("Requests per day (RPD) quotas
  reset at midnight Pacific time"). So the day is the `America/Los_Angeles`
  date. Don't change it to UTC or local time.
- **Limits count per project and per model,** not per key. More keys in the
  same project add nothing.
- **The minute window is assumed to be fixed** (Google doesn't say), counted
  in UTC minutes. Nothing is reserved before a call, so two requests at once
  can both take the last free slot. A 429 corrects any drift.

## The `/tz` page

Guessing a time zone from a place name is not reliable (ADR-5). So `/tz` links
to a small page, served by the Worker itself. No model is used.

1. `/tz` replies with a button to `https://<worker>/tz?token=…`. The link uses
   the address of Telegram's request, so there is no URL to set up.
2. The page shows the device's time zone with its local time, and a **Yes, use
   this time zone** button. Or the user searches all zones: by plain name in
   their language ("Eastern Time", from `Intl`), or by a well-known city in
   English ("Washington" finds America/New_York,
   `src/adapters/web/time-zone-cities.ts`). The search ignores case and
   accents, and shows exact matches first.
3. The page is in the user's language, right-to-left for Persian and Arabic.
4. Saving `POST`s to `/tz/save`, which checks the zone, saves it, and confirms
   in the chat.

**The page knows the user only from a signed token,** never from anything the
browser sends (`src/adapters/web/time-zone-link-token.ts`):
- `base64url(payload).base64url(HMAC-SHA256)`, signed with `WEBHOOK_SECRET`
  plus a fixed prefix.
- The **link** token works for 1 minute. Opening it gives the page a **save**
  token for 10 minutes. So a leaked link is useless after a minute, but a slow
  search is not cut off.
- A token can't do the other token's job, and any change is detected. A
  missing, forged, expired or wrong token gets a `403`, and touches neither D1
  nor Telegram.
- Every page gets a new CSP nonce, `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer`, and can't be framed.

To see the page: run `npx wrangler dev`, send `/tz` to the bot, and open the
link.

## Translations

Every text is translated ahead of time into 16 languages, so choosing a
language never calls a model (ADR-6).

- English: `BOT_MESSAGES` in `src/i18n/bot-message.ts`. The others:
  `src/i18n/translations/<language>.json`, imported in
  `src/i18n/translation.ts`.
- **To change or add a message,** edit the English and the same id in all 15
  JSON files, in the same commit.
- **To add a language,** add its code to `SUPPORTED_LANGUAGES`
  (`src/domain/user/supported-language.ts`), add its JSON file, and import it
  in `translation.ts`.
- `tests/unit/i18n/translation.test.ts` fails unless every language has every
  id, no old id is left, and each translation keeps the English text's `{0}`
  placeholders, HTML tags, emoji and `/lang`, `/tz` and `/help` commands.

An AI assistant wrote the translations. Native speakers haven't reviewed them
yet, except the Persian ones.

## Logs

Log events use OpenTelemetry names (ADR-9). The naming rules are in
[CODE_STRUCTURE.md](CODE_STRUCTURE.md#logging).

**Where they go:** every event goes to the `app-logs` dataset in
[Axiom](https://axiom.co) (`src/adapters/logging/axiom.ts`, region
`us-east-1`), and is printed to the console as one JSON line, so Workers Logs
keeps a copy. Everything logs through a `Logger`; there are no direct
`console.*` calls. Without `AXIOM_TOKEN` (local runs, tests), nothing is sent.
An Axiom failure is only printed, and never affects the reply.

**One request is one log session:**
- Every event of a request has the same `trace_id` (`runLogSession` in
  `worker.ts`, using `AsyncLocalStorage`, so parallel requests never mix).
- The events go to Axiom in one batch, after the response (`waitUntil`), so
  logging adds no delay.
- Workers freeze the clock until the next I/O, so events can share a `_time`.
  `log_session.seq` numbers them: always sort by `_time`, then
  `log_session.seq`.
- Texts longer than 10,000 characters are cut.
- Every printed line counts toward Workers Logs' free limit: 200,000 lines a
  day, then 1% sampling.

**Every event** has `bot.edition` (`english` or `persian`). **Every event of a
message** also has `user.id`, `user.name` (the username, or `null`),
`user.full_name`, `telegram.chat.id`, `telegram.user_language_code`,
`telegram.reply_language` and `telegram.reply_language_source`
(`user_choice`, `telegram` or `edition_default`). The `/tz` page's events get
the user from the signed token.

**The events** (`INFO` unless noted):

| Event | Attributes | When |
|---|---|---|
| `telegram.update_handled` | `telegram.command`, `telegram.duration_ms` | the end of every message |
| `telegram.update_failed` (`ERROR`) | `exception.*` | something failed; the user got the general error |
| `telegram.update_ignored` | `telegram.ignore_reason` | an update the bot doesn't use |
| `telegram.reply_sent` | `telegram.reply_kind` | a reply was sent |
| `telegram.send_failed` (`WARN`) | `telegram.method`, `http.response.status_code`, `telegram.error_description` | Telegram refused a reply (not a block) |
| `router.models_listed`, `router.model_tried`, `router.model_answered` | `router.available_models`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.*` | the router's steps |
| `router.model_failed` (`WARN`; `ERROR` for a bad request, a bad key or our bug) | `router.failure_kind`, `router.failure_detail`, `router.limit_window`, `router.retry_after_seconds` | a model gave no answer |
| `router.no_model_answered` (`ERROR`) | | every model failed |
| `extraction.completed` (`WARN` when the answer is not usable) | `extraction.message_text`, `extraction.model_answer`, `gen_ai.request.model`, `extraction.outcome`, `extraction.problem` | a message went to a model; the answer used |
| `extraction.escalated` | `extraction.first_model`, `extraction.first_confidence`, `extraction.strong_model`, `extraction.strong_confidence`, `extraction.escalation_outcome` (`strong_answer_used`, `no_strong_model`, `strong_answer_unusable`) | an unsure answer was asked again of a strong model |
| `quota.consumed`, `quota.refunded` | `quota.remaining` | a unit was used, or given back |
| `time_zone_page.token_refused` (`WARN`) | `time_zone_page.token_purpose`, `time_zone_page.refusal_reason` | a `/tz` token was refused |
| `language_command.not_supported` | `language_command.language_text` | `/lang` with a language the bot doesn't have |
| `user_activity.*` | see below | a user did something |

**User activity:** one event per thing a user does:

| Activity | Attributes | When |
|---|---|---|
| `bot_started`, `help_requested`, `version_requested` | | `/start`, `/help`, `/ver` |
| `models_checked` | `user_activity.outcome` (`ok`, `no_model`, `unexpected_answer`) | `/diag` |
| `language_set`, `language_reset` | `user_activity.language` | `/lang <language>`, `/lang auto` |
| `time_zone_link_sent`, `time_zone_page_opened` | | `/tz` sent the link; the link was opened |
| `time_zone_set` | `user_activity.time_zone`, `user_activity.via` (`command`, `page`) | a time zone was saved |
| `unknown_command_sent` | `user_activity.command`, `user_activity.command_text` | e.g. `/settings dark mode` |
| `event_requested` | `user_activity.outcome` (`created`, `no_event`, `repeat_declined`, `time_zone_needed`, `no_model`, `unusable_answer`, `no_text`); when created: `user_activity.repeats`, `user_activity.all_day`; for `no_event`, `repeat_declined` and `time_zone_needed`: `user_activity.problem` (why, e.g. "no date") | a message asked for an event |
| `quota_used_up` | | a message was refused: no quota left |
| `bot_blocked` | `user_activity.via` (`membership`, or `send_refused` when a send failed because of a block) | the user blocked the bot |
| `bot_unblocked` | | the user unblocked or restarted the bot |

Telegram sends a block as a `my_chat_member` update (status `kicked`, then
`member` on unblock). A user who deletes the chat without blocking sends
nothing, so the bot can't see it.

**Example queries** (APL needs quotes around names with dots):

```
['app-logs'] | where trace_id == "<id>" | sort by _time asc, ['log_session.seq'] asc
['app-logs'] | where ['user.id'] == 42 and eventName startswith "user_activity." | sort by _time asc
['app-logs'] | where eventName == "user_activity.event_requested" | summarize count() by ['user_activity.outcome'], ['user_activity.problem']
['app-logs'] | where eventName == "user_activity.unknown_command_sent" | summarize count() by ['user_activity.command']
['app-logs'] | where severityText == "ERROR" | sort by _time desc
```

**Other places to look:**
- Live Worker logs: `npx wrangler tail --env dev --format pretty`. Add
  `--search "<text>"` to filter, or `--status error`. It shows new logs only;
  for older ones, use Axiom or the dashboard's Logs page.
- The last error of each model:
  `npx wrangler d1 execute noted-it-dev-usage --remote --env dev --command "SELECT model, lastErrorAest, lastError, lastSuccessAest FROM gemini_usage"`.

For prod, use `--env prod` and `noted-it-prod-usage`.
