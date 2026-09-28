import type { LogAttributes } from "./log-event";
import { Logger } from "./logger";

const LOGGER = new Logger<UserActivityEventName>("user-activity");

// Represents one thing a user did, e.g. set a time zone.
export type UserActivity =
  | "bot_started"
  | "help_requested"
  | "version_requested"
  | "models_checked"
  | "language_set"
  | "language_reset"
  | "time_zone_link_sent"
  | "time_zone_page_opened"
  | "time_zone_set"
  | "unknown_command_sent"
  | "event_requested"
  | "quota_used_up"
  | "bot_blocked"
  | "bot_unblocked";

// Logs a user activity as one event, e.g. user_activity.time_zone_set. The log
// session adds the user's attributes. So in Axiom you can list one user's
// history, or count one activity.
export function logUserActivity(
  userActivity: UserActivity,
  logAttributes: LogAttributes = {},
): void {
  LOGGER.info(`user_activity.${userActivity}`, logAttributes);
}

// Represents the event name of a user activity.
type UserActivityEventName = `user_activity.${UserActivity}`;
