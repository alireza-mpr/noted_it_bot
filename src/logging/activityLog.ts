import { Logger, type LogFields } from "./logger";

// What a user did, as one "user activity" event with an `activity` field, so
// Axiom can list a user's history (where userId == …) or count one action
// (where activity == "tz_set"). userId and username come from the log session.
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
