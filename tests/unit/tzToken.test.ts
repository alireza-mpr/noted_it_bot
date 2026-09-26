import { describe, expect, it } from "vitest";
import {
  OPEN_TOKEN_TTL_MS,
  SAVE_TOKEN_TTL_MS,
  signTzToken,
  verifyTzToken,
  type TzTokenPayload,
} from "../../src/web/tzToken";

const SECRET = "test-secret-value";
const NOW = 1_800_000_000_000;

const payload = (overrides: Partial<TzTokenPayload> = {}): TzTokenPayload => ({
  uid: 123456789,
  lang: "fa",
  purpose: "open",
  exp: NOW + OPEN_TOKEN_TTL_MS,
  ...overrides,
});

describe("timings", () => {
  it("opens for one minute and saves for ten", () => {
    expect(OPEN_TOKEN_TTL_MS).toBe(60_000);
    expect(SAVE_TOKEN_TTL_MS).toBe(600_000);
  });
});

describe("signTzToken / verifyTzToken", () => {
  it("round-trips the payload", async () => {
    const token = await signTzToken(SECRET, payload());
    expect(await verifyTzToken(SECRET, token, "open", NOW)).toEqual({ ok: true, payload: payload() });
  });

  it("produces a compact URL-safe token", async () => {
    const token = await signTzToken(SECRET, payload());
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token.length).toBeLessThan(300);
  });

  it("is valid up to and including its expiry, then expired", async () => {
    const token = await signTzToken(SECRET, payload());
    expect((await verifyTzToken(SECRET, token, "open", NOW)).ok).toBe(true);
    expect((await verifyTzToken(SECRET, token, "open", NOW + OPEN_TOKEN_TTL_MS)).ok).toBe(true);
    expect(await verifyTzToken(SECRET, token, "open", NOW + OPEN_TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token used for the wrong purpose", async () => {
    const open = await signTzToken(SECRET, payload({ purpose: "open" }));
    const save = await signTzToken(SECRET, payload({ purpose: "save", exp: NOW + SAVE_TOKEN_TTL_MS }));
    expect(await verifyTzToken(SECRET, open, "save", NOW)).toEqual({ ok: false, reason: "wrong purpose" });
    expect(await verifyTzToken(SECRET, save, "open", NOW)).toEqual({ ok: false, reason: "wrong purpose" });
    expect((await verifyTzToken(SECRET, save, "save", NOW)).ok).toBe(true);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signTzToken("some-other-secret", payload());
    expect(await verifyTzToken(SECRET, token, "open", NOW)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects any tampering with the payload or the signature", async () => {
    const token = await signTzToken(SECRET, payload());
    const [body, signature] = token.split(".");

    const otherUser = btoa(JSON.stringify(payload({ uid: 1 }))).replace(/=+$/, "");
    const longerExpiry = btoa(JSON.stringify(payload({ exp: NOW + 10 * OPEN_TOKEN_TTL_MS }))).replace(/=+$/, "");
    const flipped = signature.slice(0, -2) + (signature.endsWith("AA") ? "BB" : "AA");

    for (const forged of [`${otherUser}.${signature}`, `${longerExpiry}.${signature}`, `${body}.${flipped}`, `${body}.`, `.${signature}`]) {
      expect((await verifyTzToken(SECRET, forged, "open", NOW)).ok, forged.slice(0, 20)).toBe(false);
    }
  });

  it("accepts exactly one spelling of a token: padding bits in base64 can't be used to make a second valid string", async () => {
    const token = await signTzToken(SECRET, payload());
    const [body, signature] = token.split(".");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = alphabet.indexOf(signature.slice(-1));
    const variants = [0, 1, 2, 3].map((low) => signature.slice(0, -1) + alphabet[(last & ~3) | low]);

    const accepted = [];
    for (const variant of variants) {
      if ((await verifyTzToken(SECRET, `${body}.${variant}`, "open", NOW)).ok) accepted.push(variant);
    }
    expect(accepted).toEqual([signature]);
  });

  it("rejects malformed input without throwing", async () => {
    for (const bad of ["", "abc", "a.b.c", "!!!.???", "a b.c d", "x".repeat(2000), "....", "e30.e30"]) {
      const result = await verifyTzToken(SECRET, bad, "open", NOW);
      expect(result.ok, bad.slice(0, 20)).toBe(false);
    }
  });

  it("rejects a correctly signed payload with the wrong shape", async () => {
    for (const shape of [{ uid: -5 }, { uid: "12" }, { uid: 1.5 }, { lang: 5 }, { purpose: "admin" }, { exp: "soon" }, { exp: Number.NaN }]) {
      const token = await signTzToken(SECRET, { ...payload(), ...shape } as unknown as TzTokenPayload);
      expect(await verifyTzToken(SECRET, token, "open", NOW), JSON.stringify(shape)).toEqual({ ok: false, reason: "malformed" });
    }
  });
});
