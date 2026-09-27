# Instructions for Claude Code

## Working with the engineer

- **Answer questions before acting.** A question ("can you …?", "should we
  …?", "isn't … overkill?", "what about …?", "which is better?") is not a
  command. Answer it, give options with a recommendation, then wait.
- Pushback ("I'm not buying it", "that's wrong") is also not a go-ahead. Check
  the reasoning again and ask what the engineer expected.
- Change files only after a clear instruction ("do it", "go with option 1",
  "yes"). Reading code to support an answer is fine.
- A recommendation you made is not approved until the engineer picks it.

## Code structure (binding)

Follow [docs/CODE_STRUCTURE.md](docs/CODE_STRUCTURE.md) for every change:
- pure rules in `domain/` and `output/`; input and output only in `adapters/`;
  `app/` connects them;
- `domain/` and `output/` never import from `app/` or `adapters/`;
- functions by default, classes only for state or a replaceable part;
- check data once at the edge, then use typed values (no `!`);
- results are unions with an `ok` field;
- files read top down: the main exported function first.

New files go to their target folder in that doc. When you move a file, update
its status in the "Where each file goes" table. Never mix file moves and logic
changes in one commit.

## Comments

- Word comments like Microsoft MSDN docs ("Represents …", "Returns …").
- Use `//` comments, never `/** */`.
- Every name must explain itself: types, functions, variables, fields,
  files. If a name needs a comment, rename it instead.
- So fields get no comments: their names explain them.
- Simple English: short sentences, common words.

## Commands

- `npm run typecheck`: check the types.
- `npx vitest run tests/unit`: the offline tests.
- `npm test`: all tests, including the live ones. They call the real Gemini
  API and use the dev Gemini quota, which the dev bot shares.

## Prod changes

- Before a prod deployment, list every change prod needs (for example a D1
  schema change), step by step, with the exact commands, so the engineer can
  run them.
- Never run anything on prod yourself.

## Live systems

- Never change live secrets, webhooks, tokens or settings (Telegram,
  Cloudflare, GitHub) without asking first. This is also true for a quick fix
  while debugging.
- Before asking, say exactly what the command will change. (Once, a
  `setWebhook` call without the `secret_token` cleared Telegram's secret, and
  every webhook call failed with 401.)

## Webhook rule

- Every Telegram handler answers 200 after the auth check, even when something
  fails inside. See ADR-8 in
  [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md).

## Other docs

- [README.md](README.md): setup, tests, CI/CD and deployment.
- [docs/PRODUCT.md](docs/PRODUCT.md): features, and what is planned next.
- [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md): why the main parts work the way they do.
- [docs/EDGE_CASES.md](docs/EDGE_CASES.md): the general rules for dates, calendars and time zones.
- [docs/USER_QUOTA_DESIGN.md](docs/USER_QUOTA_DESIGN.md): the quota and its D1 cost.
