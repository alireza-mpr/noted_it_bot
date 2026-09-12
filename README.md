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
| `/lang`       | Show or set the reply language (`/lang fa`, `/lang auto`)            |
| `/ver`        | Show the running version                                             |
| `/diag`       | Gemini connectivity check — functional but intentionally not listed in Telegram's `/` autocomplete menu |

Any other message is treated as event content and sent to Gemini for extraction.

## How it works

Telegram calls the Worker's URL as a webhook for every update (no polling, no
always-on process). [src/index.ts](src/index.ts) verifies the request came from
Telegram (via a shared secret token), checks the sender against the
[whitelist](#access-control-whitelist), then routes to a command handler or
(for anything else) event extraction via Gemini.

## Local dev

```bash
npm install
npx wrangler secret put BOT_TOKEN --env dev      # paste noted_it_dev_bot_token from secrets/dev.json
npx wrangler secret put WEBHOOK_SECRET --env dev # any random string
npx wrangler secret put GEMINI_API_KEY --env dev # your Gemini API key
npx wrangler dev --env dev
```

`wrangler dev` gives you a local/tunnel URL — point Telegram's webhook at it with:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=<your dev URL>" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

## Tests

`test/extractEvent.test.ts` calls the real Gemini API with a table of
message → expected-JSON cases (partial match via `toMatchObject`, so you only
assert the fields you care about). Runs inside the actual Workers runtime via
`@cloudflare/vitest-plugin`.

```bash
echo "GEMINI_API_KEY=$(node -p "require('./secrets/dev.json').GEMINI_API_KEY")" > .dev.vars
npm test
```

`.dev.vars` is gitignored — it's how Wrangler/Miniflare inject local secrets
for `wrangler dev` and for these tests.

## CI/CD

- `.github/workflows/ci.yml` — installs deps, typechecks, and runs the test
  suite (against the real Gemini API, using the `dev` environment's
  `GEMINI_API_KEY`) on every push/PR.
- `.github/workflows/deploy.yml` — two jobs:
  - `deploy-dev` runs automatically on every push to `main`. On success, it
    pushes a git tag matching exactly what `/ver` reports for that deploy
    (e.g. `v0.0.42-beta-abc1234`), so a specific dev deployment can be found
    later with `git tag`. A failed deploy leaves no tag.
  - `deploy-prod` **never runs automatically** — it's `workflow_dispatch`-only
    (manually triggered), gated to only run against a `v*.*.*` tag. See
    [Promoting a commit to prod](#promoting-a-commit-to-prod).
  - Each deploys via `wrangler` to its own Worker and re-points that environment's
    Telegram webhook + command list at it.

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
   git tag v0.1.0
   git push origin v0.1.0
   ```
   This does **not** deploy anything by itself — it just marks the commit.
3. Go to the repo's **Actions** tab → **Deploy** workflow → **Run workflow**.
4. In the ref dropdown, pick the tag you just pushed (e.g. `v0.1.0`) instead of `main`.
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
based on Telegram's `message.from.language_code`, via `src/lib/translate.ts`.
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
namespace via `src/lib/messageLog.ts`: the sender's Telegram `username`, the
message/caption text as received, what was sent to Gemini, and Gemini's
response — each entry expires automatically after **14 days**
(`expirationTtl`). Logging failures are swallowed (best-effort) and never
affect the actual reply.

```bash
npx wrangler kv namespace create MESSAGE_LOG --env dev
npx wrangler kv namespace create MESSAGE_LOG --env prod
```

### Access control (whitelist)

The bot is invite-only: `src/lib/whitelist.ts` checks the sender against a
`WHITELIST` KV namespace before processing anything (including `/start`) —
a non-whitelisted user gets a polite rejection message instead. **The one
exception is `/lang`**, which works for everyone regardless of whitelist
status, so even a rejected user can set their preferred language and get
the rejection message itself back in it. There's no admin command for
whitelisting; entries are added manually, and a user passes if **either**
of these is whitelisted:

- **By username** (lowercase, no `@`) — lets you proactively whitelist
  someone before they've ever messaged the bot, just from knowing their `@handle`.
- **By numeric Telegram user id**, as a plain unprefixed key — the only
  option for a user with no public username (it's optional in Telegram, so
  there's nothing to whitelist them by otherwise). The bot's own rejection
  message includes the user's id, so it can be relayed to you for this. No
  collision risk with usernames — a Telegram username can never be purely numeric.

```bash
npx wrangler kv namespace create WHITELIST --env dev
npx wrangler kv namespace create WHITELIST --env prod

# --remote is required — kv key put/get/list default to a LOCAL simulated
# store otherwise, which silently does nothing to the real deployed bot.

# By username (value is unused, just needs to exist)
npx wrangler kv key put --binding=WHITELIST "someusername" "1" --env dev --remote

# By id (get the number from the bot's own rejection message)
npx wrangler kv key put --binding=WHITELIST "123456789" "1" --env dev --remote
```

### Rolling back

Cloudflare keeps a history of every deployment per Worker — the fastest revert is
`npx wrangler rollback --env dev` (or `--env prod`), which instantly swaps the live
Worker back to its previous deployment without going through CI. To redeploy an
older *tagged* prod version from source instead, use the manual dispatch flow in
[Promoting a commit to prod](#promoting-a-commit-to-prod), picking that older tag.
