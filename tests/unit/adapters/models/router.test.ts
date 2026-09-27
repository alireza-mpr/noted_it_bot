import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Model } from "../../../../src/adapters/models/model";
import type {
  ModelAnswer,
  ModelFailure,
  ModelRequest,
  ModelResult,
} from "../../../../src/adapters/models/model-result";
import type { ModelUsageStore } from "../../../../src/adapters/models/model-usage-store";
import type { ProviderClient } from "../../../../src/adapters/models/provider-client";
import { Router } from "../../../../src/adapters/models/router";
import { modelAnswerOf } from "./model-answer-of";

const MODEL_REQUEST: ModelRequest = { systemPrompt: null, userPrompt: "ping", responseSchema: null };
const LIMITS = { requestsPerMinute: 1, tokensPerMinute: 1, requestsPerDay: 1 };
const GEMINI_A: Model = { provider: "gcp.gemini", name: "gemini-a", limits: LIMITS };
const GEMINI_B: Model = { provider: "gcp.gemini", name: "gemini-b", limits: LIMITS };
const GROQ_A: Model = { provider: "groq", name: "groq-a", limits: LIMITS };

const UNAVAILABLE: ModelFailure = { ok: false, kind: "unavailable", httpStatus: 503, detail: "busy" };
const UNAUTHORIZED: ModelFailure = { ok: false, kind: "unauthorized", httpStatus: 401, detail: "bad key" };
const SERVER_ERROR: ModelFailure = { ok: false, kind: "server-error", httpStatus: 500, detail: "oops" };

// Represents a provider client that gives each model a fixed result, and
// remembers which models it called.
class FakeProviderClient implements ProviderClient {
  readonly calledModelNames: string[] = [];

  constructor(private readonly modelResultByName: Record<string, ModelResult | Error>) {}

  async call(model: Model): Promise<ModelResult> {
    this.calledModelNames.push(model.name);
    const modelResult = this.modelResultByName[model.name];
    if (modelResult instanceof Error) {
      throw modelResult;
    }
    return modelResult;
  }
}

// Represents a model usage store in memory: every model is available, and
// each record is kept as a line of text.
class FakeModelUsageStore implements ModelUsageStore {
  readonly records: string[] = [];

  constructor(private readonly models: readonly Model[]) {}

  async availableModels(): Promise<readonly Model[]> {
    return this.models;
  }

  async recordAnswer(modelAnswer: ModelAnswer): Promise<void> {
    this.records.push(`answer ${modelAnswer.model.name}`);
  }

  async recordFailure(model: Model, modelFailure: ModelFailure): Promise<void> {
    this.records.push(`${modelFailure.kind} ${model.name}`);
  }
}

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

describe("Router", () => {
  it("returns the first answer, after the models that failed, and records each result", async () => {
    const geminiAnswer = modelAnswerOf(GEMINI_B);
    const geminiClient = new FakeProviderClient({ "gemini-a": UNAVAILABLE, "gemini-b": geminiAnswer });
    const groqClient = new FakeProviderClient({});
    const geminiUsageStore = new FakeModelUsageStore([GEMINI_A, GEMINI_B]);
    const router = new Router([
      { providerClient: geminiClient, modelUsageStore: geminiUsageStore },
      { providerClient: groqClient, modelUsageStore: new FakeModelUsageStore([GROQ_A]) },
    ]);

    expect(await router.ask(MODEL_REQUEST)).toBe(geminiAnswer);
    expect(geminiClient.calledModelNames).toEqual(["gemini-a", "gemini-b"]);
    expect(geminiUsageStore.records).toEqual(["unavailable gemini-a", "answer gemini-b"]);
    expect(groqClient.calledModelNames).toEqual([]);
  });

  it("skips the rest of a provider after a bad API key, and tries the next provider", async () => {
    const groqAnswer = modelAnswerOf(GROQ_A);
    const geminiClient = new FakeProviderClient({ "gemini-a": UNAUTHORIZED });
    const router = new Router([
      { providerClient: geminiClient, modelUsageStore: new FakeModelUsageStore([GEMINI_A, GEMINI_B]) },
      { providerClient: new FakeProviderClient({ "groq-a": groqAnswer }), modelUsageStore: new FakeModelUsageStore([GROQ_A]) },
    ]);

    expect(await router.ask(MODEL_REQUEST)).toBe(groqAnswer);
    expect(geminiClient.calledModelNames).toEqual(["gemini-a"]);
  });

  it("returns the last failure when no model answers", async () => {
    const router = new Router([
      { providerClient: new FakeProviderClient({ "gemini-a": UNAVAILABLE }), modelUsageStore: new FakeModelUsageStore([GEMINI_A]) },
      { providerClient: new FakeProviderClient({ "groq-a": SERVER_ERROR }), modelUsageStore: new FakeModelUsageStore([GROQ_A]) },
    ]);

    expect(await router.ask(MODEL_REQUEST)).toBe(SERVER_ERROR);
  });

  it("calls beforeFirstTry once, just before the first model", async () => {
    const geminiClient = new FakeProviderClient({ "gemini-a": UNAVAILABLE, "gemini-b": modelAnswerOf(GEMINI_B) });
    const router = new Router([
      { providerClient: geminiClient, modelUsageStore: new FakeModelUsageStore([GEMINI_A, GEMINI_B]) },
    ]);
    const beforeFirstTry = vi.fn(async () => {
      expect(geminiClient.calledModelNames).toEqual([]);
    });

    await router.ask(MODEL_REQUEST, beforeFirstTry);

    expect(beforeFirstTry).toHaveBeenCalledOnce();
  });

  it("says that no model is under its limits when every model is used up, without calling beforeFirstTry", async () => {
    const router = new Router([
      { providerClient: new FakeProviderClient({}), modelUsageStore: new FakeModelUsageStore([]) },
    ]);
    const beforeFirstTry = vi.fn(async () => {});

    expect(await router.ask(MODEL_REQUEST, beforeFirstTry)).toMatchObject({
      ok: false,
      kind: "rate-limited",
      detail: "no model is under its limits",
    });
    expect(beforeFirstTry).not.toHaveBeenCalled();
  });

  it("turns a thrown error into an internal failure", async () => {
    const router = new Router([
      { providerClient: new FakeProviderClient({ "gemini-a": new Error("boom") }), modelUsageStore: new FakeModelUsageStore([GEMINI_A]) },
    ]);

    expect(await router.ask(MODEL_REQUEST)).toEqual({
      ok: false,
      kind: "internal",
      httpStatus: null,
      detail: "Error: boom",
    });
  });
});
