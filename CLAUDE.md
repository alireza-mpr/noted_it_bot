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
- Use the Read tool to read files and the Edit tool to change them, so the
  engineer sees clear diffs. Use Bash only to search many files, run tests,
  and run git. No `cat`, `sed` or Python scripts to read or edit files, except
  for a mechanical rename across many files.

## Code structure (binding)

Follow [docs/CODE_STRUCTURE.md](docs/CODE_STRUCTURE.md) for every change:
- pure rules in `domain/` and `output/`; input and output only in `adapters/`;
  `app/` connects them;
- generic helpers any app could use (e.g. do date math, convert data, format
  text) in `generic/`, which imports nothing of ours; decisions about this bot
  stay in `domain/`;
- `domain/` and `output/` never import from `app/` or `adapters/`;
- separation of concerns: one idea per module, from
  docs/UBIQUITOUS_LANGUAGE.md; check every new export belongs to the file's
  idea. A data file (named after a glossary noun) holds a type and plain
  calculations. A rule file (`*-rule.ts`) holds one product rule from
  docs/EDGE_CASES.md. "Rule" never names data;
- follow SOLID, including open/closed: add behaviour by adding code (e.g. a
  new adapter behind a port), not by changing working code;
- functions by default, classes only for state or a replaceable part;
- check data once at the edge, then use typed values (no `!`);
- `T | null` for things that are optional by nature (e.g. a location); if
  `null` would always mean one case, name that case with a `kind` instead
  (e.g. `{ kind: "floating" }`); `?`/`undefined` only for optional parameters
  and options; raw outside data is converted once, at the edge;
- results are unions with an `ok` field;
- casing: camelCase for variables and functions, PascalCase for types,
  UPPER_SNAKE_CASE for constants, kebab-case for files, folders and `kind`
  values (see "Casing" in docs/CODE_STRUCTURE.md);
- files read top down, after the imports: private constants, then exported
  types, then exported functions (the main one first), then private functions
  and types.

## Comments

| Kind | Where | Form |
|---|---|---|
| **What** | Above a type or function | One line, e.g. "Returns …" or "Represents …". |
| **Why** | Inside the body, on the line it explains | Only when the code would look wrong without it. |
| **How** | Nowhere | If the code needs it, split it into functions with clear names. |
| **Product rules** (e.g. the year rule, the time zone order) | [docs/EDGE_CASES.md](docs/EDGE_CASES.md) | The comment names the rule, e.g. "See 'A missing year' in EDGE_CASES.md". |

- Word comments like Microsoft MSDN docs ("Represents …", "Returns …").
- Use `//` comments, never `/** */`.
- Every name must explain itself: types, functions, variables, fields,
  files. If a name needs a comment, rename it instead.
- So fields get no comments: their names explain them.
- Variable names follow their type, in camelCase (e.g. `calendarEventResult:
  CalendarEventResult`). When several values have the same type, the role comes first
  (e.g. `startDate`, `untilDate`). No generic names (`data`, `result`,
  `answer`) and no one-letter names, except a loop index.
- Simple English: short sentences, common words.
- Names use the words in
  [docs/UBIQUITOUS_LANGUAGE.md](docs/UBIQUITOUS_LANGUAGE.md).
- Mark every example with "e.g.", e.g. `// e.g. "tomorrow": not supported yet`.

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
  [docs/ARCHITECTURE_DECISIONS_REGISTRY.md](docs/ARCHITECTURE_DECISIONS_REGISTRY.md).

## Other docs

- [README.md](README.md): setup, tests, CI/CD and deployment.
- [docs/PRODUCT.md](docs/PRODUCT.md): features, and what comes next.
- [docs/ARCHITECTURE_DECISIONS_REGISTRY.md](docs/ARCHITECTURE_DECISIONS_REGISTRY.md): why the main parts work the way they do; the quota and its D1 cost.
- [docs/EDGE_CASES.md](docs/EDGE_CASES.md): the general rules for dates, calendars and time zones.
- [docs/UBIQUITOUS_LANGUAGE.md](docs/UBIQUITOUS_LANGUAGE.md): the words we use, and the words we don't.

Docs describe the current bot. Keep what was learnt (edge cases, user
behaviour, technical challenges); leave out history (old code, what replaced
what, finished migrations).
