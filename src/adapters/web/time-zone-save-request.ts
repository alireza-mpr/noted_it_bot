import { readRecord, readString } from "../../generic/json/json-fields";

const MAX_BODY_LENGTH = 2048;

// Represents the body of a save from the time zone page: the save token and
// the time zone name the user picked; or why the body is refused.
export type TimeZoneSaveRequestResult =
  | { ok: true; token: string; timeZoneName: string }
  | { ok: false; reason: "too-large" | "bad-request" };

// Returns the token and the time zone name in the body of a save from the
// time zone page, e.g. {"token": "…", "timezone": "Asia/Tehran"}, or why the
// body is refused. Other fields are ignored.
export function parseTimeZoneSaveRequest(
  bodyText: string,
): TimeZoneSaveRequestResult {
  if (bodyText.length > MAX_BODY_LENGTH) {
    return { ok: false, reason: "too-large" };
  }
  try {
    const bodyRecord = readRecord(JSON.parse(bodyText), "the body");
    return {
      ok: true,
      token: readString(bodyRecord, "token"),
      timeZoneName: readString(bodyRecord, "timezone"),
    };
  } catch {
    return { ok: false, reason: "bad-request" };
  }
}
