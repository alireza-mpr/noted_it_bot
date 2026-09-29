import { safeJsonStringify } from "../../generic/json/safe-json-stringify";
import { truncateText } from "../../generic/text/truncate-text";
import type { LogAttributes, LogLevel } from "./log-event";
import { recordLogEvent } from "./log-session";

const MAX_TEXT_LENGTH = 10_000;

// Represents a logger for one part of the code (its scope), e.g. the router.
// EventName lists the event names it may log, e.g. "quota.consumed". Writes
// each log event to the console, and records it in the current log session.
export class Logger<EventName extends string> {
  constructor(private readonly scopeName: string) {}

  // Logs a debug event.
  debug(eventName: EventName, logAttributes: LogAttributes = {}): void {
    this.log("debug", eventName, logAttributes);
  }

  // Logs an info event.
  info(eventName: EventName, logAttributes: LogAttributes = {}): void {
    this.log("info", eventName, logAttributes);
  }

  // Logs a warning event.
  warn(eventName: EventName, logAttributes: LogAttributes = {}): void {
    this.log("warn", eventName, logAttributes);
  }

  // Logs an error event.
  error(eventName: EventName, logAttributes: LogAttributes = {}): void {
    this.log("error", eventName, logAttributes);
  }

  private log(
    level: LogLevel,
    eventName: EventName,
    logAttributes: LogAttributes,
  ): void {
    const shortLogAttributes = truncateStrings(logAttributes);
    const logEvent = recordLogEvent(
      level,
      this.scopeName,
      eventName,
      shortLogAttributes,
    );
    console[level](
      safeJsonStringify({
        severityText: level.toUpperCase(),
        eventName,
        "scope.name": this.scopeName,
        trace_id: logEvent?.trace_id,
        "log_session.seq": logEvent?.["log_session.seq"],
        ...shortLogAttributes,
      }),
    );
  }
}

// Returns the attributes, with every text value truncated.
function truncateStrings(logAttributes: LogAttributes): LogAttributes {
  return Object.fromEntries(
    Object.entries(logAttributes).map(([attributeName, value]) => [
      attributeName,
      typeof value === "string" ? truncateText(value, MAX_TEXT_LENGTH) : value,
    ]),
  );
}
