import { AsyncLocalStorage } from "node:async_hooks";
import { AXIOM_DATASET, AXIOM_EDGE_DOMAIN, SERVICE_NAME } from "./axiomConfig";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

interface LogEvent extends LogFields {
  _time: string;
  level: LogLevel;
  source: string;
  message: string;
  correlation_id: string;
  service: string;
  version: string | undefined;
}

interface LogSession {
  correlationId: string;
  version: string | undefined;
  token: string | undefined;
  fields: LogFields;
  events: LogEvent[];
}

export interface LogSessionEnv {
  AXIOM_TOKEN?: string;
  APP_VERSION?: string;
}

const MAX_TEXT_LENGTH = 10_000;
const MAX_EVENTS_PER_SESSION = 500;

const sessions = new AsyncLocalStorage<LogSession>();

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? `${text.slice(0, MAX_TEXT_LENGTH)}…[truncated ${text.length - MAX_TEXT_LENGTH} chars]`
    : text;
}

function truncateFields(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === "string" ? truncate(value) : value,
    ]),
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function describeError(err: unknown): LogFields {
  return { error: err instanceof Error ? (err.stack ?? err.message) : String(err) };
}

function emit(
  level: LogLevel,
  source: string,
  message: string,
  fields: LogFields | undefined,
): void {
  const text = truncate(message);
  const session = sessions.getStore();

  console[level](
    safeStringify({
      level,
      source,
      message: text,
      correlation_id: session?.correlationId,
      ...(fields && truncateFields(fields)),
    }),
  );

  if (!session || session.events.length >= MAX_EVENTS_PER_SESSION) {
    return;
  }
  session.events.push({
    ...session.fields,
    ...(fields && truncateFields(fields)),
    _time: new Date().toISOString(),
    level,
    source,
    message: text,
    correlation_id: session.correlationId,
    service: SERVICE_NAME,
    version: session.version,
  });
}

export class Logger {
  constructor(private readonly source: string) {}

  debug(message: string, fields?: LogFields): void {
    emit("debug", this.source, message, fields);
  }

  info(message: string, fields?: LogFields): void {
    emit("info", this.source, message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    emit("warn", this.source, message, fields);
  }

  error(message: string, fields?: LogFields): void {
    emit("error", this.source, message, fields);
  }
}

export function setLogField(key: string, value: unknown): void {
  const session = sessions.getStore();
  if (session) {
    session.fields[key] = value;
  }
}

export function currentCorrelationId(): string | undefined {
  return sessions.getStore()?.correlationId;
}

async function flush(session: LogSession): Promise<void> {
  if (!session.token || session.events.length === 0) {
    return;
  }

  try {
    const response = await fetch(
      `https://${AXIOM_EDGE_DOMAIN}/v1/ingest/${AXIOM_DATASET}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: safeStringify(session.events),
      },
    );
    if (!response.ok) {
      console.error(
        "Logger: Axiom ingest failed",
        response.status,
        truncate((await response.text()).slice(0, 500)),
      );
    }
  } catch (err) {
    console.error("Logger: Axiom ingest threw", err);
  }
}

export async function runLogSession<T>(
  env: LogSessionEnv,
  ctx: Pick<ExecutionContext, "waitUntil">,
  fn: () => Promise<T>,
): Promise<T> {
  const session: LogSession = {
    correlationId: crypto.randomUUID(),
    version: env.APP_VERSION,
    token: env.AXIOM_TOKEN,
    fields: {},
    events: [],
  };

  try {
    return await sessions.run(session, fn);
  } finally {
    ctx.waitUntil(flush(session));
  }
}
