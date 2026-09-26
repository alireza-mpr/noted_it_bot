import type { ProviderFailure, ProviderResult } from "../providerClient";

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

function parseJson(body: string): GeminiBody | null {
  try {
    return JSON.parse(body) as GeminiBody;
  } catch {
    return null;
  }
}

function describeError(data: GeminiBody | null, body: string): string {
  const described = [data?.error?.status, data?.error?.message]
    .filter(Boolean)
    .join(": ");
  const text = described || body.trim() || "(empty body)";
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

export function parseGeminiResponse(
  model: string,
  httpStatus: number,
  body: string,
): ProviderResult {
  const data = parseJson(body);
  const fail = (failure: ProviderFailure): ProviderResult => ({
    result: "failed",
    failure,
  });
  const detail = () => describeError(data, body);

  if (httpStatus === 429) {
    const quotaIds = (data?.error?.details ?? [])
      .flatMap((d) => d.violations ?? [])
      .map((v) => v.quotaId ?? "");
    const quotaLimitScope = quotaIds.some((id) => id.includes("PerDay"))
      ? "day"
      : "minute";
    return fail({
      kind: "rateLimited",
      quotaLimitScope,
      httpStatus,
      detail: detail(),
    });
  }

  if (httpStatus === 503 || data?.error?.status === "UNAVAILABLE") {
    return fail({ kind: "unavailable", httpStatus, detail: detail() });
  }

  if (httpStatus < 200 || httpStatus >= 300) {
    const kind =
      httpStatus === 401 || httpStatus === 403
        ? "unauthorized"
        : httpStatus >= 500
          ? "serverError"
          : "badRequest";
    return fail({ kind, httpStatus, detail: detail() });
  }

  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    const finishReason = data?.candidates?.[0]?.finishReason ?? "none";
    return fail({
      kind: "emptyResponse",
      httpStatus,
      detail: `empty response (finishReason: ${finishReason})`,
    });
  }

  return {
    result: "ok",
    model,
    text,
    totalTokens: data?.usageMetadata?.totalTokenCount ?? 0,
  };
}
