import { nestedRecordOf } from "../../generic/json/nested-record";
import { safeJsonStringify } from "../../generic/json/safe-json-stringify";
import { truncateText } from "../../generic/text/truncate-text";
import type { LogEvent } from "./log-event";

const AXIOM_DATASET = "app-logs";
const AXIOM_EDGE_DOMAIN = "us-east-1.aws.edge.axiom.co";
const MAX_FAILURE_TEXT_LENGTH = 500;

// Sends log events to Axiom in one batch, with each dotted name as nested
// fields, e.g. "user.id" as { user: { id } }. Axiom's filters read a dot as a
// nested field, so a flat "user.id" would not be found. Never throws: a
// failure is only written to the console.
export async function sendToAxiom(
  axiomToken: string,
  logEvents: readonly LogEvent[],
): Promise<void> {
  try {
    const response = await fetch(
      `https://${AXIOM_EDGE_DOMAIN}/v1/ingest/${AXIOM_DATASET}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${axiomToken}`,
          "Content-Type": "application/json",
        },
        body: safeJsonStringify(logEvents.map(nestedRecordOf)),
      },
    );
    if (!response.ok) {
      console.error(
        "Logger: Axiom ingest failed",
        response.status,
        truncateText(await response.text(), MAX_FAILURE_TEXT_LENGTH),
      );
    }
  } catch (error) {
    console.error("Logger: Axiom ingest threw", error);
  }
}
