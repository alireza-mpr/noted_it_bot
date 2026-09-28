import { D1UserRepository } from "../adapters/database/d1-user-repository";
import { runLogSession } from "../adapters/logging/log-session";
import { Logger } from "../adapters/logging/logger";
import { routedProvidersOf } from "../adapters/models/providers/routed-providers";
import { Router } from "../adapters/models/router";
import { TelegramClient } from "../adapters/telegram/telegram-client";
import { parseTelegramUpdate } from "../adapters/telegram/telegram-update";
import { isFromTelegram } from "../adapters/telegram/webhook-auth";
import { APP_CONFIG } from "../config/app-config";
import type { Env } from "../config/env";
import {
  parseBotEdition,
  type BotEdition,
} from "../domain/bot-edition/bot-edition";
import { handleUpdate, type UpdateContext } from "./handle-update";
import {
  openTimeZonePage,
  saveTimeZoneFromPage,
  TIME_ZONE_PAGE_PATH,
  TIME_ZONE_SAVE_PATH,
  type TimeZonePageContext,
} from "./time-zone-page";

const LOGGER = new Logger<"config.bot_edition_invalid">("worker");

// Represents the Worker: Telegram's webhook, and the time zone page. Each
// request has its own log session.
export default {
  async fetch(
    request: Request,
    env: Env,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    return runLogSession(env, executionContext, () =>
      responseTo(request, env),
    );
  },
} satisfies ExportedHandler<Env>;

// Returns the response to a request: the time zone page and its save, or
// Telegram's webhook for any other POST.
async function responseTo(request: Request, env: Env): Promise<Response> {
  const now = new Date();
  const { pathname, origin } = new URL(request.url);
  if (request.method === "GET" && pathname === TIME_ZONE_PAGE_PATH) {
    return openTimeZonePage(request, timeZonePageContextOf(env, now));
  }
  if (request.method === "POST" && pathname === TIME_ZONE_SAVE_PATH) {
    return saveTimeZoneFromPage(request, timeZonePageContextOf(env, now));
  }
  if (request.method !== "POST") {
    return new Response("OK");
  }
  const botEdition = parseBotEdition(env.BOT_EDITION ?? "");
  if (botEdition === null) {
    LOGGER.error("config.bot_edition_invalid", {
      "config.bot_edition": env.BOT_EDITION ?? null,
    });
    // A setup mistake: Telegram keeps the update and sends it again, so no
    // message is lost while BOT_EDITION is fixed.
    return new Response("BOT_EDITION is not set up", { status: 500 });
  }
  if (!isFromTelegram(request, env.WEBHOOK_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const telegramUpdate = parseTelegramUpdate(
    await request.json<unknown>().catch(() => null),
  );
  await handleUpdate(
    telegramUpdate,
    updateContextOf(env, botEdition, origin, now),
  );
  // Telegram gets 200 even when handling the update failed, so one update
  // never blocks the ones after it. See ADR-8 in
  // ARCHITECTURE_DECISIONS_REGISTRY.md.
  return new Response("OK");
}

function updateContextOf(
  env: Env,
  botEdition: BotEdition,
  workerOrigin: string,
  now: Date,
): UpdateContext {
  return {
    botEdition,
    router: new Router(routedProvidersOf(env)),
    userRepository: new D1UserRepository(env.USAGE_DB),
    telegramClient: new TelegramClient(env.BOT_TOKEN),
    dailyQuota: APP_CONFIG.enforceUserDailyQuota
      ? { kind: "limited", unitsPerDay: APP_CONFIG.dailyQuota }
      : { kind: "off" },
    isDailyQuotaShown: APP_CONFIG.showDailyQuota,
    appVersion: env.APP_VERSION,
    webhookSecret: env.WEBHOOK_SECRET,
    workerOrigin,
    now,
  };
}

function timeZonePageContextOf(env: Env, now: Date): TimeZonePageContext {
  return {
    webhookSecret: env.WEBHOOK_SECRET,
    userRepository: new D1UserRepository(env.USAGE_DB),
    telegramClient: new TelegramClient(env.BOT_TOKEN),
    now,
  };
}
