import type { ProviderFailure, ProviderResult } from "../providerClient";

interface GroqBody {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string;
  }[];
  usage?: { total_tokens?: number };
  error?: { type?: string; message?: string };
}

function parseJson(body: string): GroqBody | null {
  try {
    return JSON.parse(body) as GroqBody;
  } catch {
    return null;
  }
}

function describeError(data: GroqBody | null, body: string): string {
  const described = [data?.error?.type, data?.error?.message]
    .filter(Boolean)
    .join(": ");
  const text = described || body.trim() || "(empty body)";
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

type Headers = { get(name: string): string | null };

function headerNumber(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  const value = Number(raw);
  return raw !== null && raw.trim() !== "" && Number.isFinite(value)
    ? value
    : undefined;
}

export function parseGroqResponse(
  model: string,
  httpStatus: number,
  body: string,
  headers: Headers,
): ProviderResult {
  const data = parseJson(body);
  const fail = (failure: ProviderFailure): ProviderResult => ({
    result: "failed",
    failure,
  });
  const detail = () => describeError(data, body);

  if (httpStatus === 429) {
    // retry-after is in whole seconds and is sent only on a 429.
    const retryAfter = headerNumber(headers, "retry-after");
    return fail({
      kind: "rateLimited",
      retryAfterSeconds: retryAfter !== undefined && retryAfter > 0 ? retryAfter : undefined,
      httpStatus,
      detail: detail(),
    });
  }

  if (httpStatus === 503) {
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

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const finishReason = data?.choices?.[0]?.finish_reason ?? "none";
    return fail({
      kind: "emptyResponse",
      httpStatus,
      detail: `empty response (finish_reason: ${finishReason})`,
    });
  }

  const remainingRequests = headerNumber(headers, "x-ratelimit-remaining-requests");
  const limitRequests = headerNumber(headers, "x-ratelimit-limit-requests");
  return {
    result: "ok",
    model,
    text,
    totalTokens: data?.usage?.total_tokens ?? 0,
    ...(remainingRequests !== undefined &&
      limitRequests !== undefined && {
        rateLimit: { remainingRequests, limitRequests },
      }),
  };
}
