# noted_it

A Telegram bot that runs on Cloudflare Workers.

You forward it a message with an event (a photo with a caption works too). It
replies with:
- a one-tap "add to Google Calendar" link,
- an `.ics` file for Apple Calendar, Outlook, and others.

There are two environments:

| Env  | Telegram bot        | Worker name        | Cloudflare account | Deploys when |
|------|---------------------|--------------------|--------------------|--------------|
| dev  | `@noted_it_dev_bot` | `noted-it-dev-bot` | the dev account    | every push to `main` |
| prod | `@noted_it_bot`     | `prod`             | its own account    | by hand, from a `v…` tag (see [Deploy to prod](#deploy-to-prod)) |

More docs:
- [docs/PRODUCT.md](docs/PRODUCT.md): features and backlog.
- [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md): the main design decisions.
- [docs/EDGE_CASES.md](docs/EDGE_CASES.md): missing years, other calendars, missing time zones.
- [docs/USER_QUOTA_DESIGN.md](docs/USER_QUOTA_DESIGN.md): the daily quota and its D1 cost.

## Commands

| Command  | What it does |
|----------|--------------|
| `/start` | Intro message, with the daily quota |
| `/lang`  | Set the reply language (`/lang fa`, `/lang Persian`). `/lang auto` goes back to the Telegram language. `/lang` alone explains how to use it. |
| `/tz`    | Set your time zone on a web page (the button works for 1 minute). `/tz Australia/Melbourne` (an exact zone name) is applied at once. Does not use quota. |
| `/ver`   | Show the running version |
| `/diag`  | Check the Gemini connection. It works, but it is not in Telegram's `/` menu on purpose. |

Any other message is treated as an event and sent to the model.

## How it works

Telegram calls the Worker's URL (a webhook) for every message. There is no
polling and no server that runs all the time.

**The entry point** is [src/legacy/telegram/telegramWebhook.ts](src/legacy/telegram/telegramWebhook.ts)
(`main` in `wrangler.toml`). It is small on purpose. It:
1. checks that the request comes from Telegram (a shared secret token),
2. prepares the shared parts (the quota policy, the router, the Telegram client),
3. passes the message to `updateHandler`.

**The rest of the Telegram code** is in `src/legacy/telegram/`:

| File | What it does |
|------|--------------|
| `messageHandlers/updateHandler.ts` | The flow for one message. It reads the user's language and time zone, then `handleMessage` runs a command, or sends anything else to event extraction (behind the [daily quota](#daily-quota)). It never throws: errors go to the chat, because Telegram retries failed requests and that would block the queue. |
| `commands/` | One file per command (`startCommandHandler.ts`, `langCommandHandler.ts`, `tzCommandHandler.ts`, …). Each is a plain function that takes only what it needs. To add a command, add a file and one `if` in `handleMessage`. |
| `messageHandlers/eventMessageHandler.ts` | The event flow: extract the event, log it, decline unclear repeats, build the calendar event and the caption, send the `.ics` file. |
| `replier.ts` | The one place that translates a message, fills its `{0}` placeholders, and sends it. Every reply uses it. |
| `telegramClient.ts`, `telegramTypes.ts`, `telegramHtml.ts` | The Telegram API: `sendMessage`, `sendDocument`, types, HTML escaping. |

`Env` is in `src/legacy/env.ts`. `extractEvent` is in `src/legacy/extractedEvents/extractEvent.ts`.

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

`wrangler dev` gives you a URL. Point the Telegram webhook at it:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=<your dev URL>" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

## Tests

- **Unit tests** (`tests/unit/`) run offline. Run them with
  `npx vitest run tests/unit`.
- **Live tests** (`tests/integration/extractEvent.test.ts`) call the real
  Gemini API through the real router. Each case is a message and the JSON we
  expect. The check is partial (`toMatchObject`), so you only list the fields
  you care about.
- All tests run inside the Workers runtime (`@cloudflare/vitest-plugin`).

**Databases in tests:**
- The dev D1 database is a **remote binding** (`remote = true` in
  [wrangler.toml](wrangler.toml)). So tests read and write the real dev
  database, locally and in CI.
- The one exception is `TEST_DB`, a local D1 declared in `vitest.config.ts`.
  The repository tests use it to run real SQL without touching dev.

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
- Full runs are slower (every D1 call goes over the network). They also use
  the dev Gemini quota, which the dev bot shares.

## CI/CD

**`.github/workflows/ci.yml`** runs on every push. It has two jobs (a pull
request runs only the first):
- **`build`**: installs, typechecks, runs all tests (real Gemini, real dev D1).
  It needs `GEMINI_API_KEY`, `GROQ_API_KEY`, `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`.
- **`deploy-dev`**: runs only when `build` passes, and only on `main`.
  - After a successful deploy, it pushes a git tag with the exact version that
    `/ver` shows (for example `v0.2.42-beta-abc1234`). A failed deploy adds no
    tag.
  - To deploy even when tests fail (for example, the dev Gemini quota is used
    up): run the CI workflow by hand on `main` in the Actions tab, and tick
    **Deploy to dev even if the tests fail**.

**`.github/workflows/deploy.yml`** (`deploy-prod`) **never runs by itself.** You
start it by hand, and only from a `v…` tag. See [Deploy to prod](#deploy-to-prod).

Every deploy uses `wrangler` to deploy its own Worker. Then it points that
environment's Telegram webhook and command list at it.

### Deploy to prod

GitHub's "required reviewers" approval is not available for private repos on
the free plan. So the guard is a manual start: nothing reaches prod without a
deliberate click.

1. Make sure `main` has everything you want. Let `deploy-dev` check it.
2. Pick the tag to deploy. Every dev deploy already has one
   (`v0.2.N-beta-<commit>`). Or make your own (stay in `0.x.y` while the bot
   is in Beta):
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```
   A tag alone deploys nothing.
3. Go to **Actions** → **Deploy** → **Run workflow**.
4. In the branch list, pick the tag (not `main`).
5. Click **Run workflow**. Only `deploy-prod` runs, on exactly that commit.

**Before a prod deploy, check for database changes.** If the new code needs a
D1 schema change, run it on prod first. Otherwise the old table can break the
new code (this happened once with `/lang`).

### Roll back

- Fastest: `npx wrangler rollback --env dev` (or `--env prod`). It switches the
  live Worker back to its previous deploy at once, without CI.
- From source: run the prod deploy again and pick an older tag.

### Where secrets live

**Locally:** `secrets/dev.json` and `secrets/prod.json` (ignored by git, never
committed).

**In CI:** in [GitHub Environments](../../settings/environments) named `dev` and
`prod` (Settings → Environments). Each has its own copy of:

| Secret                  | Where it comes from |
|-------------------------|---------------------|
| `BOT_TOKEN`             | the token in `secrets/{dev,prod}.json` |
| `WEBHOOK_SECRET`        | a random string, one per environment (for example `openssl rand -hex 32`) |
| `WORKER_URL`            | `https://<worker-name>.<your-subdomain>.workers.dev` (you see it after the first deploy) |
| `GEMINI_API_KEY`        | your Gemini API key |
| `GROQ_API_KEY`          | your Groq API key |
| `AXIOM_TOKEN`           | an Axiom token that can write to the `app-logs` dataset |
| `CLOUDFLARE_API_TOKEN`  | a token for that environment's Cloudflare account |
| `CLOUDFLARE_ACCOUNT_ID` | that environment's Cloudflare account id |

- Environments (not plain repository secrets) make sure dev and prod never
  share a `BOT_TOKEN` by mistake.
- Dev and prod use **different Cloudflare accounts**, so each Environment needs
  its own Cloudflare token and account id. (An Environment secret replaces a
  repository secret with the same name.)

## Features in detail

### Languages

**The list.** The bot replies in 16 languages: English and
`fa ar es fr de it pt ru tr zh ja ko hi nl pl` (`SUPPORTED_LANGUAGES` in
`src/legacy/translation/language.ts`). Other languages fall back to English.

**Which language.** The user's `/lang` choice, if any. Otherwise Telegram's
`message.from.language_code` (`pt-BR` becomes `pt`, and so on).

**Translations are made ahead of time** (see ADR-6 in the
[decision registry](docs/ARCHITECTURE_DECISIONS.md)):
- The English text is the `MESSAGES` object in
  `src/legacy/interactiveMessages/messages.ts`.
- Each language has one file, `src/legacy/translation/translations/<lang>.json`. It
  maps each message id (`START_MESSAGE`, `TZ_LINK_MESSAGE`, …) to its
  translation.
- Code uses messages only by id (type `MessageId`). So a message that is not
  in the catalog does not compile.
- `translateStatic` (`src/legacy/translation/translate.ts`) looks up the id. No reply
  calls a model to translate. So nobody can spend the LLM quota by switching
  languages.
- The repeat sentence under an event ("Repeats every 2 weeks on Monday and
  Wednesday, until Jan 5, 2027") is **not translated**. It is part of the event,
  like the title. `describeRecurrence` (`src/legacy/extractedEvents/recurrence.ts`)
  always writes it in English.

**To change a message:** edit the English in `messages.ts`. Then update the same
id in all 15 JSON files, in the same commit. Nothing forces this: the old
translations stay until you change them.

**To add a message:** add a new id to `MESSAGES` and to every JSON file.
`tests/unit/translations.test.ts` fails until:
- every language has every id,
- no old id is left,
- every translation has the same `{0}` placeholders, HTML tags, emoji and
  `/lang` / `/tz` command names as the English.

**To add a language:** add its code to `SUPPORTED_LANGUAGES`, add a JSON file,
and import it in `src/legacy/translation/translations/index.ts`.

The translations were written by an AI assistant. Native speakers have not
reviewed them yet.

**`/lang <language>`** accepts:
- a code (`fa`, `pt-BR`),
- the English name (`Persian`),
- the language's own name (`فارسی`, `Deutsch`).

It is matched in code, with no model (see `resolveLanguage`). An unsupported
language gets a reply that lists the supported ones.

**Storage.** The `user_preference` table in the `USAGE_DB` D1 database
(`src/legacy/db/sql/userPreference.ts`, `src/legacy/repositories/userPreferenceRepository.ts`):

| Column     | Meaning |
|------------|---------|
| `userId`   | primary key |
| `lang`     | `NULL` means "use the Telegram language" (`/lang auto` sets `NULL`) |
| `timezone` | set by `/tz`; `NULL` until the user picks one |

Both are read in one query at the start of every message. The table is created
on first use, like the other tables.

### Time zones

**Which zone an event uses**, in this order:
1. the zone the message states or suggests (the model's `timezone_hint`);
2. otherwise, the user's `/tz` zone;
3. otherwise, no zone: **floating** time. The `.ics` has no `TZID`, and the
   Google link has local times and no `ctz`. Every calendar shows the time as
   written, in its own zone.

In cases 2 and 3, the caption tells the user and points to `/tz`
(`TZ_USER_NOTE`, `TZ_FLOATING_NOTE`). All-day events get no note: their date
does not depend on a zone.

**"Today"** (used to pick a missing year and for the past-date note) still
needs a zone: the one above, or `appConfig.defaultTimezone` (`UTC`, in
[appConfig.ts](src/legacy/appConfig/appConfig.ts)) for floating times.

See [docs/EDGE_CASES.md](docs/EDGE_CASES.md) for why there is no default zone.

### Setting the time zone (`/tz`)

Guessing a zone from a place name is not reliable (one country can have many
zones). So `/tz` uses a small web page, served by the Worker itself. No model is
used.

1. `/tz` replies with a button that links to `https://<worker>/tz?token=…`. The
   link uses the address of Telegram's request, so there is no URL to set up.
2. The page (`src/legacy/web/tzPage.ts`, markup in `src/legacy/web/tzPage.html`):
   - reads the device's zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`),
   - shows it with the local time and a **Yes, use this time zone** button,
   - or lets the user search all zones (`Intl.supportedValuesOf('timeZone')`).
3. **The search** also finds:
   - each zone's plain name in the user's language ("Eastern Time", from `Intl`),
   - well-known cities in English (`src/legacy/web/tzCities.ts`: "Washington" finds
     America/New_York).

   It ignores case and accents, and shows exact matches first. The page is in
   the user's language, right-to-left for Persian and Arabic.
4. Saving sends a `POST` to `/tz/save`. It checks the zone with `Intl`, stores it
   in `user_preference.timezone`, and sends a confirmation to the chat.

`/tz australia/melbourne` (an exact zone name) is applied at once, without the page. Any
other text after `/tz` just gets the link.

**How the page knows the user.** Only from a signed token, never from anything
the browser sends (`src/legacy/web/tzToken.ts`):
- Format: `base64url(payload).base64url(HMAC-SHA256)`, signed with
  `WEBHOOK_SECRET` plus a domain prefix. No new secret is needed.
- Payload: `{uid, username, firstName, lang, purpose, exp}`. `username` and
  `firstName` are only for the logs.
- Two tokens:
  - the **link** token (`purpose: "open"`) works for **1 minute**;
  - opening the link gives the page a **save** token (`purpose: "save"`) that
    works for **10 minutes**. So a leaked link is useless after a minute, but a
    user who searches for a while is not cut off.
- A token cannot do the other token's job. Changes are detected. A token must
  be spelled exactly as it was signed.
- A missing, forged, expired or wrong token gets a `403`, and touches neither
  D1 nor Telegram.
- The page uses a new CSP nonce per response, `Cache-Control: no-store`,
  `Referrer-Policy: no-referrer`, and cannot be framed.
- A save token can be used again until it expires. It can only change the
  user's own row.

**Tests:** `tests/unit/tzToken.test.ts`, `tzRoutes.test.ts`, `tzCommand.test.ts`
and `tzCities.test.ts`. To see the real page: run `npx wrangler dev`, send `/tz`
to the bot, and open the link.

### Dates, calendars and repeats

**From the model's answer to the calendar file**, in two steps:
1. `planEvent` (`src/legacy/extractedEvents/eventPlan.ts`) checks the model's answer
   once. It returns an `EventPlan` (Gregorian dates with years, the times, the
   time zone, the repeat), or the reason why there is no event.
   - Dates in any calendar are converted by `toGregorianDates`
     (`src/legacy/extractedEvents/toGregorian.ts`). A missing year is picked by one
     rule (`pickYear`, in the same file). The full rules are in
     [docs/EDGE_CASES.md](docs/EDGE_CASES.md).
2. `renderCalendarEvent` (`src/legacy/extractedEvents/calendarEvent.ts`) turns the plan
   into the `.ics` file, the Google link and the caption parts. It checks
   nothing: the plan is already checked.

Dates use one type everywhere: `DateOnly` (`src/legacy/time/dateOnly.ts`).

**Repeats** ("every Thursday 7:30pm", "every 2 weeks until 29 Nov", "first
Friday of the month"):
- The model returns a `recurrence` object (see
  `src/legacy/extractedEvents/event_schema.ts`). It only describes the pattern.
- Our code does all the date work: the first date, the end date, and the
  checks (`src/legacy/extractedEvents/recurrence.ts`). The result is an `RRULE` in the
  `.ics` file.
- A repeat with no end date has no end.
- A repeat that is invalid, or has low confidence (`RECURRENCE_MIN_CONFIDENCE`,
  0.7), is declined with a message. It is not guessed.
- The Google link also has the rule (`recur=RRULE:...`). Google's **web**
  calendar uses it. Google's **phone app ignores it** and adds one event. So for
  repeats, the `.ics` file is the reliable way. The caption and `/start` say so.

### Daily quota

The bot is open to everyone. The daily quota per user stops abuse:
- Only messages that go to a model use a unit.
- If no model answers, the unit is given back.
- Commands never use quota.

The details and the D1 cost of each kind of message are in
[docs/USER_QUOTA_DESIGN.md](docs/USER_QUOTA_DESIGN.md).

## Models and routing

The free Gemini plan has limits per model. So the bot counts each model's usage
and picks the next model that still has room. Today, event extraction and
`/diag` use the models.

**The router.** The bot never calls Gemini directly. It calls the `Router`
(`src/legacy/router/router.ts`):
- Its one public method is
  `generate({systemPrompt?, userPrompt, temperature?, responseSchema?})`.
- `telegramWebhook.ts` builds it once with `createRouter(env)`, and passes it to
  `updateHandler`. From there it goes to `extractEvent(router, text)` and to
  `/diag`.
- The router has a list of **providers**. Each provider is a pair:
  - a **provider client** (`GeminiClient`, `GroqClient`) that makes one call to
    one model;
  - a **usage repository** (`src/legacy/repositories/geminiUsageRepository.ts`,
    `groqUsageRepository.ts`) that says which models are available, and stores
    usage and errors in D1.
- The router tries a provider's available models in order, then the next
  provider. Today: Gemini, then Groq. To add a provider, add one more pair in
  `createRouter`.

**What happens on each result:**

| Result | What the router does |
|--------|----------------------|
| Success | Records usage (`rpm`, `rpd` +1, tokens added to `tpm`) in one upsert. |
| 429 (rate limit) | Marks the model as used up for the minute or the day (Groq: until its `retry-after`), then tries the next model. |
| 503, or no answer in 12 seconds (Gemini) | Records the error, then tries the next model. |
| Any other error (other 4xx/5xx, empty answer) | Records the error, then tries the next model. |
| 401 or 403 (bad API key) | Records the error, then skips the whole provider. |

- Nothing is reserved before a call. So two requests at the same moment can
  both take the last free slot. The 429 corrects the count.
- Each upsert is one atomic statement.

**Gemini's limits:**
- **The day ends at midnight Pacific time.** Google's docs say: "Requests per
  day (RPD) quotas reset at midnight Pacific time." So the day key is the
  `America/Los_Angeles` date (`src/legacy/quotaLimit/quotaWindows.ts`). Do not change
  it to UTC or local time.
- **Limits count per project, not per key.** More keys in the same project add
  nothing. Limits are per model, so each model is counted on its own.
- **The minute window is assumed to be fixed** (Google does not say). Counters
  use the UTC minute. A 429 corrects any drift.
- **The limits** (`limits`) are in `src/legacy/providers/registry.ts`, copied from the
  AI Studio free-plan table. The try order is the order in that file.

**Storage.** One row per model in the `gemini_usage` table (D1, binding
`USAGE_DB`). Groq uses `groq_usage`, which only stores when to try again.

| Column | Meaning |
|--------|---------|
| `model` | the model name |
| `day`, `minute` | the current windows |
| `rpm`, `tpm`, `rpd` | requests per minute, tokens per minute, requests per day |
| `aestTime` | the last write, in Australian Eastern time |
| `lastError`, `lastErrorAest` | the model's last error, and when. Kept until the next error. |
| `lastSuccessAest` | the last success. If it is after `lastErrorAest`, the model has recovered. |

- Old windows reset on the next write. A model with no row counts as unused.
- The table is created on first use (each query runs with
  `CREATE TABLE IF NOT EXISTS`, `src/legacy/db/schema/geminiUsageTable.ts`). All SQL is
  in `src/legacy/db/sql/geminiUsage.ts`.
- To create the databases, then paste their ids into `wrangler.toml`:
  ```bash
  npx wrangler d1 create noted-it-dev-usage
  npx wrangler d1 create noted-it-prod-usage
  ```

**The result type.** `generate` returns a `ProviderSuccess`
(`{ok: true, model, text, totalTokens}`) or a `ProviderFailure`
(`{ok: false, kind, httpStatus?, detail}`):

| `kind` | Meaning |
|--------|---------|
| `rateLimited` | a 429, or no model under its limits. Also has `quotaLimitScope`: `minute` or `day`. |
| `unavailable` | 503 |
| `badRequest` | other 4xx |
| `unauthorized` | 401 or 403 |
| `serverError` | other 5xx |
| `emptyResponse` | 200 with no text (for example, a safety block) |
| `internal` | an error in our code |

When all models fail, `kind` is the one from the last attempt. `extractEvent`
passes the failure on and logs it. `/diag` shows it (for example
`Gemini: Broken (unauthorized)`).

**Tests:**
- `tests/integration/extractEvent.test.ts` runs real messages through the real
  router. A failed model moves on to the next one. The test fails only if no
  model answers.
- `tests/unit/geminiResponse.test.ts` checks the parser with a real 503
  response (`tests/unit/fixtures/gemini503Unavailable.ts`).

## Logs

### Axiom

Every log line goes to the **`app-logs`** dataset in [Axiom](https://axiom.co).
- The `Logger` in `src/legacy/logging/logger.ts` does this. The dataset, region and
  service name are in `src/legacy/logging/axiomConfig.ts`. The region is `us-east-1`:
  change it if your Axiom org is somewhere else.
- There are no direct `console.*` calls in `src/`. Everything uses a `Logger`.
  It prints one JSON line to the console (so Workers Logs still has it), and
  also sends the event to Axiom.

**How to log:**
- Create a logger with `new Logger("<name>")`. The name becomes the event's
  `source`. Some classes (for example `RouterLog`) take a `Logger`
  as a parameter.
- Put data in fields, not in the message:
  `logger.error("threw", describeError(err))`,
  `logger.info("extracted", { model, tokens })`.
- **The message is a fixed sentence.** Write `"daily quota exhausted"` with a
  `userId` field, not `"daily quota exhausted for user 42"`. Then you can group
  messages and filter by field (`where userId == 42`).
- Do not use these names for fields: `message`, `source`, `level`, `seq`,
  `correlation_id`, `service`, `version`, `_time`. They belong to the event.

**One request = one `correlation_id`.**
- `runLogSession` (called in the webhook's `fetch`) makes one UUID per request.
  It keeps it in `AsyncLocalStorage` (the `nodejs_als` flag in
  [wrangler.toml](wrangler.toml)), so parallel requests never mix ids.
- Every event of that request has it. After the message is read, every event
  also has `userId`, `username` (`null` if the user has none: Telegram usernames
  are optional), `firstName` (every account has one) and `chatId`.
- To see one request's whole story:
  ```
  ['app-logs'] | where correlation_id == "<id>" | sort by _time asc, seq asc
  ```

**Time and order:**
- The logger sets `_time` when it logs the line. Axiom uses it as the event time.
- Workers freeze the clock until the next I/O. So several lines can have the
  same `_time`.
- `seq` counts events within a request (1, 2, 3, …). Always sort by `_time`
  and `seq`.

**Sending:**
- Events are collected during the request and sent as one batch after the
  response (`ctx.waitUntil`). So logging adds one request to Axiom, and no
  delay for the user.
- Each event has `_time`, `seq`, `level`, `source`, `message`,
  `correlation_id`, `service`, `version`, plus its own fields.
- Text longer than 10,000 characters is cut.
- Without `AXIOM_TOKEN` (local runs, tests), nothing is sent. If Axiom fails,
  the error is only printed. It never affects the reply.
- The logs include message text: what users send, and what models answer.

**What a request logs** (`info` unless noted):

| `message` | Fields | When |
|-----------|--------|------|
| `update received` | `command`, `lang` | start of every message |
| `quota consumed` | `remainingQuota` | one unit used |
| `daily quota exhausted` (warn) | `userId` | no quota left |
| `quota refunded` | `remainingQuota` | no model answered, so the unit was given back |
| `available models` / `attempting model` / `model succeeded` | `models`, `model`, `tokens` | router steps (warn or error for rate limits, 503s and failures) |
| `extracted` | `sourceText`, `event` | the extracted event |
| `provider response received` | `receivedMessage`, `providerResponse`, `model` | the message log (see below) |
| `user activity` | `activity`, … | see [User activity](#user-activity) |
| `diag check completed` | `check`, `healthy` | `/diag` |
| `reply sent` | `type` (`text`/`document`), `lang`, `filename` | after a reply is sent |
| `telegram send failed` (warn) | `method`, `status`, `description` | Telegram refused a reply (not a block) |
| `update processed` | `outcome` (`ok`/`error`), `durationMs` | end of every message |

A normal request logs about 5 to 12 events. Each one is also printed, so it
counts toward the Workers Logs limit (200,000 lines per day on the free plan,
then 1% sampling).

### Message log

`/start` tells users "I may keep your messages to fix bugs". So every message
that goes to event extraction is logged in Axiom as a
`provider response received` event:
- `receivedMessage`: the text as received,
- `providerResponse`: the model's answer,
- `model`: the model that answered (`null` if none did),
- and the request's `userId`, `username` and `firstName`.

There is no other store for messages. Axiom keeps them as long as the dataset
keeps its data.

### User activity

Every user action is one `user activity` event, with an `activity` field
(`src/legacy/logging/activityLog.ts`). It also has the request's `userId`, `username`,
`firstName` and `chatId`.

| `activity` | Extra fields | When |
|------------|--------------|------|
| `start`, `ver`, `diag` | | the command was sent |
| `lang_set` / `lang_reset` | `language` | `/lang <language>` / `/lang auto` |
| `tz_link_sent`, `tz_page_opened` | | `/tz` without a zone, then the link was opened |
| `tz_set` | `timezone`, `via` (`command` or `page`) | a time zone was saved |
| `event_requested` | `outcome` (`created`, `declined`, `no_event`, `no_model`, `no_text`); `recurring` and `allDay` when created | a message went to event extraction |
| `quota_exhausted` | | a message was refused: no quota left |
| `bot_blocked` | `via` (`membership`, or `send_refused` when Telegram refused a send with 403 "blocked") | the user blocked the bot |
| `bot_unblocked` | | the user unblocked or restarted the bot |

- Blocking arrives as a `my_chat_member` update: status `kicked`, then `member`
  on unblock.
- If a user deletes the chat without blocking, Telegram sends nothing. The bot
  cannot see it.
- The `/tz` page and `/tz/save` are separate web requests. Their events get
  `userId`, `username` and `firstName` from the signed token.

Examples:
```
['app-logs'] | where message == "user activity" and userId == 42 | sort by _time asc
['app-logs'] | where activity == "bot_blocked" | summarize count() by bin(_time, 1d)
```

### Other places to look

| What | Where | How to see it |
|------|-------|---------------|
| Router steps | Workers Logs (console) | Dashboard → Workers & Pages → the Worker → Logs. Live: `npx wrangler tail --env dev --format pretty` |
| Last error per model | D1 table `gemini_usage` | `npx wrangler d1 execute noted-it-dev-usage --remote --command "SELECT model, lastErrorAest, lastError, lastSuccessAest FROM gemini_usage"` |

For prod: use `--env prod` and `noted-it-prod-usage`. Test runs do not send to
Axiom; their logs print in your terminal.

**Searching:**
- **Live Worker logs:** `npx wrangler tail --env dev --search "unavailable"`
  shows only lines with that text. Add `--status error` for failed requests, or
  `--format json` to use `jq`. This shows new logs only. For older logs, use
  the Logs page in the dashboard, or Axiom.
- **D1 is real SQL**, so you can use `LIKE`:
  `npx wrangler d1 execute noted-it-dev-usage --remote --command "SELECT model, lastErrorAest, lastError FROM gemini_usage WHERE lastError LIKE '%503%'"`

## One-time migrations (already done)

These steps are kept for reference. The time zone change is done in both
environments.

**`user_preference.timezone` allows `NULL`.** It used to be `NOT NULL`, and
`/lang` filled in a default. SQLite cannot change that rule in place, so the
table was rebuilt once (dev), or dropped and recreated by the code (prod):

```bash
npx wrangler d1 execute noted-it-dev-usage --remote --env dev --command "CREATE TABLE user_preference_new (userId INTEGER NOT NULL PRIMARY KEY, lang TEXT, timezone TEXT); INSERT INTO user_preference_new (userId, lang, timezone) SELECT userId, lang, timezone FROM user_preference; DROP TABLE user_preference; ALTER TABLE user_preference_new RENAME TO user_preference;"
```

**Old KV namespaces are no longer used.** The bot used KV for translated repeat
sentences (`I18N`), the language choice (`USER_LANG`), and the message log
(`MESSAGE_LOG`). All three bindings are gone. You can delete the namespaces:
`npx wrangler kv namespace list`, then
`npx wrangler kv namespace delete --namespace-id <id>`.

To copy old language choices from `USER_LANG` into D1 (needs `jq`; group chats
and invalid codes are skipped):

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
