import { Logger, type LogFields } from "./logger";

// Logs a user action as one "user activity" event, with an `activity` field.
// In Axiom you can then list a user's history (where userId == …) or count one
// action (where activity == "tz_set"). userId, username and firstName come
// from the log session.
export type Activity =
  | "start"
  | "ver"
  | "diag"
  | "lang_set"
  | "lang_reset"
  | "tz_link_sent"
  | "tz_page_opened"
  | "tz_set"
  | "event_requested"
  | "quota_exhausted"
  | "bot_blocked"
  | "bot_unblocked";

const logger = new Logger("activity");

export function logActivity(activity: Activity, fields?: LogFields): void {
  logger.info("user activity", { activity, ...fields });
}
