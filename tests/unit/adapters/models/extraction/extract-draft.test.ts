import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EVENT_ANSWER_SCHEMA } from "../../../../../src/adapters/models/extraction/event-answer-schema";
import { extractDraft } from "../../../../../src/adapters/models/extraction/extract-draft";
import type { ModelFailure, ModelRequest, ModelResult } from "../../../../../src/adapters/models/model-result";
import { GEMINI_MODELS } from "../../../../../src/adapters/models/providers/model-list";
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

// Represents a router that gives a fixed result, and remembers the request.
class FakeRouter {
  readonly modelRequests: ModelRequest[] = [];

  constructor(private readonly modelResult: ModelResult) {}

  async ask(modelRequest: ModelRequest): Promise<ModelResult> {
    this.modelRequests.push(modelRequest);
    return this.modelResult;
  }
}

function answerWithText(text: string): ModelResult {
  return { ...modelAnswerOf(GEMINI_MODELS[0]), text };
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
    const fakeRouter = new FakeRouter(answerWithText(YOGA_ANSWER_TEXT));

    await extractDraft(fakeRouter, MESSAGE_TEXT);

    expect(fakeRouter.modelRequests).toEqual([
      { systemPrompt: expect.stringContaining("date and time extraction"), userPrompt: MESSAGE_TEXT, responseSchema: EVENT_ANSWER_SCHEMA },
    ]);
  });

  it("returns the draft, and logs the message and the model answer once", async () => {
    let extractionResult: unknown;
    const logEvents = await axiomEventsOf(async () => {
      extractionResult = await extractDraft(new FakeRouter(answerWithText(YOGA_ANSWER_TEXT)), MESSAGE_TEXT);
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
      extractionResult = await extractDraft(new FakeRouter(NO_MODEL), MESSAGE_TEXT);
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
      extractionResult = await extractDraft(new FakeRouter(answerWithText("Sure!")), MESSAGE_TEXT);
    });

    expect(extractionResult).toMatchObject({ ok: false, reason: "unusable-answer" });
    expect(logEvents[0]).toMatchObject({ severityText: "WARN", "extraction.outcome": "unusable_answer" });
  });

  it("says why an answer gives no event", async () => {
    const tomorrowAnswerText = JSON.stringify({ calendar: null, date_kind: "relative", confidence: 0.9 });

    expect(await extractDraft(new FakeRouter(answerWithText(tomorrowAnswerText)), MESSAGE_TEXT)).toMatchObject({
      ok: false,
      reason: "no-event",
      detail: "a relative date",
    });
  });
});
