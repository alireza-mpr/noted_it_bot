import { Logger, describeError } from "../logging/logger";
import type { Router } from "../router/router";

const logger = new Logger("resolveTimezoneFromHint");

const TIMEZONE_SYSTEM_PROMPT =
  "The user names a place (a city, region or country), possibly informally and in any language. " +
  "Reply with only the IANA time zone identifier that place uses, e.g. 'Australia/Melbourne', " +
  "'Asia/Tehran' or 'America/New_York'. If the place spans several time zones, choose the one of " +
  "its capital or most populous city. If you cannot confidently identify a real place, reply with " +
  "exactly: UNKNOWN";

// The canonical IANA name ("asia/tehran" becomes "Asia/Tehran"), or null when
// Intl doesn't know it. Only Area/Location names and UTC/GMT are accepted, so
// legacy aliases such as "EST" don't slip through as if they were places.
export function canonicalTimezone(name: string): string | null {
  const trimmed = name.trim();
  if (!/^[A-Za-z_+\-0-9]+(\/[A-Za-z_+\-0-9]+)+$/.test(trimmed) && !/^(utc|gmt)$/i.test(trimmed)) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("en", { timeZone: trimmed }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

// Turns free text ("Melbourne", "Iran", "طهران", or an exact name such as
// "Asia/Tehran") into an IANA time zone. An exact name is checked locally;
// anything else is put to a model, and its answer is validated against Intl so
// an invented zone is never stored. Returns null if it can't be resolved.
export async function resolveTimezoneFromHint(router: Router, input: string): Promise<string | null> {
  const trimmed = input.trim();
  const direct = canonicalTimezone(trimmed);
  if (direct) {
    return direct;
  }

  try {
    const answer = await router.generate({
      systemPrompt: TIMEZONE_SYSTEM_PROMPT,
      userPrompt: trimmed,
      temperature: 0,
    });
    if (answer.result === "failed") {
      logger.error("no model answered", { failure: answer.failure });
      return null;
    }

    const reply = answer.text.trim().replace(/^["'`]+|["'`.]+$/g, "");
    if (!reply || reply === "UNKNOWN") {
      return null;
    }
    const resolved = canonicalTimezone(reply);
    if (!resolved) {
      logger.warn("model returned an invalid time zone", { reply });
    }
    return resolved;
  } catch (err) {
    logger.error("threw", describeError(err));
    return null;
  }
}
