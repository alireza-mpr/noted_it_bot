import { fromBase64Url, toBase64Url } from "../../generic/encoding/base64-url";
import {
  readInteger,
  readNumber,
  readOneOf,
  readRecord,
  readString,
  readStringOrNull,
  type JsonRecord,
} from "../../generic/json/json-fields";
import {
  parseLanguageCode,
  type SupportedLanguage,
} from "../../domain/user/supported-language";

const MAX_TOKEN_LENGTH = 1024;
const MAX_NAME_LENGTH = 64;
// Signed with the token, so a signature made for anything else never fits.
// It keeps its old text, so links sent before a deploy keep working.
const SIGNATURE_DOMAIN = "noted-it/tz-page/v1:";
const TOKEN_PURPOSES: readonly TimeZoneLinkPurpose[] = ["open", "save"];
const TEXT_ENCODER = new TextEncoder();

// The time a /tz link can be opened, and the time the page can save.
export const OPEN_TOKEN_TTL_MS = 60_000;
export const SAVE_TOKEN_TTL_MS = 10 * 60_000;

// Represents what a token is for: opening the time zone page, or saving from
// it.
export type TimeZoneLinkPurpose = "open" | "save";

// Represents what a time zone link token says: which user, in which language,
// for what, and until when. username and firstName are only for the logs.
export interface TimeZoneLinkTokenPayload {
  userId: number;
  username: string | null;
  firstName: string | null;
  language: SupportedLanguage;
  purpose: TimeZoneLinkPurpose;
  expiresAtMs: number;
}

// Represents the result of verifying a token: its payload, or why it is
// refused.
export type TimeZoneLinkTokenResult =
  | { ok: true; payload: TimeZoneLinkTokenPayload }
  | {
      ok: false;
      reason: "malformed" | "bad-signature" | "wrong-purpose" | "expired";
    };

// Returns the signed token for the payload: "<payload>.<signature>", both in
// base64url.
export async function signTimeZoneLinkToken(
  webhookSecret: string,
  payload: TimeZoneLinkTokenPayload,
): Promise<string> {
  const payloadText = toBase64Url(TEXT_ENCODER.encode(JSON.stringify(payloadJsonOf(payload))));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKeyOf(webhookSecret),
    TEXT_ENCODER.encode(SIGNATURE_DOMAIN + payloadText),
  );
  return `${payloadText}.${toBase64Url(new Uint8Array(signature))}`;
}

// Returns the token's payload if the token is signed with the secret, is for
// this purpose, and has not expired. Otherwise returns why it is refused.
export async function verifyTimeZoneLinkToken(
  webhookSecret: string,
  token: string,
  purpose: TimeZoneLinkPurpose,
  nowMs: number,
): Promise<TimeZoneLinkTokenResult> {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 2 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "malformed" };
  }
  const [payloadText, signatureText] = tokenParts;
  const payloadBytes = fromBase64Url(payloadText);
  const signatureBytes = fromBase64Url(signatureText);
  // Only one spelling of a token is accepted: base64 padding bits cannot make
  // a second valid string.
  if (
    payloadBytes === null ||
    signatureBytes === null ||
    toBase64Url(payloadBytes) !== payloadText ||
    toBase64Url(signatureBytes) !== signatureText
  ) {
    return { ok: false, reason: "malformed" };
  }

  const isSigned = await crypto.subtle.verify(
    "HMAC",
    await hmacKeyOf(webhookSecret),
    signatureBytes,
    TEXT_ENCODER.encode(SIGNATURE_DOMAIN + payloadText),
  );
  if (!isSigned) {
    return { ok: false, reason: "bad-signature" };
  }

  let payload: TimeZoneLinkTokenPayload;
  try {
    payload = readPayload(JSON.parse(new TextDecoder().decode(payloadBytes)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (payload.purpose !== purpose) {
    return { ok: false, reason: "wrong-purpose" };
  }
  if (nowMs > payload.expiresAtMs) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

function hmacKeyOf(webhookSecret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// Returns the payload as the token's JSON. The short field names are the
// token's format, which links already sent use.
function payloadJsonOf(payload: TimeZoneLinkTokenPayload): JsonRecord {
  return {
    uid: payload.userId,
    username: payload.username,
    firstName: payload.firstName,
    lang: payload.language,
    purpose: payload.purpose,
    exp: payload.expiresAtMs,
  };
}

// Returns the payload in the token's JSON. Throws if its shape is wrong.
function readPayload(payloadJson: unknown): TimeZoneLinkTokenPayload {
  const payloadRecord = readRecord(payloadJson, "the payload");
  const userId = readInteger(payloadRecord, "uid");
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("uid is not a user id");
  }
  return {
    userId,
    username: readName(payloadRecord, "username"),
    firstName: readName(payloadRecord, "firstName"),
    language: parseLanguageCode(readString(payloadRecord, "lang")) ?? "en",
    purpose: readOneOf(payloadRecord, "purpose", TOKEN_PURPOSES),
    expiresAtMs: readNumber(payloadRecord, "exp"),
  };
}

function readName(payloadRecord: JsonRecord, fieldName: string): string | null {
  const name = readStringOrNull(payloadRecord, fieldName);
  if (name !== null && name.length > MAX_NAME_LENGTH) {
    throw new Error(`${fieldName} is too long`);
  }
  return name;
}
