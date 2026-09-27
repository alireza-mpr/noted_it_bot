import type { Env } from "../env";
import { runLogSession } from "../logging/logger";
import { userQuotaPolicy } from "../policy/userQuotaPolicy";
import { createRouter } from "../router/router";
import { updateHandler } from "./messageHandlers/updateHandler";
import { handleTzPage, handleTzSave } from "../web/tzRoutes";
import { TelegramClient } from "./telegramClient";

// The webhook: Telegram calls it for every message sent to the bot.
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

      userQuotaPolicy.init(env.USAGE_DB);

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
