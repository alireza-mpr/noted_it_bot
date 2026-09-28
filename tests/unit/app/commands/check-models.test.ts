import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ModelRequest, ModelResult } from "../../../../src/adapters/models/model-result";
import { GEMINI_MODELS } from "../../../../src/adapters/models/providers/model-list";
import { checkModels } from "../../../../src/app/commands/check-models";
import { axiomEventsOf } from "../../adapters/logging/axiom-events-of";
import { modelAnswerOf } from "../../adapters/models/model-answer-of";
import { FakeReplier } from "../fake-replier";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Runs /diag with a router that gives the model result. Returns the reply,
// the request the models got, and the outcome in the logs.
async function checkModelsWith(modelResult: ModelResult) {
  const modelRequests: ModelRequest[] = [];
  const fakeRouter = {
    ask: async (modelRequest: ModelRequest) => {
      modelRequests.push(modelRequest);
      return modelResult;
    },
  };
  const fakeReplier = new FakeReplier();
  const logEvents = await axiomEventsOf(() => checkModels(fakeRouter, fakeReplier));
  const modelsCheckedEvent = logEvents.find((logEvent) => logEvent.eventName === "user_activity.models_checked");
  return {
    replyTexts: fakeReplier.texts,
    modelRequests,
    loggedOutcome: modelsCheckedEvent?.["user_activity.outcome"],
  };
}

describe("checkModels", () => {
  it("replies OK when a model answers PONG", async () => {
    const { replyTexts, modelRequests, loggedOutcome } = await checkModelsWith({
      ...modelAnswerOf(GEMINI_MODELS[0]),
      text: " PONG\n",
    });

    expect(replyTexts).toEqual(["Models: OK"]);
    expect(modelRequests).toEqual([
      { systemPrompt: null, userPrompt: "Reply with exactly the single word: PONG", responseSchema: null },
    ]);
    expect(loggedOutcome).toBe("ok");
  });

  it("replies Broken with the failure when no model answers", async () => {
    const { replyTexts, loggedOutcome } = await checkModelsWith({
      ok: false,
      kind: "rate-limited",
      limitWindow: null,
      retryAfterSeconds: null,
      httpStatus: null,
      detail: "no model is under its limits",
    });

    expect(replyTexts).toEqual(["Models: Broken (rate-limited)"]);
    expect(loggedOutcome).toBe("no_model");
  });

  it("replies Broken when a model answers something else", async () => {
    const { replyTexts, loggedOutcome } = await checkModelsWith({
      ...modelAnswerOf(GEMINI_MODELS[0]),
      text: "Pong!",
    });

    expect(replyTexts).toEqual(["Models: Broken (unexpected-answer)"]);
    expect(loggedOutcome).toBe("unexpected_answer");
  });
});
