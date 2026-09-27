import { truncateText } from "../../../generic/text/truncate-text";
import type { Model } from "../model";
import {
  failureKindOf,
  type DailyRequests,
  type ModelResult,
} from "../model-result";

const MAX_DETAIL_LENGTH = 300;

// Returns the model's answer, or why there is none, from Groq's HTTP status,
// response body and headers.
export function parseGroqResponse(
  model: Model,
  httpStatus: number,
  responseBody: string,
  headers: Headers,
): ModelResult {
  const groqBody = parseJson(responseBody);
  const failureDetail = () => describeFailure(groqBody, responseBody);

  if (httpStatus === 429) {
    // retry-after is in whole seconds. Groq sends it only with a 429.
    const retryAfterSeconds = headerNumber(headers, "retry-after");
    return {
      ok: false,
      kind: "rate-limited",
      limitWindow: null,
      retryAfterSeconds:
        retryAfterSeconds !== null && retryAfterSeconds > 0
          ? retryAfterSeconds
          : null,
      httpStatus,
      detail: failureDetail(),
    };
  }
  if (httpStatus === 503) {
    return { ok: false, kind: "unavailable", httpStatus, detail: failureDetail() };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      ok: false,
      kind: failureKindOf(httpStatus),
      httpStatus,
      detail: failureDetail(),
    };
  }

  const text = groqBody?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const finishReason = groqBody?.choices?.[0]?.finish_reason ?? "none";
    return {
      ok: false,
      kind: "empty-answer",
      httpStatus,
      detail: `empty answer (finish_reason: ${finishReason})`,
    };
  }
  return {
    ok: true,
    model,
    text,
    totalTokens: groqBody?.usage?.total_tokens ?? 0,
    dailyRequests: dailyRequestsOf(headers),
  };
}

// Represents the parts of a Groq response body that the bot reads.
interface GroqBody {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string;
  }[];
  usage?: { total_tokens?: number };
  error?: { type?: string; message?: string };
}

function parseJson(responseBody: string): GroqBody | null {
  try {
    return JSON.parse(responseBody) as GroqBody;
  } catch {
    return null;
  }
}

function describeFailure(groqBody: GroqBody | null, responseBody: string): string {
  const errorText = [groqBody?.error?.type, groqBody?.error?.message]
    .filter(Boolean)
    .join(": ");
  return truncateText(
    errorText || responseBody.trim() || "(empty body)",
    MAX_DETAIL_LENGTH,
  );
}

function dailyRequestsOf(headers: Headers): DailyRequests | null {
  const remaining = headerNumber(headers, "x-ratelimit-remaining-requests");
  const limit = headerNumber(headers, "x-ratelimit-limit-requests");
  return remaining !== null && limit !== null ? { remaining, limit } : null;
}

// Returns the header's value as a number, or null if it is missing or not a
// number.
function headerNumber(headers: Headers, headerName: string): number | null {
  const headerValue = headers.get(headerName);
  if (headerValue === null || headerValue.trim() === "") {
    return null;
  }
  const headerNumberValue = Number(headerValue);
  return Number.isFinite(headerNumberValue) ? headerNumberValue : null;
}
