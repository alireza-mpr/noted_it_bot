import type { Env } from "../env";
import type { LlmClient } from "../lib/providers/providerClient";
import type { Replier } from "./replier";
import type { TelegramClient } from "./telegramClient";
import type { TelegramMessage } from "./telegramTypes";

export interface BotDeps {
  env: Env;
  llm: LlmClient;
  telegram: TelegramClient;
}

export interface MessageContext {
  env: Env;
  llm: LlmClient;
  message: TelegramMessage;
  replier: Replier;
  lang: string | undefined;
  langOverride: string | null;
}

export type CommandHandler = (ctx: MessageContext) => Promise<void>;
