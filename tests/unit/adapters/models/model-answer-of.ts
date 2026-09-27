import type { Model } from "../../../../src/adapters/models/model";
import type { ModelAnswer } from "../../../../src/adapters/models/model-result";

// Returns an answer of the model that used totalTokens: all but one of them
// as input.
export function modelAnswerOf(model: Model, totalTokens = 10): ModelAnswer {
  return {
    ok: true,
    model,
    text: "Pong",
    inputTokens: totalTokens - 1,
    outputTokens: 1,
    totalTokens,
    dailyRequests: null,
  };
}
