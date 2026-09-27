import { logActivity } from "../logging/activityLog";
import { Logger, describeError, setLogField } from "../logging/logger";
import type { TelegramClient } from "../telegram/telegramClient";
import { fillPlaceholder } from "../translation/placeholders";
import { toSupportedLanguage } from "../translation/language";
import { translateStatic } from "../translation/translate";
import { canonicalTimezone } from "../time/canonicalTimezone";
import { UserPreferenceRepository } from "../repositories/userPreferenceRepository";
import { renderMessagePage, renderTzPage, pageSecurityHeaders } from "./tzPage";
import {
  SAVE_TOKEN_TTL_MS,
  signTzToken,
  verifyTzToken,
} from "./tzToken";

const logger = new Logger("tzRoutes");

const MAX_BODY_CHARS = 2048;

export interface TzRouteEnv {
  WEBHOOK_SECRET: string;
  USAGE_DB: D1Database;
}

function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "");
}

function languageFromHeader(request: Request): string {
  const first = request.headers.get("Accept-Language")?.split(",")[0]?.split(";")[0];
  return toSupportedLanguage(first) ?? "en";
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function expiredPage(request: Request): Response {
  const lang = languageFromHeader(request);
  const nonce = newNonce();
  return new Response(renderMessagePage(lang, translateStatic("PAGE_EXPIRED", lang), nonce), {
    status: 403,
    headers: pageSecurityHeaders(nonce),
  });
}

export async function handleTzPage(request: Request, env: TzRouteEnv, nowMs: number = Date.now()): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const result = await verifyTzToken(env.WEBHOOK_SECRET, token, "open", nowMs);
  if (!result.ok) {
    logger.warn("time zone page refused", { reason: result.reason, purpose: "open" });
    return expiredPage(request);
  }

  const { uid, username, firstName, lang } = result.payload;
  setLogField("userId", uid);
  setLogField("username", username ?? null);
  setLogField("firstName", firstName ?? null);
  const saveToken = await signTzToken(env.WEBHOOK_SECRET, {
    uid,
    username: username ?? null,
    firstName: firstName ?? null,
    lang,
    purpose: "save",
    exp: nowMs + SAVE_TOKEN_TTL_MS,
  });
  const nonce = newNonce();
  logActivity("tz_page_opened");
  return new Response(renderTzPage({ lang: toSupportedLanguage(lang) ?? "en", saveToken, nonce }), {
    headers: pageSecurityHeaders(nonce),
  });
}

export interface TzSaveDeps {
  telegram: Pick<TelegramClient, "sendMessage">;
  nowMs?: number;
}

export async function handleTzSave(request: Request, env: TzRouteEnv, deps: TzSaveDeps): Promise<Response> {
  const nowMs = deps.nowMs ?? Date.now();

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return json(413, { ok: false, error: "too_large" });
  }
  let body: { token?: unknown; timezone?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "bad_request" });
  }
  if (typeof body?.token !== "string" || typeof body?.timezone !== "string") {
    return json(400, { ok: false, error: "bad_request" });
  }

  const result = await verifyTzToken(env.WEBHOOK_SECRET, body.token, "save", nowMs);
  if (!result.ok) {
    logger.warn("time zone save refused", { reason: result.reason, purpose: "save" });
    return json(403, { ok: false, error: "expired" });
  }

  const { uid, username, firstName, lang } = result.payload;
  setLogField("userId", uid);
  setLogField("username", username ?? null);
  setLogField("firstName", firstName ?? null);

  const timezone = canonicalTimezone(body.timezone);
  if (!timezone) {
    logger.warn("invalid time zone submitted", { submitted: body.timezone.slice(0, 64) });
    return json(400, { ok: false, error: "invalid_timezone" });
  }

  await new UserPreferenceRepository(env.USAGE_DB).setTimezone(uid, timezone);
  logActivity("tz_set", { timezone, via: "page" });

  try {
    await deps.telegram.sendMessage(
      uid,
      fillPlaceholder(translateStatic("TZ_SET_CONFIRMATION", lang), timezone),
    );
  } catch (err) {
    logger.warn("could not send the time zone confirmation", describeError(err));
  }
  return json(200, { ok: true, timezone });
}
