# noted_it

Telegram bot (`@noted_it_dev_bot`) running on Cloudflare Workers. Replies to `/hi` with
`Hi {userName}, current time is: {current time}`.

## How it works

Telegram calls the Worker's URL as a webhook for every update (no polling, no
always-on process). [src/index.ts](src/index.ts) verifies the request came from
Telegram (via a shared secret token), and if the message is `/hi`, calls the Bot
API directly to reply.

## Local dev

```bash
npm install
npx wrangler secret put BOT_TOKEN      # paste the token from secrets/dev.json
npx wrangler secret put WEBHOOK_SECRET # any random string
npm run dev
```

`wrangler dev` gives you a local/tunnel URL — point Telegram's webhook at it with:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=<your dev URL>" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

## CI/CD

- `.github/workflows/ci.yml` — installs deps and typechecks on every push/PR.
- `.github/workflows/deploy.yml` — on push to `main`, deploys to Cloudflare Workers
  and re-points the Telegram webhook at it.

### One-time setup (GitHub repo secrets)

| Secret                 | Where it comes from                                           |
|-------------------------|----------------------------------------------------------------|
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dashboard → My Profile → API Tokens (Workers edit)  |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID             |
| `BOT_TOKEN`             | `secrets/dev.json` (`noted_it_dev_bot_token`) — never commit this file |
| `WEBHOOK_SECRET`        | Any random string you generate once (e.g. `openssl rand -hex 32`) |
| `WORKER_URL`            | `https://noted-it-dev-bot.<your-subdomain>.workers.dev` (visible after first deploy) |

`secrets/` is gitignored and must never be committed.
