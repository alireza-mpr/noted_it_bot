export type TzTokenPurpose = "open" | "save";

export interface TzTokenPayload {
  uid: number;
  lang: string;
  purpose: TzTokenPurpose;
  exp: number;
}

export type TzTokenResult =
  | { ok: true; payload: TzTokenPayload }
  | { ok: false; reason: "malformed" | "bad signature" | "wrong purpose" | "expired" };

export const OPEN_TOKEN_TTL_MS = 60_000;
export const SAVE_TOKEN_TTL_MS = 10 * 60_000;

const DOMAIN = "noted-it/tz-page/v1:";
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    return null;
  }
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signTzToken(secret: string, payload: TzTokenPayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(DOMAIN + body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

function isPayload(value: unknown): value is TzTokenPayload {
  const candidate = value as Partial<TzTokenPayload> | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    Number.isSafeInteger(candidate.uid) &&
    (candidate.uid as number) > 0 &&
    typeof candidate.lang === "string" &&
    (candidate.purpose === "open" || candidate.purpose === "save") &&
    typeof candidate.exp === "number" &&
    Number.isFinite(candidate.exp)
  );
}

export async function verifyTzToken(
  secret: string,
  token: string,
  purpose: TzTokenPurpose,
  nowMs: number,
): Promise<TzTokenResult> {
  const parts = token.split(".");
  if (parts.length !== 2 || token.length > 1024) {
    return { ok: false, reason: "malformed" };
  }
  const [body, signature] = parts;
  const signatureBytes = fromBase64Url(signature);
  const bodyBytes = fromBase64Url(body);
  if (!signatureBytes || !bodyBytes) {
    return { ok: false, reason: "malformed" };
  }
  if (toBase64Url(signatureBytes) !== signature || toBase64Url(bodyBytes) !== body) {
    return { ok: false, reason: "malformed" };
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(DOMAIN + body),
  );
  if (!valid) {
    return { ok: false, reason: "bad signature" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!isPayload(payload)) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.purpose !== purpose) {
    return { ok: false, reason: "wrong purpose" };
  }
  if (nowMs > payload.exp) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}
