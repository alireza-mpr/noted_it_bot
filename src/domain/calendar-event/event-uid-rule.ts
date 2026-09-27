import { sha256Hex } from "../../generic/hash/sha256-hex";
import type { EventUid } from "./calendar-event";

// The part after "@" in every event UID, so our UIDs never match another
// app's UIDs.
const EVENT_UID_DOMAIN = "notedit";

// Returns the event UID of a message. See "The same message, forwarded
// again" in docs/EDGE_CASES.md.
export async function eventUidOf(messageText: string): Promise<EventUid> {
  const messageHash = await sha256Hex(messageText.trim());
  return `${messageHash}@${EVENT_UID_DOMAIN}` as EventUid;
}
