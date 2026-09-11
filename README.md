# noted_it

Hello-world Telegram bot (`@noted_it_dev_bot`).

## Local run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
BOT_TOKEN=$(python -c "import json;print(json.load(open('secrets/dev.json'))['noted_it_dev_bot_token'])") python bot/main.py
```

Then message `/start` to the bot on Telegram.

## CI/CD

- `.github/workflows/ci.yml` — installs deps and sanity-checks the code on every push/PR.
- `.github/workflows/deploy.yml` — placeholder that runs on push to `main`. Hosting target
  (Fly.io, Railway, a VPS, etc.) is not chosen yet — fill in the TODO in that file once decided.

`secrets/` is gitignored and must never be committed — the bot token lives there locally and
should be set as a GitHub Actions secret (`BOT_TOKEN`) for CI/CD.
