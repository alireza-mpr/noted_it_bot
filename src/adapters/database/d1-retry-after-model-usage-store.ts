import {
  dateTimeTextIn,
  timeZoneNamed,
} from "../../generic/date-time/time-zone";
import type { Model } from "../models/model";
import {
  describeModelFailure,
  type ModelAnswer,
  type ModelFailure,
} from "../models/model-result";
import type { ModelUsageStore } from "../models/model-usage-store";
import { batchWithTable } from "./batch-with-table";

// The table's *Aest columns show the time in Melbourne.
const AEST = timeZoneNamed("Australia/Melbourne");
// Used when a 429 does not say how long to wait.
const DEFAULT_RETRY_AFTER_SECONDS = 60;

const CREATE_MODEL_USAGE_TABLE = `
CREATE TABLE IF NOT EXISTS groq_usage (
  model    TEXT NOT NULL PRIMARY KEY,
  aestTime TEXT NOT NULL DEFAULT '',
  remainingRequests INTEGER,
  limitRequests     INTEGER,
  retryAfterUntil INTEGER NOT NULL DEFAULT 0,
  lastError       TEXT NOT NULL DEFAULT '',
  lastErrorAest   TEXT NOT NULL DEFAULT '',
  lastSuccessAest TEXT NOT NULL DEFAULT ''
)`;

const SELECT_RETRY_TIMES = `
SELECT model, retryAfterUntil
FROM groq_usage`;

const RECORD_ANSWER = `
INSERT INTO groq_usage (model, aestTime, remainingRequests, limitRequests, lastSuccessAest)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(model) DO UPDATE SET
  aestTime          = excluded.aestTime,
  remainingRequests = COALESCE(excluded.remainingRequests, remainingRequests),
  limitRequests     = COALESCE(excluded.limitRequests, limitRequests),
  lastSuccessAest   = excluded.lastSuccessAest`;

const MARK_USED_UP = `
INSERT INTO groq_usage (model, aestTime, retryAfterUntil)
VALUES (?, ?, ?)
ON CONFLICT(model) DO UPDATE SET
  aestTime        = excluded.aestTime,
  retryAfterUntil = excluded.retryAfterUntil`;

const RECORD_FAILURE = `
INSERT INTO groq_usage (model, aestTime, lastError, lastErrorAest)
VALUES (?, ?, ?, ?)
ON CONFLICT(model) DO UPDATE SET
  lastError     = excluded.lastError,
  lastErrorAest = excluded.lastErrorAest`;

// Represents model usage stored in D1 as a retry time: a model is used up
// until the time its last 429 gave. Which limit it hit does not matter. See
// ADR-4 in ARCHITECTURE_DECISIONS_REGISTRY.md.
export class D1RetryAfterModelUsageStore implements ModelUsageStore {
  constructor(
    private readonly d1Database: D1Database,
    private readonly models: readonly Model[],
  ) {}

  // Returns the models whose retry time has passed, in the order to try them.
  async availableModels(now: Date): Promise<readonly Model[]> {
    const retryTimeRows = await this.run<RetryTimeRow>(
      this.d1Database.prepare(SELECT_RETRY_TIMES),
    );
    const retryAfterUntilByName = new Map(
      retryTimeRows.map((retryTimeRow) => [
        retryTimeRow.model,
        retryTimeRow.retryAfterUntil,
      ]),
    );
    return this.models.filter(
      (model) => now.getTime() >= (retryAfterUntilByName.get(model.name) ?? 0),
    );
  }

  // Records a model's answer, with the daily request count the provider
  // reported.
  async recordAnswer(modelAnswer: ModelAnswer, now: Date): Promise<void> {
    const aestTime = dateTimeTextIn(AEST, now);
    await this.run(
      this.d1Database
        .prepare(RECORD_ANSWER)
        .bind(
          modelAnswer.model.name,
          aestTime,
          modelAnswer.dailyRequests?.remaining ?? null,
          modelAnswer.dailyRequests?.limit ?? null,
          aestTime,
        ),
    );
  }

  // Records the failure as the model's last error. A 429 also makes the model
  // used up until its retry time.
  async recordFailure(
    model: Model,
    modelFailure: ModelFailure,
    now: Date,
  ): Promise<void> {
    const aestTime = dateTimeTextIn(AEST, now);
    const recordFailureStatement = this.d1Database
      .prepare(RECORD_FAILURE)
      .bind(model.name, aestTime, describeModelFailure(modelFailure), aestTime);
    if (modelFailure.kind !== "rate-limited") {
      await this.run(recordFailureStatement);
      return;
    }
    const retryAfterSeconds =
      modelFailure.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
    const markUsedUpStatement = this.d1Database
      .prepare(MARK_USED_UP)
      .bind(model.name, aestTime, now.getTime() + retryAfterSeconds * 1000);
    await this.run(markUsedUpStatement, recordFailureStatement);
  }

  // Runs the statements in one batch, and returns the first statement's rows.
  private async run<Row = unknown>(
    ...statements: D1PreparedStatement[]
  ): Promise<Row[]> {
    const [firstD1Result] = await batchWithTable<Row>(
      this.d1Database,
      CREATE_MODEL_USAGE_TABLE,
      statements,
    );
    return firstD1Result.results;
  }
}

// Represents when a model may be tried again, in milliseconds since 1970.
interface RetryTimeRow {
  model: string;
  retryAfterUntil: number;
}
