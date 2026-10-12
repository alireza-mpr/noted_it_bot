import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EVENT_ANSWER_SCHEMA } from "../../../../../src/adapters/models/extraction/event-answer-schema";
import { extractDraft } from "../../../../../src/adapters/models/extraction/extract-draft";
import type { Model } from "../../../../../src/adapters/models/model";
import type { ModelFailure, ModelRequest, ModelResult } from "../../../../../src/adapters/models/model-result";
import { GEMINI_MODELS, GROQ_MODELS } from "../../../../../src/adapters/models/providers/model-list";
import type { RouteOptions } from "../../../../../src/adapters/models/router";
import { axiomEventsOf } from "../../logging/axiom-events-of";
import { modelAnswerOf } from "../model-answer-of";

const MESSAGE_TEXT = "Yoga every Tuesday at 6pm";
const YOGA_ANSWER_TEXT = JSON.stringify({
  title: "Yoga",
  calendar: null,
  date_kind: "weekday",
  start_time: "18:00",
  recurrence: { frequency: "weekly", interval: 1, weekdays: ["TU"], end_kind: "never" },
  confidence: 0.9,
});
const NO_MODEL: ModelFailure = {
  ok: false,
  kind: "rate-limited",
  limitWindow: null,
  retryAfterSeconds: null,
  httpStatus: null,
  detail: "no model is under its limits",
};

// Represents a router that gives its results in order, one per ask (the last
// one again after that), and remembers each request and its route options.
class FakeRouter {
  readonly modelRequests: ModelRequest[] = [];
  readonly routeOptionsOfAsks: RouteOptions[] = [];

  constructor(private readonly modelResults: readonly ModelResult[]) {}

  async ask(modelRequest: ModelRequest, _beforeFirstTry?: () => Promise<void>, routeOptions: RouteOptions = {}): Promise<ModelResult> {
    this.modelRequests.push(modelRequest);
    this.routeOptionsOfAsks.push(routeOptions);
    return this.modelResults[Math.min(this.routeOptionsOfAsks.length, this.modelResults.length) - 1];
  }
}

// Returns a router that gives one fixed result.
function routerAnswering(modelResult: ModelResult): FakeRouter {
  return new FakeRouter([modelResult]);
}

// Returns an answer with this text, from the first light Gemini model by default.
function answerWithText(text: string, model: Model = GEMINI_MODELS[0]): ModelResult {
  return { ...modelAnswerOf(model), text };
}

// Returns the yoga answer with this confidence.
function yogaAnswerWith(confidence: number): string {
  return JSON.stringify({ ...JSON.parse(YOGA_ANSWER_TEXT), confidence });
}

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractDraft", () => {
  it("asks the models with the prompt and the answer schema", async () => {
    const fakeRouter = routerAnswering(answerWithText(YOGA_ANSWER_TEXT));

    await extractDraft(fakeRouter, MESSAGE_TEXT);

    expect(fakeRouter.modelRequests).toEqual([
      { systemPrompt: expect.stringContaining("date and time extraction"), userPrompt: MESSAGE_TEXT, responseSchema: EVENT_ANSWER_SCHEMA },
    ]);
  });

  it("returns the draft, and logs the message and the model answer once", async () => {
    let extractionResult: unknown;
    const logEvents = await axiomEventsOf(async () => {
      extractionResult = await extractDraft(routerAnswering(answerWithText(YOGA_ANSWER_TEXT)), MESSAGE_TEXT);
    });

    expect(extractionResult).toMatchObject({ ok: true, draft: { title: "Yoga", repeat: { pattern: { weekdays: ["TU"] } } } });
    expect(logEvents).toEqual([
      expect.objectContaining({
        severityText: "INFO",
        eventName: "extraction.completed",
        "extraction.message_text": MESSAGE_TEXT,
        "extraction.model_answer": YOGA_ANSWER_TEXT,
        "gen_ai.request.model": "gemini-3.1-flash-lite",
        "extraction.outcome": "draft",
        "extraction.problem": null,
      }),
    ]);
  });

  it("says when no model answered", async () => {
    let extractionResult: unknown;
    const logEvents = await axiomEventsOf(async () => {
      extractionResult = await extractDraft(routerAnswering(NO_MODEL), MESSAGE_TEXT);
    });

    expect(extractionResult).toEqual({ ok: false, reason: "no-model", modelFailure: NO_MODEL });
    expect(logEvents[0]).toMatchObject({
      "extraction.message_text": MESSAGE_TEXT,
      "extraction.model_answer": null,
      "extraction.outcome": "no_model",
    });
  });

  it("warns about an answer that is not JSON", async () => {
    let extractionResult: unknown;
    const logEvents = await axiomEventsOf(async () => {
      extractionResult = await extractDraft(routerAnswering(answerWithText("Sure!")), MESSAGE_TEXT);
    });

    expect(extractionResult).toMatchObject({ ok: false, reason: "unusable-answer" });
    expect(logEvents[0]).toMatchObject({ severityText: "WARN", "extraction.outcome": "unusable_answer" });
  });

  it("says why an answer gives no event", async () => {
    // e.g. "this weekend": a relative date the model does not describe.
    const thisWeekendAnswerText = JSON.stringify({ calendar: null, date_kind: "relative", confidence: 0.9 });

    expect(await extractDraft(routerAnswering(answerWithText(thisWeekendAnswerText)), MESSAGE_TEXT)).toMatchObject({
      ok: false,
      reason: "no-event",
      detail: "a relative date the bot does not read yet",
    });
  });
});

