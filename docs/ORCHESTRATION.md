# LLM Orchestration

Noted uses large language models (LLMs) inside a flow that **our code
controls**. The models only read messages. Our code decides which model to
ask, when to ask again, which answer to trust, and does every date
calculation. This is orchestration, not an agent: the model never picks the
next step.

It has two parts, both common patterns: a **failover chain** (try the next
model when one fails) and a **confidence-based model cascade** (try a cheap
model first, and a stronger one only when the cheap answer is unsure).

## The principle: the model reads, our code decides

| The model does | Our code does |
|---|---|
| Reads a message and returns a structured draft (JSON): title, date as written, time, place, time zone, repeat, confidence | Picks the model, retries, escalates, and checks the answer's shape |
| Says which calendar a date is in, and which kind of relative date it is ("tomorrow", "next Friday") | Converts calendars, adds a missing year, counts relative dates, works out repeats |
| Never works out a date | Owns every rule, with offline tests (550+) |

Small models often get weekday math and calendar conversion wrong, and a wrong
date looks like a right one. So the model classifies, and our code counts.
See [EDGE_CASES.md](EDGE_CASES.md).

## One message, end to end

```
message
   |
   v
+----------------------------------------------------------------+
| 1. Failover: try light models first, then the next free model  |
|    gemini-3.1-flash-lite -> gemini-3.5-flash-lite -> ...       |
+----------------------------------------------------------------+
   |  a draft (JSON) + the model's confidence
   v
   from a light model, and confidence < 0.7 ?
   |                         |
   | no                      | yes
   |                         v
   |   +---------------------------------------------------------+
   |   | 2. Cascade: ask again, strong models only               |
   |   |    usable answer?  -> use it                            |
   |   |    none, or bad?   -> keep the first answer             |
   |   +---------------------------------------------------------+
   |                         |
   v                         v
+----------------------------------------------------------------+
| 3. Our rules: calendars, the year, relative dates, repeats,    |
|    time zones -> a calendar event, or why there is none        |
+----------------------------------------------------------------+
   |
   v
reply: Google Calendar link + .ics file
```

## 1. A failover chain: 9 free models from 2 providers

The free model plans have small limits per model: requests per minute,
requests per day, tokens per minute. One model runs out within hours. So a
router (`src/adapters/models/router.ts`) tries the models in a fixed order,
and moves on when one fails.

| Tier | Models | Free limit per model |
|---|---|---|
| **light** | `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, Groq `gpt-oss-20b` | 500–1,000 requests a day |
| **strong** | 5 Gemini flash models, Groq `gpt-oss-120b` | 20 requests a day (Gemini), 1,000 (Groq) |

- **Usage is counted per model in D1, in each provider's own windows** (e.g.
  Gemini's day ends at midnight Pacific time). A model at its limit is skipped
  without a call.
- **Each error gets its own reaction:** a rate limit marks the model as used
  up for the minute or the day; a bad API key skips the whole provider; a
  timeout (12 s) or any other error moves to the next model.
- **Only `src/adapters/models/providers/` knows Gemini and Groq.** A new
  provider is a new adapter behind the same port.

Details: ADR-4 in
[ARCHITECTURE_DECISIONS_REGISTRY.md](ARCHITECTURE_DECISIONS_REGISTRY.md) and
"Models and routing" in [DEVELOPMENT.md](DEVELOPMENT.md#models-and-routing).

## 2. A model cascade: a second opinion for unsure answers

A **model cascade** sends each request to a cheap model first, and moves up
to a stronger, more expensive model only when the cheap answer isn't good
enough. Most requests stop at the first step, so strong models are used only
where they help. In the code, moving up a step is called **escalation**.

Noted's cascade has two steps, and its check is the model's own confidence:
light models are fast and have high limits, so they answer first. When a
light model's draft has a confidence below `APP_CONFIG.escalateBelowConfidence`
(0.7), our code asks again, this time of **strong models only**
(`RouteOptions.onlyTier`).

| Case | Answer used |
|---|---|
| A strong model gives a usable answer | The strong answer, even if it is unsure too: it is the better guess |
| No strong model is free (all used up) | The first answer |
| The strong answer is not usable (bad JSON, wrong shape) | The first answer |
| The first answer came from a strong model | The first answer: no escalation |

So escalation never makes a reply worse than without it. It costs one more
model call, only for unsure messages; for the user, a message is still one
unit of their daily quota. Code: `extractDraft` in
`src/adapters/models/extraction/extract-draft.ts`. Decision: ADR-11.

**A cascade is only as good as its check.** The model's own confidence is
free, but small models are often sure and wrong. Stronger checks, from
cheapest: rules on the answer (e.g. a date with no calendar), asking the
cheap model twice and comparing (self-consistency), or a scorer model that
judges the answer. The best-known example of the pattern is the FrugalGPT
paper (Stanford, 2023), which used a learned scorer as its check.

**A cascade is not a router.** A router picks one model *before* any call, by
guessing how hard the request is. A cascade decides *after* the cheap answer,
by judging it. Noted's router is a failover chain: it moves on when a model
fails, not when a request is hard.

## Why orchestration, not an agent

| | Orchestration (Noted) | An agent |
|---|---|---|
| Who decides the next step | Our code | The model, in a loop with tools |
| Calls per message | 1, sometimes 2 | Many |
| Cost on free limits | Known and small | Hard to predict |
| Testing | Every path is known, and tested offline | Paths change from run to run |
| A wrong date in a calendar | Prevented by our rules | Depends on the model |

The task is well defined (a message in, a calendar event out), the model
quotas are free and small, and a wrong date is worse than no event. A fixed
flow with clear fallbacks fits all three.

## Measuring and tuning

Every step is logged with OpenTelemetry names, in Axiom:

| Log event | What it shows |
|---|---|
| `router.model_tried`, `router.model_answered`, `router.model_failed` | Each model call, its tokens, and why it failed |
| `extraction.completed` | The message, the answer used, its model, and the outcome |
| `extraction.escalated` | Both models, both confidences, and which answer was used |

**Tuning 0.7:** the limit is a first guess. The right value is where the light
models' answers stop being reliable, within the strong models' small daily
budget (about 100 Gemini calls a day, shared with failover). How often each
escalation outcome happens:

```
['app-logs'] | where eventName == "extraction.escalated"
| summarize count() by ['extraction.escalation_outcome'], bin(['extraction.first_confidence'], 0.1)
```

What comes next is in the "Orchestration" section of the backlog, in
[PRODUCT.md](PRODUCT.md#orchestration).
