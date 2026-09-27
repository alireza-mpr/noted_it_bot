import { beforeAll, describe, expect, it, vi } from "vitest";
import { MESSAGES } from "../../src/interactiveMessages/messages";
import { TRANSLATIONS } from "../../src/translation/translations";
import { handleTzPage, handleTzSave } from "../../src/web/tzRoutes";
import { OPEN_TOKEN_TTL_MS, SAVE_TOKEN_TTL_MS, signTzToken, verifyTzToken } from "../../src/web/tzToken";
import { fakeD1 } from "./fakeD1";

const SECRET = "test-secret-value";
const NOW = 1_800_000_000_000;
const UID = 123456789;

beforeAll(() => {
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

function setup() {
  const d1 = fakeD1();
  const sendMessage = vi.fn(async (_chatId: number, _text: string) => {});
  return { d1, sendMessage, env: { WEBHOOK_SECRET: SECRET, USAGE_DB: d1.db }, deps: { telegram: { sendMessage }, nowMs: NOW } };
}

const openToken = (overrides = {}) =>
  signTzToken(SECRET, { uid: UID, lang: "fa", purpose: "open", exp: NOW + OPEN_TOKEN_TTL_MS, ...overrides });
const saveToken = (overrides = {}) =>
  signTzToken(SECRET, { uid: UID, lang: "fa", purpose: "save", exp: NOW + SAVE_TOKEN_TTL_MS, ...overrides });

const pageRequest = (token: string, headers: Record<string, string> = {}) =>
  new Request(`https://bot.example/tz?token=${encodeURIComponent(token)}`, { headers });
const saveRequest = (body: unknown) =>
  new Request("https://bot.example/tz/save", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("GET /tz", () => {
  it("serves the page for a valid link, with a fresh save token bound to the same user", async () => {
    const { env } = setup();
    const response = await handleTzPage(pageRequest(await openToken()), env, NOW);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");

    const config = JSON.parse(html.match(/<script type="application\/json" id="cfg">(.*?)<\/script>/s)![1]);
    const saved = await verifyTzToken(SECRET, config.token, "save", NOW);
    expect(saved).toEqual({ ok: true, payload: { uid: UID, username: null, firstName: null, lang: "fa", purpose: "save", exp: NOW + SAVE_TOKEN_TTL_MS } });
    expect((await verifyTzToken(SECRET, config.token, "open", NOW)).ok).toBe(false);
    expect(html).not.toContain(await openToken());
  });

  it("is a strict CSP page: the script and style share the response's nonce and nothing is allowed inline otherwise", async () => {
    const { env } = setup();
    const response = await handleTzPage(pageRequest(await openToken()), env, NOW);
    const csp = response.headers.get("Content-Security-Policy")!;
    const html = await response.text();
    const nonce = csp.match(/script-src 'nonce-([^']+)'/)![1];

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`style-src 'nonce-${nonce}'`);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain(`<style nonce="${nonce}">`);
    expect(html).not.toMatch(/\son(click|load|error)=/i);
    expect(html).not.toContain("innerHTML");
  });

  it("uses a different nonce for every response", async () => {
    const { env } = setup();
    const nonces = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const response = await handleTzPage(pageRequest(await openToken()), env, NOW);
      nonces.add(response.headers.get("Content-Security-Policy")!.match(/nonce-([^']+)/)![1]);
    }
    expect(nonces.size).toBe(5);
  });

  it("speaks the user's language and flips to right-to-left for Persian and Arabic", async () => {
    const { env } = setup();
    for (const [lang, dir] of [["fa", "rtl"], ["ar", "rtl"], ["de", "ltr"], ["en", "ltr"]] as const) {
      const html = await (await handleTzPage(pageRequest(await openToken({ lang })), env, NOW)).text();
      expect(html).toContain(`<html lang="${lang}" dir="${dir}">`);
      const expected = lang === "en" ? MESSAGES.PAGE_TITLE : TRANSLATIONS[lang].PAGE_TITLE;
      expect(html).toContain(`<title>${expected}</title>`);
    }
  });

  it("falls back to English for an unknown language and never echoes it into the page", async () => {
    const { env } = setup();
    const html = await (await handleTzPage(pageRequest(await openToken({ lang: "<script>alert(1)</script>" })), env, NOW)).text();
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).not.toContain("alert(1)");
  });

  it("refuses expired, forged, missing and wrong-purpose links with a 403 page, touching nothing", async () => {
    const { env, d1 } = setup();
    const valid = await openToken();
    const [body, signature] = valid.split(".");
    const cases: [string, string][] = [
      ["expired", valid],
      ["forged", `${body}.${signature.slice(0, -2)}AA`],
      ["missing", ""],
      ["garbage", "not-a-token"],
      ["a save token", await saveToken()],
    ];

    for (const [name, token] of cases) {
      const now = name === "expired" ? NOW + OPEN_TOKEN_TTL_MS + 1 : NOW;
      const response = await handleTzPage(pageRequest(token), env, now);
      expect(response.status, name).toBe(403);
      expect(await response.text(), name).toContain(MESSAGES.PAGE_EXPIRED);
    }
    expect(d1.statements).toHaveLength(0);
  });

  it("shows the expired message in the visitor's language", async () => {
    const { env } = setup();
    const response = await handleTzPage(pageRequest("bad", { "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8" }), env, NOW);
    expect(response.status).toBe(403);
    expect(await response.text()).toContain(TRANSLATIONS.fa.PAGE_EXPIRED);
  });
});

describe("POST /tz/save", () => {
  it("stores a valid zone for the user in the token, tells them in Telegram, and returns it", async () => {
    const { env, d1, sendMessage, deps } = setup();
    const response = await handleTzSave(saveRequest({ token: await saveToken(), timezone: "asia/tehran" }), env, deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, timezone: "Asia/Tehran" });
    expect(d1.writes()).toHaveLength(1);
    expect(d1.writes()[0].sql).toContain("timezone = excluded.timezone");
    expect(d1.writes()[0].args).toEqual([UID, "Asia/Tehran"]);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]).toEqual([UID, TRANSLATIONS.fa.TZ_SET_CONFIRMATION!.replace("{0}", "Asia/Tehran")]);
  });

  it("takes the user only from the token, never from the request body", async () => {
    const { env, d1, deps } = setup();
    await handleTzSave(saveRequest({ token: await saveToken(), timezone: "Europe/Paris", uid: 999, userId: 999 }), env, deps);
    expect(d1.writes()[0].args[0]).toBe(UID);
  });

  it("rejects zones that aren't real, storing and sending nothing", async () => {
    for (const timezone of ["Mars/Olympus", "Iran", "Melbourne", "EST", "", "'; DROP TABLE user_preference;--", "A/".repeat(50)]) {
      const { env, d1, sendMessage, deps } = setup();
      const response = await handleTzSave(saveRequest({ token: await saveToken(), timezone }), env, deps);
      expect(response.status, timezone).toBe(400);
      expect(await response.json()).toEqual({ ok: false, error: "invalid_timezone" });
      expect(d1.statements, timezone).toHaveLength(0);
      expect(sendMessage).not.toHaveBeenCalled();
    }
  });

  it("refuses an open token, an expired token and a forged token with 403 and no writes", async () => {
    const { env, d1, sendMessage, deps } = setup();
    const valid = await saveToken();
    const [body, signature] = valid.split(".");

    const attempts: [string, string, number][] = [
      ["an open token", await openToken(), NOW],
      ["an expired save token", valid, NOW + SAVE_TOKEN_TTL_MS + 1],
      ["a forged token", `${body}.${signature.slice(0, -2)}AA`, NOW],
    ];
    for (const [name, token, nowMs] of attempts) {
      const response = await handleTzSave(saveRequest({ token, timezone: "Asia/Tehran" }), env, { ...deps, nowMs });
      expect(response.status, name).toBe(403);
      expect(await response.json(), name).toEqual({ ok: false, error: "expired" });
    }
    expect(d1.statements).toHaveLength(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("stays valid for the whole ten minutes, even though the link that opened the page expired after one", async () => {
    const { env, d1, deps } = setup();
    const token = await saveToken();
    const response = await handleTzSave(saveRequest({ token, timezone: "Asia/Tehran" }), env, { ...deps, nowMs: NOW + SAVE_TOKEN_TTL_MS });
    expect(response.status).toBe(200);
    expect(d1.writes()).toHaveLength(1);
  });

  it("rejects bad bodies without touching anything", async () => {
    const { env, d1, deps } = setup();
    const token = await saveToken();
    const cases: [unknown, number][] = [
      ["not json", 400],
      ["null", 400],
      [{ token }, 400],
      [{ timezone: "Asia/Tehran" }, 400],
      [{ token: 5, timezone: "Asia/Tehran" }, 400],
      [{ token, timezone: ["Asia/Tehran"] }, 400],
      [{ token, timezone: "x".repeat(5000) }, 413],
    ];
    for (const [body, status] of cases) {
      expect((await handleTzSave(saveRequest(body), env, deps)).status, JSON.stringify(body)?.slice(0, 40)).toBe(status);
    }
    expect(d1.statements).toHaveLength(0);
  });

  it("still succeeds when the Telegram confirmation can't be sent", async () => {
    const { env, d1 } = setup();
    const failing = { sendMessage: vi.fn(async () => { throw new Error("telegram down"); }) };
    const response = await handleTzSave(saveRequest({ token: await saveToken(), timezone: "Asia/Tehran" }), env, { telegram: failing, nowMs: NOW });
    expect(response.status).toBe(200);
    expect(d1.writes()).toHaveLength(1);
  });
});
