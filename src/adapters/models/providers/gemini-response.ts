import { truncateText } from "../../../generic/text/truncate-text";
import type { Model } from "../model";
import {
  failureKindOf,
  type LimitWindow,
  type ModelResult,
} from "../model-result";

const MAX_DETAIL_LENGTH = 300;

// Returns the model's answer, or why there is none, from Gemini's HTTP status
// and response body.
export function parseGeminiResponse(
  model: Model,
  httpStatus: number,
  responseBody: string,
): ModelResult {
  const geminiBody = parseJson(responseBody);
  const failureDetail = () => describeFailure(geminiBody, responseBody);

  if (httpStatus === 429) {
    return {
      ok: false,
      kind: "rate-limited",
      limitWindow: limitWindowOf(geminiBody),
      retryAfterSeconds: null,
      httpStatus,
      detail: failureDetail(),
    };
  }
  if (httpStatus === 503 || geminiBody?.error?.status === "UNAVAILABLE") {
    return {
      ok: false,
      kind: "unavailable",
      httpStatus,
      detail: failureDetail(),
    };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      ok: false,
      kind: failureKindOf(httpStatus),
      httpStatus,
      detail: failureDetail(),
    };
  }

  const text = (geminiBody?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    const finishReason = geminiBody?.candidates?.[0]?.finishReason ?? "none";
    return {
      ok: false,
      kind: "empty-answer",
      httpStatus,
      detail: `empty answer (finishReason: ${finishReason})`,
    };
  }
  return {
    ok: true,
    model,
    text,
    totalTokens: geminiBody?.usageMetadata?.totalTokenCount ?? 0,
    dailyRequests: null,
  };
}

// Represents the parts of a Gemini response body that the bot reads.
interface GeminiBody {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: { totalTokenCount?: number };
  error?: {
    status?: string;
    message?: string;
    details?: { violations?: { quotaId?: string }[] }[];
  };
}

function parseJson(responseBody: string): GeminiBody | null {
  try {
    return JSON.parse(responseBody) as GeminiBody;
  } catch {
    return null;
  }
}

function describeFailure(
  geminiBody: GeminiBody | null,
  responseBody: string,
): string {
  const errorText = [geminiBody?.error?.status, geminiBody?.error?.message]
    .filter(Boolean)
    .join(": ");
  return truncateText(
    errorText || responseBody.trim() || "(empty body)",
    MAX_DETAIL_LENGTH,
  );
}

// Returns the window of the limit that a 429 names: "day" for a daily quota,
// else "minute".
function limitWindowOf(geminiBody: GeminiBody | null): LimitWindow {
  const quotaIds = (geminiBody?.error?.details ?? [])
    .flatMap((detail) => detail.violations ?? [])
    .map((violation) => violation.quotaId ?? "");
  return quotaIds.some((quotaId) => quotaId.includes("PerDay"))
    ? "day"
    : "minute";
}
