# noted_it

A Telegram bot that runs on Cloudflare Workers.

You forward it a message with an event (a photo with a caption works too), or
type one. It replies with:

- a one-tap "add to Google Calendar" link,
- an `.ics` file for Apple Calendar, Outlook, and others.

The same code runs two **bot editions** (ADR-10): an English bot and a Persian
bot. Each edition is its own Worker, with its own bot, `/` menu and secrets.
`BOT_EDITION` in [wrangler.toml](wrangler.toml) tells a Worker which one it
runs. The editions of a stage share its Cloudflare account and D1 database.

| Env (`wrangler.toml` and GitHub Environment) | Edition | Telegram bot | Worker name | Cloudflare account | Deploys when |
|---|---|---|---|---|---|
| `dev` | english | `@noted_it_dev_bot` | `noted-it-dev-bot` | the dev account | every push to `main` |
| `dev-fa` | persian | `@noted_it_dev_fa_bot` | `noted-it-dev-fa-bot` | the dev account | every push to `main` |
| `prod` | english | `@noted_it_bot` | `prod` | the prod account | by hand, from a `v…` tag (see [Deploy to prod](#deploy-to-prod)) |
| `prod-fa` | persian | `@noted_it_fa_bot` | `prod-fa` | the prod account | with `prod`, from the same tag |

A wrong secret fails its edition's deploy job at the step that uses it, and
the log shows Telegram's or Cloudflare's error. The other edition still
deploys.

More docs:

| Doc                                                                                | What is in it                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [docs/PRODUCT.md](docs/PRODUCT.md)                                                 | Features, what users do, and the backlog                                                   |
| [docs/EDGE_CASES.md](docs/EDGE_CASES.md)                                           | The rules for dates, calendars, repeats and time zones, and the real messages behind them  |
| [docs/ARCHITECTURE_DECISIONS_REGISTRY.md](docs/ARCHITECTURE_DECISIONS_REGISTRY.md) | Why the main parts work the way they do; the daily quota and what each message costs in D1 |
| [docs/CODE_STRUCTURE.md](docs/CODE_STRUCTURE.md)                                   | How the code is organised, and the coding and logging rules                                |
| [docs/UBIQUITOUS_LANGUAGE.md](docs/UBIQUITOUS_LANGUAGE.md)                         | The words we use in code and docs                                                          |

## Commands

| Command  | What it does                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/start` | A short welcome, with one example to try                                                                                                    |
| `/help`  | How the bot works, what you can set, and the daily quota (when it is shown)                                                                 |
| `/lang`  | Set the reply language (`/lang fa`, `/lang Persian`). `/lang auto` goes back to the Telegram language. `/lang` alone shows the current one. |
| `/tz`    | Set your time zone on a web page (the button works for 1 minute). `/tz Australia/Melbourne` (an exact zone name) is applied at once.        |
| `/ver`   | Show the running version                                                                                                                    |
| `/diag`  | Check that the models answer. It is not in Telegram's `/` menu on purpose.                                                                  |

Commands never use quota. Any other message is treated as an event and sent to
a model. An unknown command (e.g. `/settings`) gets no reply, but it is logged.

## How it works

Telegram calls the Worker's URL (a webhook) for every update. There is no
polling and no server that runs all the time.

| Step                                                                                                                                                                                                                                    | File                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| The entry point: one log session per request. `GET /tz` and `POST /tz/save` go to the time zone page. Any other `POST` is the webhook: a wrong secret gets 401, and everything else gets 200 (ADR-8).                                   | `src/app/worker.ts`                    |
| One update: a message, a block or unblock, or something the bot ignores. For a message, it loads the user, picks the reply language, then runs the command or creates the event. It never throws: a failure gets a general error reply. | `src/app/handle-update.ts`             |
| The commands, one file each                                                                                                                                                                                                             | `src/app/commands/`                    |
| An event from a message: the quota, the model, the calendar event, the reply, and the refund when no model answers                                                                                                                      | `src/app/create-event-from-message.ts` |
| Loading and saving a user, with a retry when two updates race (ADR-3)                                                                                                                                                                   | `src/app/update-user.ts`               |

The rest of `src/` follows one rule: pure rules in `domain/` and `output/`,
input and output only in `adapters/`, and `app/` connects them. See
[docs/CODE_STRUCTURE.md](docs/CODE_STRUCTURE.md).

## Local dev

```bash
npm install
npx wrangler secret put BOT_TOKEN --env dev      # the dev bot token, from secrets/dev.json
npx wrangler secret put WEBHOOK_SECRET --env dev # any random string
npx wrangler secret put GEMINI_API_KEY --env dev # your Gemini API key
npx wrangler secret put GROQ_API_KEY --env dev   # your Groq API key
npx wrangler secret put AXIOM_TOKEN --env dev    # optional locally: without it, logs stay in the console
npx wrangler dev --env dev
```

`wrangler dev` gives you a URL. Point the Telegram webhook at it, **with the
secret token**. A `setWebhook` call without `secret_token` clears Telegram's
secret, and then every webhook call fails with 401.

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=<your dev URL>" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

## Tests

| Kind                                                                         | Where                                      | How to run                              |
| ---------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------- |
| Unit tests, offline                                                          | `tests/unit/` (the same folders as `src/`) | `npx vitest run tests/unit`             |
| Live tests: real messages through the real router and models                 | `tests/integration/extract-draft.test.ts`  | part of `npm test`                      |
| Manual: fills the Gemini quota on purpose, to check that the router moves on | `tests/manual/quota-fill.test.ts`          | `npm run test:quota-fill` (never in CI) |

- All tests run inside the Workers runtime (`@cloudflare/vitest-plugin`).
- The live tests check only the fields they list (`toMatchObject`). A failed
  model moves on to the next one, so a test fails only if no model answers.
- `tests/unit/code-structure.test.ts` checks the import rule and the file
  name casing.

**Databases in tests:**

- The dev D1 database is a **remote binding** (`remote = true` in
  [wrangler.toml](wrangler.toml)). So tests that use it read and write the real
  dev database, locally and in CI.
- `TEST_DB` is a local D1, declared in `vitest.config.ts`. The database tests
  use it to run real SQL without touching dev.

**Running all tests** needs these values (the same ones CI sets):

```bash
export GEMINI_API_KEY=...          # from the dev environment's secrets
export GROQ_API_KEY=...            # optional: lets the router reach Groq in the tests
export CLOUDFLARE_API_TOKEN=...    # needs D1: Edit
export CLOUDFLARE_ACCOUNT_ID=...
npm ci && npm run typecheck && npm test
```

- `vitest.config.ts` reads `GEMINI_API_KEY` and `GROQ_API_KEY` from the
  environment, or from your local `secrets/dev.json`. It stops at once if
  `GEMINI_API_KEY` is missing.
- Full runs are slower (every remote D1 call goes over the network). They also
  use the dev Gemini quota, which the dev bot shares.

## CI/CD

**`.github/workflows/ci.yml`** runs on every push. It has two jobs (a pull
request runs only the first):

- **`build`**: installs, typechecks, runs the offline tests, then the live
  tests (real Gemini, real dev D1). It needs `GEMINI_API_KEY`, `GROQ_API_KEY`,
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- **`deploy-dev`**: runs only when `build` passes, and only on `main`. It
  deploys each edition (`dev`, `dev-fa`) as its own job.
  - After every edition deployed, `tag-dev` pushes a git tag with the exact
    version that `/ver` shows (e.g. `v1.0.42-abc1234`). A failed deploy adds
    no tag.
  - To deploy without the integration tests (e.g. the dev Gemini quota is used
    up): run the CI workflow by hand on `main` in the Actions tab, and tick
    **Skip the integration tests**. The typecheck and the offline tests still
    run, and must pass.

**`.github/workflows/deploy.yml`** (`deploy-prod`) **never runs by itself.** You
start it by hand, and only from a `v…` tag. It deploys both prod editions
(`prod`, `prod-fa`). See [Deploy to prod](#deploy-to-prod).

Every deploy uses `wrangler` to deploy the edition's Worker. Then it points
that bot's Telegram webhook at it, and sets:
- its `/` menu (`setMyCommands`), from `.github/bot-menus/<edition>.json`;
- its name, description (shown before the user taps Start) and short
  description (the profile page), from `.github/bot-profiles/<edition>.json`.
  The file holds the prod name; the dev deploy adds " - Dev" to it. Each is
  only sent when it differs from the bot's current text, because Telegram
  rate-limits these calls.

### Deploy to prod

GitHub's "required reviewers" approval is not available for private repos on
the free plan. So the guard is a manual start: nothing reaches prod without a
deliberate click.

1. Make sure `main` has everything you want. Let `deploy-dev` check it.
2. Pick the tag to deploy. Every dev deploy already has one
   (`v1.0.N-<commit>`). Or make your own, e.g. for a release:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   A tag alone deploys nothing.
3. Go to **Actions** → **Deploy** → **Run workflow**.
4. In the branch list, pick the tag (not `main`).
5. Click **Run workflow**. Only `deploy-prod` runs, on exactly that commit,
   for both editions.

**Before a prod deploy, check for database changes.** If a release needs a D1
change, make it on prod first. Otherwise an old table can break the
release. This happened once: `/lang` failed on prod because a column there was
still `NOT NULL`.

### Roll back

- Fastest: `npx wrangler rollback --env prod` (and `--env prod-fa`; or the dev
  ones). It switches that Worker back to its previous deploy at once, without
  CI. Each edition is rolled back on its own.
- From source: run the prod deploy again and pick an older tag.

### Where secrets live

**Locally:** `secrets/dev.json` and `secrets/prod.json` (ignored by git, never
committed).

**In CI:** in [GitHub Environments](../../settings/environments) named `dev`,
`dev-fa`, `prod` and `prod-fa` (Settings → Environments), one per edition and
stage. Each has its own copy of the secrets below.
- `BOT_TOKEN`, `WEBHOOK_SECRET` and `WORKER_URL` are different for each
  edition.
- The others have the same values as the stage's English environment, while
  the editions share their resources. To separate an edition later, give it
  its own values here (ADR-10).

| Secret                  | Where it comes from                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `BOT_TOKEN`             | the token in `secrets/{dev,prod}.json`                                                             |
| `WEBHOOK_SECRET`        | a random string, one per environment (e.g. `openssl rand -hex 32`). It also signs the `/tz` links. |
| `WORKER_URL`            | `https://<worker-name>.<your-subdomain>.workers.dev` (you see it after the first deploy)           |
| `GEMINI_API_KEY`        | your Gemini API key                                                                                |
| `GROQ_API_KEY`          | your Groq API key                                                                                  |
| `AXIOM_TOKEN`           | an Axiom token that can write to the `app-logs` dataset                                            |
| `CLOUDFLARE_API_TOKEN`  | a token for that environment's Cloudflare account                                                  |
| `CLOUDFLARE_ACCOUNT_ID` | that environment's Cloudflare account id                                                           |

- Environments (not plain repository secrets) make sure dev and prod never
  share a `BOT_TOKEN` by mistake.
- Dev and prod use **different Cloudflare accounts**, so each Environment needs
  its own Cloudflare token and account id. (An Environment secret replaces a
  repository secret with the same name.)

## Storage (D1)

One D1 database per environment (binding `USAGE_DB`). Every table is created
on first use: each query runs together with its `CREATE TABLE IF NOT EXISTS`.

| Table          | One row per  | What it holds                                                                                                                                             | Code                                                        |
| -------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `users`        | user         | The Telegram profile (username, first and last name, app language), the chosen language and time zone, the quota usage, and a `version` for races (ADR-3) | `src/adapters/database/d1-user-repository.ts`               |
| `gemini_usage` | Gemini model | Requests and tokens in the current minute, requests in the current day, the last error and the last success                                               | `src/adapters/database/d1-counted-model-usage-store.ts`     |
| `groq_usage`   | Groq model   | When the model can be tried again, the daily request count Groq reports, the last error and the last success                                              | `src/adapters/database/d1-retry-after-model-usage-store.ts` |

- In `users`, `NULL` means "not chosen" (the language, the time zone) or "never
  used" (the quota). What a user did, and when, is in the logs, not in D1.
- `*Aest` columns are times in Australian Eastern time, for reading by hand.

To create the databases, then paste their ids into `wrangler.toml`:

```bash
npx wrangler d1 create noted-it-dev-usage
npx wrangler d1 create noted-it-prod-usage
```

## Models and routing

The free Gemini plan has small limits per model. So the bot counts each
model's usage and tries the next model that still has room (ADR-4). Event
extraction and `/diag` use the models.

- The bot never calls a provider directly. It calls `Router.ask`
  (`src/adapters/models/router.ts`).
- The router tries each provider's available models in order: Gemini's, then
  Groq's (`routedProvidersOf` in `src/adapters/models/providers/routed-providers.ts`).
  The models, their limits and their order are in
  `src/adapters/models/providers/model-list.ts`.
- Only `src/adapters/models/providers/` knows the names Gemini and Groq.

| Result                                              | What the router does                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| An answer                                           | Records the usage, and returns the answer                                                                                        |
| 429 (rate limit)                                    | Marks the model as used up for the minute or the day (Groq: until its `retry-after`, else 60 seconds), then tries the next model |
| 503, or no answer in 12 seconds                     | Records the error, then tries the next model                                                                                     |
| Any other error (other 4xx or 5xx, an empty answer) | Records the error, then tries the next model                                                                                     |
| 401 or 403 (a bad API key)                          | Records the error, then skips the whole provider                                                                                 |

When every model fails, `ask` returns the last failure. Its `kind` is one of
`rate-limited`, `unavailable`, `bad-request`, `unauthorized`, `empty-answer`,
`server-error` or `internal`. `/diag` shows it, e.g. "Models: Broken
(rate-limited)".

**What we learnt about Gemini's limits:**

- **The day ends at midnight Pacific time.** Google's docs say: "Requests per
  day (RPD) quotas reset at midnight Pacific time." So the day is the
  `America/Los_Angeles` date. Do not change it to UTC or local time.
- **Limits count per project, not per key.** More keys in the same project add
  nothing. Limits are per model, so each model is counted on its own.
- **The minute window is assumed to be fixed** (Google does not say). Counters
  use the UTC minute. A 429 corrects any drift.
- **Nothing is reserved before a call.** So two requests at the same moment can
  both take the last free slot. The 429 corrects the count.

## The `/tz` page

Guessing a zone from a place name is not reliable: one country can have many
zones (ADR-5). So `/tz` uses a small web page, served by the Worker itself. No
model is used.

1. `/tz` replies with a button that links to `https://<worker>/tz?token=…`. The
   link uses the address of Telegram's request, so there is no URL to set up.
2. The page reads the device's zone and shows it with the local time and a
   **Yes, use this time zone** button. Or the user searches all zones.
3. **The search** also finds each zone's plain name in the user's language
   ("Eastern Time", from `Intl`), and well-known cities in English
   (`src/adapters/web/time-zone-cities.ts`: "Washington" finds
   America/New_York). It ignores case and accents, and shows exact matches
   first. The page is in the user's language, right-to-left for Persian and
   Arabic.
4. Saving sends a `POST` to `/tz/save`. It checks the zone, saves it, and sends
   a confirmation to the chat.

**How the page knows the user:** only from a signed token, never from anything
the browser sends (`src/adapters/web/time-zone-link-token.ts`).

- Format: `base64url(payload).base64url(HMAC-SHA256)`, signed with
  `WEBHOOK_SECRET` plus a fixed prefix. No other secret is needed.
- Two tokens: the **link** token works for **1 minute**. Opening the link gives
  the page a **save** token that works for **10 minutes**. So a leaked link is
  useless after a minute, but a user who searches for a while is not cut off.
- A token cannot do the other token's job. Any change is detected. A token
  must be spelled exactly as it was signed.
- A missing, forged, expired or wrong token gets a `403`, and touches neither
  D1 nor Telegram.
- Every page gets a new CSP nonce, `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer`, and cannot be framed.

To see the real page: run `npx wrangler dev`, send `/tz` to the bot, and open
the link.

## Translations

The bot replies in 16 languages (ADR-6). Every text is translated ahead of
time, so choosing a language never calls a model.

- The English texts: `BOT_MESSAGES` in `src/i18n/bot-message.ts`.
- One file per language: `src/i18n/translations/<language>.json`, imported in
  `src/i18n/translation.ts`.
- Numbers, dates, times and the 🔁 repeat sentence are written in the reply
  language too. The event's title and location are never translated.

| To…              | Do this                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Change a message | Edit the English, and the same id in all 15 JSON files, in the same commit. Nothing forces this.                                      |
| Add a message    | Add the id to `BOT_MESSAGES` and to every JSON file                                                                                   |
| Add a language   | Add its code to `SUPPORTED_LANGUAGES` (`src/domain/user/supported-language.ts`), add its JSON file, and import it in `translation.ts` |

`tests/unit/i18n/translation.test.ts` fails until every language has every id,
no old id is left, and every translation has the same `{0}` placeholders, HTML
tags, emoji and `/lang`, `/tz` and `/help` commands as the English.

The translations were written by an AI assistant. Native speakers have not
reviewed them yet.

## Logs

Log events use OpenTelemetry names (ADR-9). The naming rules are in "Logging"
in [docs/CODE_STRUCTURE.md](docs/CODE_STRUCTURE.md#logging).

**Where they go:**

- Every event goes to the **`app-logs`** dataset in [Axiom](https://axiom.co)
  (`src/adapters/logging/axiom.ts`, region `us-east-1`: change it if your Axiom
  org is somewhere else).
- Every event is also printed to the console as one JSON line, so Workers Logs
  keeps a copy. There are no direct `console.*` calls in `src/`: everything
  uses a `Logger`.
- Without `AXIOM_TOKEN` (local runs, tests), nothing is sent. If Axiom fails,
  the error is only printed. It never affects the reply.

**One request is one log session:**

- `runLogSession` (in `worker.ts`) gives every event of a request the same
  `traceId`. It uses `AsyncLocalStorage` (the `nodejs_als` flag in
  [wrangler.toml](wrangler.toml)), so parallel requests never mix.
- The events are sent to Axiom as one batch, after the response
  (`waitUntil`). So logging adds no delay for the user.
- Workers freeze the clock until the next I/O, so several events can have the
  same `_time`. `log_session.seq` counts the events of a request (1, 2, 3, …).
  Always sort by `_time`, then `log_session.seq`.
- Texts longer than 10,000 characters are cut.
- Every printed line counts toward the Workers Logs limit (200,000 lines per
  day on the free plan, then 1% sampling).

**Every event of an update** has `bot.edition` (`english` or `persian`), so
each edition can be told apart in the one dataset. **Every event of a
message** also has: `user.id`, `user.name` (the Telegram username: optional,
so it can be `null`), `user.full_name`, `telegram.chat.id`,
`telegram.user_language_code`, `telegram.reply_language` and
`telegram.reply_language_source` (`user_choice`, `telegram` or
`edition_default`). The `/tz` page's events get the user from the signed
token.

**The events** (`INFO` unless noted):

| Event                                                                           | Attributes                                                                                                               | When                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `telegram.update_handled`                                                       | `telegram.command`, `telegram.duration_ms`                                                                               | the end of every message                         |
| `telegram.update_failed` (`ERROR`)                                              | `exception.*`                                                                                                            | something failed; the user got the general error |
| `telegram.update_ignored`                                                       | `telegram.ignore_reason`                                                                                                 | an update the bot does not use                   |
| `telegram.reply_sent`                                                           | `telegram.reply_kind`                                                                                                    | a reply was sent                                 |
| `telegram.send_failed` (`WARN`)                                                 | `telegram.method`, `http.response.status_code`, `telegram.error_description`                                             | Telegram refused a reply (not a block)           |
| `router.models_listed`, `router.model_tried`, `router.model_answered`           | `router.available_models`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.*`                              | the router's steps                               |
| `router.model_failed` (`WARN`; `ERROR` for a bad request, a bad key or our bug) | `router.failure_kind`, `router.failure_detail`, `router.limit_window`, `router.retry_after_seconds`                      | a model gave no answer                           |
| `router.no_model_answered` (`ERROR`)                                            |                                                                                                                          | every model failed                               |
| `extraction.completed` (`WARN` when the answer is not usable)                   | `extraction.message_text`, `extraction.model_answer`, `gen_ai.request.model`, `extraction.outcome`, `extraction.problem` | a message went to a model                        |
| `quota.consumed`, `quota.refunded`                                              | `quota.remaining`                                                                                                        | a unit was used, or given back                   |
| `time_zone_page.token_refused` (`WARN`)                                         | `time_zone_page.token_purpose`, `time_zone_page.refusal_reason`                                                          | a `/tz` link or save token was refused           |
| `language_command.not_supported`                                                | `language_command.language_text`                                                                                         | `/lang` with a language the bot does not have    |
| `user_activity.*`                                                               | see below                                                                                                                | a user did something                             |

**User activity:** one event per thing a user does, e.g.
`user_activity.time_zone_set`.

| Activity                                             | Attributes                                                                                                                                                                     | When                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `bot_started`, `help_requested`, `version_requested` |                                                                                                                                                                                | `/start`, `/help`, `/ver`                          |
| `models_checked`                                     | `user_activity.outcome` (`ok`, `no_model`, `unexpected_answer`)                                                                                                                | `/diag`                                            |
| `language_set` / `language_reset`                    | `user_activity.language`                                                                                                                                                       | `/lang <language>` / `/lang auto`                  |
| `time_zone_link_sent`, `time_zone_page_opened`       |                                                                                                                                                                                | `/tz` with no exact zone, then the link was opened |
| `time_zone_set`                                      | `user_activity.time_zone`, `user_activity.via` (`command`, `page`)                                                                                                             | a time zone was saved                              |
| `unknown_command_sent`                               | `user_activity.command`, `user_activity.command_text`                                                                                                                          | e.g. `/settings dark mode`                         |
| `event_requested`                                    | `user_activity.outcome` (`created`, `no_event`, `repeat_declined`, `no_model`, `unusable_answer`, `no_text`); `user_activity.repeats` and `user_activity.all_day` when created | a message asked for an event                       |
| `quota_used_up`                                      |                                                                                                                                                                                | a message was refused: no quota left               |
| `bot_blocked`                                        | `user_activity.via` (`membership`, or `send_refused` when Telegram refused a send because of a block)                                                                          | the user blocked the bot                           |
| `bot_unblocked`                                      |                                                                                                                                                                                | the user unblocked or restarted the bot            |

- A block arrives as a `my_chat_member` update: status `kicked`, then
  `member` on unblock.
- If a user deletes the chat without blocking, Telegram sends nothing. The bot
  cannot see it.

**Example queries** (APL needs quotes around names with dots):

```
['app-logs'] | where traceId == "<id>" | sort by _time asc, ['log_session.seq'] asc
['app-logs'] | where ['user.id'] == 42 and eventName startswith "user_activity." | sort by _time asc
['app-logs'] | where eventName == "user_activity.bot_started" | summarize count() by ['telegram.reply_language_source']
['app-logs'] | where eventName == "user_activity.unknown_command_sent" | summarize count() by ['user_activity.command']
['app-logs'] | where severityText == "ERROR" | sort by _time desc
```

**Other places to look:**

| What                         | How                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live Worker logs             | `npx wrangler tail --env dev --format pretty`. Add `--search "<text>"` to filter, or `--status error` for failed requests. New logs only: for older ones, use the dashboard's Logs page or Axiom. |
| The last error of each model | `npx wrangler d1 execute noted-it-dev-usage --remote --env dev --command "SELECT model, lastErrorAest, lastError, lastSuccessAest FROM gemini_usage"`                                             |

For prod: use `--env prod` and `noted-it-prod-usage`. Test runs do not send to
Axiom; their logs print in your terminal.
