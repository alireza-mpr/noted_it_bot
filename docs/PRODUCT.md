# Noted — Product Feature List & Backlog

Noted is a Telegram bot: forward it any message that contains an event and it
replies with a one-tap "add to Google Calendar" link plus a calendar file.
Status: **Beta**. Runs on Cloudflare Workers, with Gemini doing the extraction.

## Delivered

### Core: message → calendar event
- Accepts plain text **and media messages with captions** (e.g. a forwarded
  channel post with a flyer image) — the caption is used when there's no text.
- Extracts a structured event via Gemini: title, date, start/end time,
  timezone hint, location, confidence.
- Explicit dates only for now ("19 Sep, 8pm"); relative dates ("tomorrow") are
  deliberately not guessed.
- Times default to Australian Eastern time (Sydney/Melbourne) unless the
  message states another timezone.
- Works for non-Latin scripts (Persian tested end to end).

### Recurring events
- Understands explicit repetition — "every Thursday", "every 2 weeks", "first
  Friday of the month", "monthly on the 15th", "for 6 weeks", "until 29 Nov" —
  in English and Persian. A list of separate dates is deliberately not treated
  as a repeat.
- A pattern with no start date ("every Thursday at 7:30pm") starts on the next
  matching day from today; a stated start date is moved to the first date that
  fits the pattern.
- Series with no end date stay open-ended (no cap).
- The `.ics` file carries the full repeat rule (timezone-aware, so events keep
  their local time across daylight saving; verified in Google Calendar).
- **Phones:** Google's mobile app ignores repeats in the link and adds a single
  event, so for repeating events the file is the dependable route. The caption
  says so, and `/start` explains it.
- If the repeat rule is unclear or invalid (low confidence, end before start,
  a pattern that doesn't say which days), the bot declines with a message
  rather than guess and fill a calendar wrongly.

### Calendar output
- **One-tap Google Calendar link**, plus an **`.ics` file** for Apple Calendar,
  Outlook, or anything else.
- Valid RFC 5545 output: timezone-aware events, all-day events when no time is
  given (with a note explaining why), long lines folded correctly so
  multi-byte titles don't break strict calendar apps.
- **Stable event UID**: a hash of the source message, so re-forwarding the same
  message updates the existing calendar entry instead of duplicating it.
- Chat summary above the link: 📌 title, 🗓️ date and time range, then a bold
  🔔 call-to-action with the link set apart in `{ }`.

### Multilingual replies
- The bot speaks a fixed list of 16 languages (English, Persian, Arabic, Spanish, French,
  German, Italian, Portuguese, Russian, Turkish, Chinese, Japanese, Korean, Hindi, Dutch,
  Polish), in the user's Telegram language unless they pick one. Every fixed message is
  translated ahead of time and shipped with the bot, so choosing a language never calls a
  model. Anything else falls back to English.
- `/lang <language>` — set your language by name or code ("Persian", "fa", "فارسی");
  `/lang auto` returns to Telegram's setting; `/lang` shows the current one
  (shown by its own name, e.g. "فارسی").
- Dates and times in the summary follow the reply language, always Gregorian.
- `/tz` — set your time zone on a web page the bot links to. The page detects the
  device's zone and asks for a one-tap confirmation, or lets the user search the full
  list. The link works for one minute. No model is involved, so it can't be abused to
  run up the LLM quota. An exact zone name typed after `/tz` is applied directly.
- The bot's own name ("Noted") is never translated.

### Access control
- Open to everyone, with a per-user daily quota (`appConfig.dailyQuota`, currently 5 messages that go to a model).
  Commands don't use quota, and a message no model answers is given back. See
  [USER_QUOTA_DESIGN.md](USER_QUOTA_DESIGN.md).

### Commands
| Command  | Purpose                                                        |
|----------|----------------------------------------------------------------|
| `/start` | Intro and what the bot does                                    |
| `/lang`  | Show or change reply language                                  |
| `/tz`    | Set your time zone on a web page (or an exact zone name)       |
| `/ver`   | Show the running version                                       |
| `/diag`  | Gemini connectivity check (hidden — not in the `/` menu)       |

The visible commands are registered with Telegram on every deploy so they
appear in the `/` autocomplete menu.

### Reliability & observability
- Always acknowledges Telegram updates (so one failure can never block the
  update queue); users see a generic error, details go to logs.
- Workers Logs enabled, and every event also sent to Axiom with the user's id, username and first name.
- Message log (message, model answer, model) kept in Axiom, as disclosed in `/start`.
- User activity (commands, language and time zone changes, event requests, quota refusals, blocking and
  unblocking the bot) logged as `user activity` events.

### Delivery pipeline
- Two fully separate environments (own bot, Worker, D1 database, secrets):
  **dev** (`@noted_it_dev_bot`) and **prod** (`@noted_it_bot`).
- CI on every push: typecheck + tests against the real Gemini API.
- **dev** auto-deploys on every push to `main`, versioned
  `0.0.{run}-beta-{commit}` and auto-tagged with that same string.
- **prod** is deployed only by deliberate manual trigger against a `v0.x.y`
  tag; its `/ver` equals the tag. Fast rollback via `wrangler rollback`.
- Secrets live in GitHub Environments; setup, promotion, and rollback steps
  are documented in the README.

## Backlog

### Next up
- [ ] **Multi-model routing layer (cost control).** AI-native architectures
      enforce a strict pay-per-compute reality where inefficient data pipelines
      directly inflate cloud bills. Implement a multi-model routing layer that
      sends simple classification and extraction tasks to cheaper, faster
      models and reserves expensive frontier models strictly for complex
      reasoning.
  - Today every call (event extraction, translation, language-name resolution)
    uses the same single model — nothing is routed.
  - Introduce a small router: task type → model tier (e.g. Flash-Lite tier for
    translation and language resolution, a mid tier for extraction, a frontier
    tier only for genuinely hard cases such as ambiguous or multi-event
    messages).
  - Add an escalation path: try the cheap model first, and re-run on a stronger
    model only when confidence is low or the output fails schema validation.
  - Log model used and token counts per call so savings are measurable
    (Gemini spend is real — this account is on prepaid billing).
  - Review Gemini "thinking" token overhead on tasks that don't need it.
  - Extend the test suite to assert quality doesn't regress on the cheaper tiers.
- [ ] **Confirm the first prod release** under the new versioning scheme (tag →
      manual dispatch → webhook and command list registered) and smoke-test `@noted_it_bot`.

### Product
- [ ] Relative and weekday dates ("tomorrow", "next Friday") — needs a reliable
      reference date (message timestamp) and clear handling of ambiguity.
- [ ] Jalali/Persian calendar dates (schema already classifies them; calendar
      generation currently declines).
- [ ] Use the per-user timezone (stored by `/tz`) when building events, instead of the fixed
      Australian default; today it is saved but not read.
- [ ] Multiple events in one message.
- [ ] Recurring events written with Jalali/Persian calendar dates (recurrence itself is done).

### Platform & ops
- [ ] Migrate event extraction off the legacy Gemini `generateContent` endpoint
      to the Interactions API once structured output is verified there.
- [ ] Automate `package.json` version bumps alongside prod tags (currently manual).
- [ ] Prod approval gate proper — needs a paid GitHub plan on a private repo;
      manual dispatch is the interim guard.
- [ ] Dev tag housekeeping — one tag per dev deploy will accumulate.
- [ ] Broaden tests further: handler flow, translation placeholders
      (recurrence and ICS output now have unit tests).
