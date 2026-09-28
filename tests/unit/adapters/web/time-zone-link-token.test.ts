import { describe, expect, it } from "vitest";
import {
  OPEN_TOKEN_TTL_MS,
  SAVE_TOKEN_TTL_MS,
  signTimeZoneLinkToken,
  verifyTimeZoneLinkToken,
  type TimeZoneLinkTokenPayload,
} from "../../../../src/adapters/web/time-zone-link-token";
import { toBase64Url } from "../../../../src/generic/encoding/base64-url";

const WEBHOOK_SECRET = "test-secret-value";
const NOW_MS = 1_800_000_000_000;

function payloadWith(overrides: Partial<TimeZoneLinkTokenPayload> = {}): TimeZoneLinkTokenPayload {
  return {
    userId: 123456789,
    username: null,
    firstName: null,
    language: "fa",
    purpose: "open",
    expiresAtMs: NOW_MS + OPEN_TOKEN_TTL_MS,
    ...overrides,
  };
}

// Returns a token signed over any JSON, e.g. a payload of the wrong shape.
async function tokenOfJson(payloadJson: object): Promise<string> {
  const payloadText = toBase64Url(new TextEncoder().encode(JSON.stringify(payloadJson)));
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(`noted-it/tz-page/v1:${payloadText}`));
  return `${payloadText}.${toBase64Url(new Uint8Array(signature))}`;
}

describe("time zone link token timings", () => {
  it("opens for one minute and saves for ten", () => {
    expect(OPEN_TOKEN_TTL_MS).toBe(60_000);
    expect(SAVE_TOKEN_TTL_MS).toBe(600_000);
  });
});

describe("signTimeZoneLinkToken and verifyTimeZoneLinkToken", () => {
  it("give back the payload", async () => {
    const token = await signTimeZoneLinkToken(WEBHOOK_SECRET, payloadWith({ username: "alice", firstName: "Alice" }));

    expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, token, "open", NOW_MS)).toEqual({
      ok: true,
      payload: payloadWith({ username: "alice", firstName: "Alice" }),
    });
  });

  it("make a short, URL-safe token", async () => {
    const token = await signTimeZoneLinkToken(WEBHOOK_SECRET, payloadWith());

    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token.length).toBeLessThan(300);
  });

  it("still read a token that an older link carries, with no names", async () => {
    const olderToken = await tokenOfJson({ uid: 42, lang: "fa", purpose: "open", exp: NOW_MS + OPEN_TOKEN_TTL_MS });

    expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, olderToken, "open", NOW_MS)).toMatchObject({
      ok: true,
      payload: { userId: 42, username: null, firstName: null, language: "fa" },
    });
  });

  it("read an unknown language as English", async () => {
    const token = await tokenOfJson({ uid: 42, lang: "<script>", purpose: "open", exp: NOW_MS + OPEN_TOKEN_TTL_MS });

    expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, token, "open", NOW_MS)).toMatchObject({
      ok: true,
      payload: { language: "en" },
    });
  });

  it("accept a token up to and including its expiry time, then refuse it", async () => {
    const token = await signTimeZoneLinkToken(WEBHOOK_SECRET, payloadWith());

    expect((await verifyTimeZoneLinkToken(WEBHOOK_SECRET, token, "open", NOW_MS)).ok).toBe(true);
    expect((await verifyTimeZoneLinkToken(WEBHOOK_SECRET, token, "open", NOW_MS + OPEN_TOKEN_TTL_MS)).ok).toBe(true);
    expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, token, "open", NOW_MS + OPEN_TOKEN_TTL_MS + 1)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("refuse a token used for the wrong purpose", async () => {
    const openToken = await signTimeZoneLinkToken(WEBHOOK_SECRET, payloadWith({ purpose: "open" }));
    const saveToken = await signTimeZoneLinkToken(
      WEBHOOK_SECRET,
      payloadWith({ purpose: "save", expiresAtMs: NOW_MS + SAVE_TOKEN_TTL_MS }),
    );

    expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, openToken, "save", NOW_MS)).toEqual({ ok: false, reason: "wrong-purpose" });
    expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, saveToken, "open", NOW_MS)).toEqual({ ok: false, reason: "wrong-purpose" });
    expect((await verifyTimeZoneLinkToken(WEBHOOK_SECRET, saveToken, "save", NOW_MS)).ok).toBe(true);
  });

  it("refuse a token signed with another secret", async () => {
    const token = await signTimeZoneLinkToken("some-other-secret", payloadWith());

    expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, token, "open", NOW_MS)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("refuse any change to the payload or the signature", async () => {
    const token = await signTimeZoneLinkToken(WEBHOOK_SECRET, payloadWith());
    const [payloadText, signatureText] = token.split(".");
    const otherUser = toBase64Url(new TextEncoder().encode(JSON.stringify({ uid: 1, lang: "fa", purpose: "open", exp: NOW_MS })));
    const flippedSignature = signatureText.slice(0, -2) + (signatureText.endsWith("AA") ? "BB" : "AA");

    for (const forgedToken of [`${otherUser}.${signatureText}`, `${payloadText}.${flippedSignature}`, `${payloadText}.`, `.${signatureText}`]) {
      expect((await verifyTimeZoneLinkToken(WEBHOOK_SECRET, forgedToken, "open", NOW_MS)).ok, forgedToken.slice(0, 20)).toBe(false);
    }
  });

  it("accept only one spelling of a token: base64 padding bits cannot make a second valid string", async () => {
    const token = await signTimeZoneLinkToken(WEBHOOK_SECRET, payloadWith());
    const [payloadText, signatureText] = token.split(".");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const lastIndex = alphabet.indexOf(signatureText.slice(-1));
    const spellings = [0, 1, 2, 3].map((lowBits) => signatureText.slice(0, -1) + alphabet[(lastIndex & ~3) | lowBits]);

    const acceptedSpellings = [];
    for (const spelling of spellings) {
      if ((await verifyTimeZoneLinkToken(WEBHOOK_SECRET, `${payloadText}.${spelling}`, "open", NOW_MS)).ok) {
        acceptedSpellings.push(spelling);
      }
    }
    expect(acceptedSpellings).toEqual([signatureText]);
  });

  it("refuse malformed input without throwing", async () => {
    for (const badToken of ["", "abc", "a.b.c", "!!!.???", "a b.c d", "x".repeat(2000), "....", "e30.e30"]) {
      expect((await verifyTimeZoneLinkToken(WEBHOOK_SECRET, badToken, "open", NOW_MS)).ok, badToken.slice(0, 20)).toBe(false);
    }
  });

  it("refuse a signed payload of the wrong shape", async () => {
    const validJson = { uid: 42, lang: "fa", purpose: "open", exp: NOW_MS + OPEN_TOKEN_TTL_MS };
    for (const wrongField of [
      { uid: -5 },
      { uid: "12" },
      { uid: 1.5 },
      { lang: 5 },
      { purpose: "admin" },
      { exp: "soon" },
      { exp: null },
      { firstName: "x".repeat(65) },
    ]) {
      const token = await tokenOfJson({ ...validJson, ...wrongField });
      expect(await verifyTimeZoneLinkToken(WEBHOOK_SECRET, token, "open", NOW_MS), JSON.stringify(wrongField)).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });
});
