import { logActivity } from "../../logging/activityLog";
import { canonicalTimezone } from "../../time/canonicalTimezone";
import { UserPreferenceRepository } from "../../repositories/userPreferenceRepository";
import { OPEN_TOKEN_TTL_MS, signTzToken } from "../../web/tzToken";
import type { Replier } from "../replier";
import type { TelegramMessage } from "../telegramTypes";

export function isTzCommand(text: string | undefined): boolean {
  return /^\/tz(@\w+)?(\s|$)/.test(text ?? "");
}

export interface TzCommandEnv {
  USAGE_DB: D1Database;
  WEBHOOK_SECRET: string;
}

export async function tzCommandHandler(
  env: TzCommandEnv,
  message: TelegramMessage,
  replier: Replier,
  origin: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const arg = (message.text ?? "").replace(/^\/tz(@\w+)?/, "").trim();

  const exact = arg ? canonicalTimezone(arg) : null;
  if (exact) {
    await new UserPreferenceRepository(env.USAGE_DB).setTimezone(message.from.id, exact);
    logActivity("tz_set", { timezone: exact, via: "command" });
    await replier.say("TZ_SET_CONFIRMATION", exact);
    return;
  }

  const token = await signTzToken(env.WEBHOOK_SECRET, {
    uid: message.from.id,
    username: message.from.username ?? null,
    firstName: message.from.first_name ?? null,
    lang: replier.lang,
    purpose: "open",
    exp: nowMs + OPEN_TOKEN_TTL_MS,
  });
  logActivity("tz_link_sent");
  await replier.sayWithLink("TZ_LINK_MESSAGE", "TZ_BUTTON_LABEL", `${origin}/tz?token=${token}`);
}
