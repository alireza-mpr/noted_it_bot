# noted_it

Hello-world Telegram bot (`@noted_it_dev_bot`), written in TypeScript.

## Local run

```bash
npm install
BOT_TOKEN=$(node -p "require('./secrets/dev.json').noted_it_dev_bot_token") npm run dev
```

Then message `/start` to the bot on Telegram.

## CI/CD

- `.github/workflows/ci.yml` — installs deps and builds the TypeScript on every push/PR.
- `.github/workflows/deploy.yml` — placeholder that runs on push to `main`. Hosting target
  (Fly.io, Railway, a VPS, etc.) is not chosen yet — fill in the TODO in that file once decided.

`secrets/` is gitignored and must never be committed — the bot token lives there locally and
should be set as a GitHub Actions secret (`BOT_TOKEN`) for CI/CD.
