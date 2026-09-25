import type { Env } from "../env";
import { messageLogger } from "../logging/messageLogger";
import { whitelistPolicy } from "../policy/whitelistPolicy";
import { createRouter } from "../router/router";
import { handleUpdate } from "./handleUpdate";
import { TelegramClient } from "./telegramClient";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("OK");
    }

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    whitelistPolicy.init(env.WHITELIST, env.MESSAGE_LOG);
    messageLogger.init(env.MESSAGE_LOG);

    await handleUpdate(request, {
      env,
      llm: createRouter(env),
      telegram: new TelegramClient(env.BOT_TOKEN),
    });
    return new Response("OK");
  },
};
