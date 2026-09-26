import type { Env } from "../env";
import { runLogSession } from "../logging/logger";
import { messageLogger } from "../logging/messageLogger";
import { userQuotaPolicy } from "../policy/userQuotaPolicy";
import { whitelistPolicy } from "../policy/whitelistPolicy";
import { createRouter } from "../router/router";
import { updateHandler } from "./messageHandlers/updateHandler";
import { handleTzPage, handleTzSave } from "../web/tzRoutes";
import { TelegramClient } from "./telegramClient";

// This is the Webhook that telegram calls when a message is sent to the bot.
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return runLogSession(env, ctx, async () => {
      const { pathname } = new URL(request.url);
      if (request.method === "GET" && pathname === "/tz") {
        return handleTzPage(request, env);
      }
      if (request.method === "POST" && pathname === "/tz/save") {
        return handleTzSave(request, env, { telegram: new TelegramClient(env.BOT_TOKEN) });
      }

      if (request.method !== "POST") {
        return new Response("OK");
      }

      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      whitelistPolicy.init(env.USAGE_DB, env.MESSAGE_LOG);
      userQuotaPolicy.init(env.USAGE_DB);
      messageLogger.init(env.MESSAGE_LOG);

      await updateHandler(
        request,
        env,
        createRouter(env),
        new TelegramClient(env.BOT_TOKEN),
      );
      return new Response("OK");
    });
  },
};
