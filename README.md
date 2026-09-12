# noted_it

Telegram bot running on Cloudflare Workers, in two environments:

| Env  | Telegram bot          | Worker name        | Deploys on                          |
|------|------------------------|---------------------|--------------------------------------|
| dev  | `@noted_it_dev_bot`    | `noted-it-dev-bot`  | every push to `main`                 |
| prod | `@noted_it_bot`        | `noted-it-bot`      | pushing a version tag (`v1.2.0`)     |

Replies to `/hi` with `Hi {userName}, current time is: {current time}`.

## How it works

Telegram calls the Worker's URL as a webhook for every update (no polling, no
always-on process). [src/index.ts](src/index.ts) verifies the request came from
Telegram (via a shared secret token), and if the message is `/hi`, calls the Bot
API directly to reply.

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
  - `deploy-dev` runs on every push to `main`.
  - `deploy-prod` runs only when a `v*.*.*` tag is pushed (e.g. `git tag v1.0.0 && git push origin v1.0.0`).
  - Each deploys via `wrangler` to its own Worker and re-points that environment's
    Telegram webhook at it.

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
share a `BOT_TOKEN` by accident, and prod can later get a required-reviewers
approval gate if you want one.

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

### Rolling back

Cloudflare keeps a history of every deployment per Worker — the fastest revert is
`npx wrangler rollback --env dev` (or `--env prod`), which instantly swaps the live
Worker back to its previous deployment without going through CI. To redeploy an
older *tagged* prod version from source instead, re-run that tag's GitHub Actions
run (or push a new tag pointing at the old commit).