describe("extractDraft, an unsure answer", () => {
  const LIGHT_MODEL = GEMINI_MODELS[0];
  const STRONG_MODEL = GEMINI_MODELS[2];
  const UNSURE_LIGHT_ANSWER = answerWithText(yogaAnswerWith(0.5), LIGHT_MODEL);
  const escalationOf = (logEvents: Record<string, unknown>[]) =>
    logEvents.find((logEvent) => logEvent.eventName === "extraction.escalated");

  it("is final when the light model is sure enough, e.g. at the limit", async () => {
    const fakeRouter = routerAnswering(answerWithText(yogaAnswerWith(0.7), LIGHT_MODEL));
    const logEvents = await axiomEventsOf(() => extractDraft(fakeRouter, MESSAGE_TEXT));

    expect(fakeRouter.routeOptionsOfAsks).toEqual([{}]);
    expect(escalationOf(logEvents)).toBeUndefined();
  });

  it("is asked again of a strong model, whose answer is used", async () => {
    const strongAnswer = answerWithText(yogaAnswerWith(0.95), STRONG_MODEL);
    const fakeRouter = new FakeRouter([UNSURE_LIGHT_ANSWER, strongAnswer]);
    let extractionResult: unknown;
    const logEvents = await axiomEventsOf(async () => {
      extractionResult = await extractDraft(fakeRouter, MESSAGE_TEXT);
    });

    expect(fakeRouter.routeOptionsOfAsks).toEqual([{}, { onlyTier: "strong" }]);
    expect(fakeRouter.modelRequests[1]).toEqual(fakeRouter.modelRequests[0]);
    expect(extractionResult).toMatchObject({ ok: true, draft: { confidence: 0.95 }, modelAnswer: { model: STRONG_MODEL } });
    expect(escalationOf(logEvents)).toMatchObject({
      "extraction.first_model": LIGHT_MODEL.name,
      "extraction.first_confidence": 0.5,
      "extraction.strong_model": STRONG_MODEL.name,
      "extraction.strong_confidence": 0.95,
      "extraction.escalation_outcome": "strong_answer_used",
    });
    expect(logEvents.filter((logEvent) => logEvent.eventName === "extraction.completed")).toEqual([
      expect.objectContaining({ "gen_ai.request.model": STRONG_MODEL.name, "extraction.outcome": "draft" }),
    ]);
  });

  it("uses the strong model's answer even when it is unsure too", async () => {
    const unsureStrongAnswer = answerWithText(yogaAnswerWith(0.6), STRONG_MODEL);

    expect(await extractDraft(new FakeRouter([UNSURE_LIGHT_ANSWER, unsureStrongAnswer]), MESSAGE_TEXT)).toMatchObject({
      ok: true,
      draft: { confidence: 0.6 },
    });
  });

  it("keeps the first answer when no strong model answers", async () => {
    let extractionResult: unknown;
    const logEvents = await axiomEventsOf(async () => {
      extractionResult = await extractDraft(new FakeRouter([UNSURE_LIGHT_ANSWER, NO_MODEL]), MESSAGE_TEXT);
    });

    expect(extractionResult).toMatchObject({ ok: true, draft: { confidence: 0.5 }, modelAnswer: { model: LIGHT_MODEL } });
    expect(escalationOf(logEvents)).toMatchObject({
      "extraction.strong_model": null,
      "extraction.strong_confidence": null,
      "extraction.escalation_outcome": "no_strong_model",
    });
  });

  it("keeps the first answer when the strong model's answer is not usable", async () => {
    let extractionResult: unknown;
    const logEvents = await axiomEventsOf(async () => {
      extractionResult = await extractDraft(new FakeRouter([UNSURE_LIGHT_ANSWER, answerWithText("Sure!", STRONG_MODEL)]), MESSAGE_TEXT);
    });

    expect(extractionResult).toMatchObject({ ok: true, draft: { confidence: 0.5 } });
    expect(escalationOf(logEvents)).toMatchObject({ "extraction.escalation_outcome": "strong_answer_unusable" });
  });

  it("uses the limit given in the options instead of APP_CONFIG's", async () => {
    const fakeRouter = new FakeRouter([answerWithText(yogaAnswerWith(0.9), LIGHT_MODEL), answerWithText(YOGA_ANSWER_TEXT, STRONG_MODEL)]);

    await extractDraft(fakeRouter, MESSAGE_TEXT, undefined, { escalateBelowConfidence: 0.95 });

    expect(fakeRouter.routeOptionsOfAsks).toEqual([{}, { onlyTier: "strong" }]);
  });

  it("is final when it already came from a strong model, e.g. Groq's 120b", async () => {
    const fakeRouter = routerAnswering(answerWithText(yogaAnswerWith(0.5), GROQ_MODELS[0]));

    await extractDraft(fakeRouter, MESSAGE_TEXT);

    expect(fakeRouter.routeOptionsOfAsks).toEqual([{}]);
  });
});
