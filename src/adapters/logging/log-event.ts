// Represents how serious a log event is.
export type LogLevel = "debug" | "info" | "warn" | "error";

// Represents the data of a log event, with OpenTelemetry attribute names, e.g.
// { "user.id": 42 }. See "Logging" in CODE_STRUCTURE.md.
export type LogAttributes = Record<string, unknown>;

// Represents one log event, with the field names of an OpenTelemetry log
// record.
export interface LogEvent extends LogAttributes {
  // Axiom reads _time as the event's time.
  _time: string;
  severityText: string;
  severityNumber: number;
  eventName: string;
  traceId: string;
  "scope.name": string;
  "service.name": string;
  "service.version": string | null;
  "log_session.seq": number;
}

// Returns the OpenTelemetry exception attributes of an error: its type, its
// message and its stack trace.
export function exceptionAttributesOf(error: unknown): LogAttributes {
  if (error instanceof Error) {
    return {
      "exception.type": error.name,
      "exception.message": error.message,
      "exception.stacktrace": error.stack,
    };
  }
  return { "exception.message": String(error) };
}
