import {
  dateTimeTextIn,
  timeZoneNamed,
  type IanaTimeZone,
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

const CREATE_MODEL_USAGE_TABLE = `
CREATE TABLE IF NOT EXISTS gemini_usage (
  model    TEXT NOT NULL PRIMARY KEY,
  day      TEXT NOT NULL,
  minute   TEXT NOT NULL,
  aestTime TEXT NOT NULL,
  rpm      INTEGER NOT NULL DEFAULT 0,
  tpm      INTEGER NOT NULL DEFAULT 0,
  rpd      INTEGER NOT NULL DEFAULT 0,
  lastError     TEXT NOT NULL DEFAULT '',
  lastErrorAest TEXT NOT NULL DEFAULT '',
  lastSuccessAest TEXT NOT NULL DEFAULT ''
)`;

const SELECT_CURRENT_USAGE = `
SELECT
  model,
  CASE WHEN minute = ? THEN rpm ELSE 0 END AS rpm,
  CASE WHEN minute = ? THEN tpm ELSE 0 END AS tpm,
  CASE WHEN day    = ? THEN rpd ELSE 0 END AS rpd
FROM gemini_usage`;

const RECORD_ANSWER = `
INSERT INTO gemini_usage (model, day, minute, aestTime, rpm, tpm, rpd, lastSuccessAest)
VALUES (?, ?, ?, ?, 1, ?, 1, ?)
ON CONFLICT(model) DO UPDATE SET
  rpd    = CASE WHEN day    = excluded.day    THEN rpd + 1 ELSE 1 END,
  rpm    = CASE WHEN minute = excluded.minute THEN rpm + 1 ELSE 1 END,
  tpm    = CASE WHEN minute = excluded.minute THEN tpm + excluded.tpm ELSE excluded.tpm END,
  day    = excluded.day,
  minute = excluded.minute,
  aestTime = excluded.aestTime,
  lastSuccessAest = excluded.lastSuccessAest`;

// The last two parameters are the lowest rpm and rpd to keep: the limit for
// the window that the 429 names, and 0 for the other window.
const MARK_USED_UP = `
INSERT INTO gemini_usage (model, day, minute, aestTime, rpm, tpm, rpd)
VALUES (?, ?, ?, ?, ?, 0, ?)
ON CONFLICT(model) DO UPDATE SET
  rpm    = MAX(CASE WHEN minute = excluded.minute THEN rpm ELSE 0 END, excluded.rpm),
  tpm    = CASE WHEN minute = excluded.minute THEN tpm ELSE 0 END,
  rpd    = MAX(CASE WHEN day    = excluded.day    THEN rpd ELSE 0 END, excluded.rpd),
  day    = excluded.day,
  minute = excluded.minute,
  aestTime = excluded.aestTime`;

const RECORD_FAILURE = `
INSERT INTO gemini_usage (model, day, minute, aestTime, lastError, lastErrorAest)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(model) DO UPDATE SET
  lastError     = excluded.lastError,
  lastErrorAest = excluded.lastErrorAest`;

// Represents model usage stored in D1 as counts: requests and tokens in the
// current minute, and requests in the current day, per model. A model at one
// of its limits is used up until that minute or day ends. See ADR-4 in
// ARCHITECTURE_DECISIONS_REGISTRY.md.
export class D1CountedModelUsageStore implements ModelUsageStore {
  constructor(
    private readonly d1Database: D1Database,
    private readonly models: readonly Model[],
    private readonly dayTimeZone: IanaTimeZone,
  ) {}

  // Returns the models that are under all their limits, in the order to try
  // them.
  async availableModels(now: Date): Promise<readonly Model[]> {
    const minute = minuteOf(now);
    const modelUsageRows = await this.run<ModelUsageRow>(
      this.d1Database
        .prepare(SELECT_CURRENT_USAGE)
        .bind(minute, minute, this.dayOf(now)),
    );
    const modelUsageRowByName = new Map(
      modelUsageRows.map((modelUsageRow) => [modelUsageRow.model, modelUsageRow]),
    );
    return this.models.filter((model) =>
      isUnderLimits(model, modelUsageRowByName.get(model.name) ?? null),
    );
  }

  // Counts a model's answer: one request, and its tokens.
  async recordAnswer(modelAnswer: ModelAnswer, now: Date): Promise<void> {
    const aestTime = dateTimeTextIn(AEST, now);
    await this.run(
      this.d1Database
        .prepare(RECORD_ANSWER)
        .bind(
          modelAnswer.model.name,
          this.dayOf(now),
          minuteOf(now),
          aestTime,
          modelAnswer.totalTokens,
          aestTime,
        ),
    );
  }

  // Records the failure as the model's last error. A 429 also sets the
  // model's count for its minute or day to the limit, so the model is skipped
  // until that minute or day ends.
  async recordFailure(
    model: Model,
    modelFailure: ModelFailure,
    now: Date,
  ): Promise<void> {
    const day = this.dayOf(now);
    const minute = minuteOf(now);
    const aestTime = dateTimeTextIn(AEST, now);
    const recordFailureStatement = this.d1Database
      .prepare(RECORD_FAILURE)
      .bind(model.name, day, minute, aestTime, describeModelFailure(modelFailure), aestTime);
    if (modelFailure.kind !== "rate-limited") {
      await this.run(recordFailureStatement);
      return;
    }
    const usedUpForDay = modelFailure.limitWindow === "day";
    const markUsedUpStatement = this.d1Database
      .prepare(MARK_USED_UP)
      .bind(
        model.name,
        day,
        minute,
        aestTime,
        usedUpForDay ? 0 : model.limits.requestsPerMinute,
        usedUpForDay ? model.limits.requestsPerDay : 0,
      );
    await this.run(markUsedUpStatement, recordFailureStatement);
  }

  // Returns the day of a moment in the provider's day time zone, e.g.
  // "2026-09-28".
  private dayOf(now: Date): string {
    return dateTimeTextIn(this.dayTimeZone, now).slice(0, "YYYY-MM-DD".length);
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

// Represents a model's counts in the current minute and day.
interface ModelUsageRow {
  model: string;
  rpm: number;
  tpm: number;
  rpd: number;
}

function isUnderLimits(model: Model, modelUsageRow: ModelUsageRow | null): boolean {
  if (modelUsageRow === null) {
    return true;
  }
  return (
    modelUsageRow.rpm < model.limits.requestsPerMinute &&
    modelUsageRow.tpm < model.limits.tokensPerMinute &&
    modelUsageRow.rpd < model.limits.requestsPerDay
  );
}

// Returns the UTC minute of a moment, e.g. "2026-09-28T14:05".
function minuteOf(now: Date): string {
  return now.toISOString().slice(0, "YYYY-MM-DDTHH:MM".length);
}
