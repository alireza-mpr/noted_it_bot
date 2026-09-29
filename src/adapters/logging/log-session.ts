import { AsyncLocalStorage } from "node:async_hooks";
import type { Env } from "../../config/env";
import { sendToAxiom } from "./axiom";
import type { LogAttributes, LogEvent, LogLevel } from "./log-event";

const MAX_LOG_EVENTS_PER_SESSION = 1000;
const SERVICE_NAME = "noted-it-bot";
// The lowest number of each OpenTelemetry severity range.
const SEVERITY_NUMBERS: Record<LogLevel, number> = {
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
};
const LOG_SESSION_STORAGE = new AsyncLocalStorage<LogSession>();

// Represents the Env values a log session reads. Both can be missing, e.g. in
// local development.
export type LogSessionEnv = Partial<Pick<Env, "AXIOM_TOKEN" | "APP_VERSION">>;

// Runs a function in a new log session. At the end, sends the session's log
// events to Axiom in one batch, even when the function throws.
export async function runLogSession<T>(
  logSessionEnv: LogSessionEnv,
  executionContext: Pick<ExecutionContext, "waitUntil">,
  run: () => Promise<T>,
): Promise<T> {
  const logSession: LogSession = {
    traceId: newTraceId(),
    lastSeq: 0,
    appVersion: logSessionEnv.APP_VERSION ?? null,
    sessionAttributes: {},
    logEvents: [],
  };
  try {
    return await LOG_SESSION_STORAGE.run(logSession, run);
  } finally {
    const axiomToken = logSessionEnv.AXIOM_TOKEN;
    if (axiomToken && logSession.logEvents.length > 0) {
      executionContext.waitUntil(sendToAxiom(axiomToken, logSession.logEvents));
    }
  }
}

// Records a log event in the current log session, and returns it with its seq
// and trace id. Returns null outside a log session. A full session keeps no
// more events, but still returns them.
export function recordLogEvent(
  level: LogLevel,
  scopeName: string,
  eventName: string,
  logAttributes: LogAttributes,
): LogEvent | null {
  const logSession = LOG_SESSION_STORAGE.getStore();
  if (!logSession) {
    return null;
  }
  logSession.lastSeq += 1;
  const logEvent: LogEvent = {
    ...logSession.sessionAttributes,
    ...logAttributes,
    _time: new Date().toISOString(),
    severityText: level.toUpperCase(),
    severityNumber: SEVERITY_NUMBERS[level],
    eventName,
    trace_id: logSession.traceId,
    "scope.name": scopeName,
    "service.name": SERVICE_NAME,
    "service.version": logSession.appVersion,
    "log_session.seq": logSession.lastSeq,
  };
  if (logSession.logEvents.length < MAX_LOG_EVENTS_PER_SESSION) {
    logSession.logEvents.push(logEvent);
  }
  return logEvent;
}

// Adds an attribute to every later log event of the current log session, e.g.
// the user's id. Does nothing outside a log session.
export function setLogAttribute(attributeName: string, value: unknown): void {
  const logSession = LOG_SESSION_STORAGE.getStore();
  if (logSession) {
    logSession.sessionAttributes[attributeName] = value;
  }
}

// Returns the trace id of the current log session, or null outside a log
// session.
export function currentTraceId(): string | null {
  return LOG_SESSION_STORAGE.getStore()?.traceId ?? null;
}

// Represents the log events of one request, and what they share.
interface LogSession {
  traceId: string;
  lastSeq: number;
  appVersion: string | null;
  sessionAttributes: LogAttributes;
  logEvents: LogEvent[];
}

// Returns a new OpenTelemetry trace id: 32 lowercase hex characters.
function newTraceId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
