import { describe, expect, it } from "vitest";
import { parseGroqResponse } from "../../src/providers/groq/groqResponse";

const MODEL = "groq-gpt-oss-120b";

// Bodies are written by hand in Groq's OpenAI-style shape; retry-after was
// checked against a real 429 (whole seconds).
const error = (type: string, message: string) =>
  JSON.stringify({ error: { type, message } });

describe("parseGroqResponse", () => {
  it("names the model and the tokens on a successful answer", () => {
    const body = JSON.stringify({
      choices: [{ message: { content: " Pong " }, finish_reason: "stop" }],
      usage: { total_tokens: 97 },
    });

    expect(parseGroqResponse(MODEL, 200, body, new Headers())).toEqual({
      ok: true,
      model: MODEL,
      text: "Pong",
      totalTokens: 97,
    });
  });

  it("reports the daily request count and limit from the headers", () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "Pong" }, finish_reason: "stop" }],
      usage: { total_tokens: 97 },
    });
    const headers = new Headers({
      "x-ratelimit-remaining-requests": "999",
      "x-ratelimit-limit-requests": "1000",
    });

    expect(parseGroqResponse(MODEL, 200, body, headers)).toMatchObject({
      ok: true,
      rateLimit: { remainingRequests: 999, limitRequests: 1000 },
    });
  });

  it("reads retry-after on a 429", () => {
    expect(
      parseGroqResponse(MODEL, 429, error("requests", "Please try again in 2s."), new Headers({ "retry-after": "2" })),
    ).toMatchObject({
      ok: false,
      kind: "rateLimited", httpStatus: 429, retryAfterSeconds: 2,
    });
  });

  it("leaves retryAfterSeconds out when a 429 has no usable retry-after", () => {
    for (const headers of [new Headers(), new Headers({ "retry-after": "" }), new Headers({ "retry-after": "soon" })]) {
      const answer = parseGroqResponse(MODEL, 429, "{}", headers);

      expect(answer).toMatchObject({ kind: "rateLimited" });
      expect(
        !answer.ok && answer.kind === "rateLimited"
          ? answer.retryAfterSeconds
          : "wrong shape",
      ).toBeUndefined();
    }
  });

  it.each([
    [503, "unavailable"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [400, "badRequest"],
    [413, "badRequest"],
    [500, "serverError"],
  ])("maps HTTP %i to %s", (status, kind) => {
    expect(
      parseGroqResponse(MODEL, status, error("x", "boom"), new Headers()),
    ).toMatchObject({ ok: false, kind, httpStatus: status });
  });

  it("reports an empty answer with its finish reason", () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "" }, finish_reason: "length" }],
    });

    expect(parseGroqResponse(MODEL, 200, body, new Headers())).toMatchObject({
      ok: false,
      kind: "emptyResponse", detail: "empty response (finish_reason: length)",
    });
  });
});
