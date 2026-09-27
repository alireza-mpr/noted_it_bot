import { describe, expect, it } from "vitest";
import { GROQ_MODELS } from "../../../../../src/adapters/models/providers/model-list";
import { parseGroqResponse } from "../../../../../src/adapters/models/providers/groq-response";

const MODEL = GROQ_MODELS[0];

// Bodies are written by hand in Groq's OpenAI-style shape; retry-after was
// checked against a real 429 (whole seconds).
const groqError = (type: string, message: string) => JSON.stringify({ error: { type, message } });

const PONG_BODY = JSON.stringify({
  choices: [{ message: { content: " Pong " }, finish_reason: "stop" }],
  usage: { total_tokens: 97 },
});

describe("parseGroqResponse", () => {
  it("names the model and the tokens on a successful answer", () => {
    expect(parseGroqResponse(MODEL, 200, PONG_BODY, new Headers())).toEqual({
      ok: true,
      model: MODEL,
      text: "Pong",
      totalTokens: 97,
      dailyRequests: null,
    });
  });

  it("reports the daily request count and limit from the headers", () => {
    const headers = new Headers({
      "x-ratelimit-remaining-requests": "999",
      "x-ratelimit-limit-requests": "1000",
    });

    expect(parseGroqResponse(MODEL, 200, PONG_BODY, headers)).toMatchObject({
      ok: true,
      dailyRequests: { remaining: 999, limit: 1000 },
    });
  });

  it("reads retry-after on a 429", () => {
    const headers = new Headers({ "retry-after": "2" });

    expect(parseGroqResponse(MODEL, 429, groqError("requests", "Please try again in 2s."), headers)).toMatchObject({
      ok: false,
      kind: "rate-limited",
      httpStatus: 429,
      retryAfterSeconds: 2,
      limitWindow: null,
    });
  });

  it("gives no retryAfterSeconds when a 429 has no usable retry-after", () => {
    for (const headers of [new Headers(), new Headers({ "retry-after": "" }), new Headers({ "retry-after": "soon" })]) {
      expect(parseGroqResponse(MODEL, 429, "{}", headers)).toMatchObject({
        kind: "rate-limited",
        retryAfterSeconds: null,
      });
    }
  });

  it.each([
    [503, "unavailable"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [400, "bad-request"],
    [413, "bad-request"],
    [500, "server-error"],
  ])("maps HTTP %i to %s", (httpStatus, kind) => {
    expect(parseGroqResponse(MODEL, httpStatus, groqError("x", "boom"), new Headers())).toMatchObject({
      ok: false,
      kind,
      httpStatus,
      detail: "x: boom",
    });
  });

  it("reports an empty answer with its finish reason", () => {
    const body = JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] });

    expect(parseGroqResponse(MODEL, 200, body, new Headers())).toMatchObject({
      ok: false,
      kind: "empty-answer",
      detail: "empty answer (finish_reason: length)",
    });
  });
});
