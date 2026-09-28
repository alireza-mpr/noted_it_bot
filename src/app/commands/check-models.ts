import { logUserActivity } from "../../adapters/logging/user-activity";
import type { ModelFailure } from "../../adapters/models/model-result";
import type { Router } from "../../adapters/models/router";
import type { Replier } from "../../adapters/telegram/replier";

const PING_PROMPT = "Reply with exactly the single word: PONG";
const PING_ANSWER = "PONG";

// Replies to /diag: asks the models to answer "PONG", and replies "Models:
// OK", or "Models: Broken" with the problem, e.g. "Models: Broken
// (rate-limited)". The reply is in English, because /diag is for developers.
export async function checkModels(
  router: Pick<Router, "ask">,
  replier: Replier,
): Promise<void> {
  const modelCheck = await modelCheckOf(router);
  logUserActivity("models_checked", {
    "user_activity.outcome": outcomeOf(modelCheck),
  });
  await replier.sendText(
    modelCheck.ok ? "Models: OK" : `Models: Broken (${modelCheck.problem})`,
  );
}

// Represents the result of the check: a model answered "PONG", or the
// problem, e.g. "rate-limited" when no model answered.
type ModelCheck =
  | { ok: true }
  | { ok: false; problem: ModelFailure["kind"] | "unexpected-answer" };

async function modelCheckOf(router: Pick<Router, "ask">): Promise<ModelCheck> {
  const modelResult = await router.ask({
    systemPrompt: null,
    userPrompt: PING_PROMPT,
    responseSchema: null,
  });
  if (!modelResult.ok) {
    return { ok: false, problem: modelResult.kind };
  }
  return modelResult.text.trim() === PING_ANSWER
    ? { ok: true }
    : { ok: false, problem: "unexpected-answer" };
}

// Returns the check's outcome for the logs. The router's own events say why
// no model answered.
function outcomeOf(
  modelCheck: ModelCheck,
): "ok" | "no_model" | "unexpected_answer" {
  if (modelCheck.ok) {
    return "ok";
  }
  return modelCheck.problem === "unexpected-answer"
    ? "unexpected_answer"
    : "no_model";
}
