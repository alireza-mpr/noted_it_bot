import type { GroqUsageRow } from "../db/schema/groqUsageRow";
import { groqUsageTableStatement } from "../db/schema/groqUsageTable";
import {
  MARK_GROQ_EXHAUSTED,
  RECORD_GROQ_ERROR,
  RECORD_GROQ_USAGE,
  SELECT_GROQ_USAGE,
} from "../db/sql/groqUsage";
import type { ProviderConfig } from "../providers/ProviderConfig";
import type { ProviderSuccess, ProviderFailure } from "../providers/providerClient";
import { GROQ_MODELS } from "../providers/registry";
import { dateTimeAest } from "../time/dateTimeAest";
import type { UsageRepository } from "../router/router";

// Used when a 429 does not say how long to wait.
const DEFAULT_RETRY_AFTER_SECONDS = 60;

// A model is available, unless a 429 told us to wait and that time has not
// passed yet.
export function isGroqModelAvailable(
  row: Pick<GroqUsageRow, "retryAfterUntil"> | undefined,
  nowMs: number,
): boolean {
  return !row || nowMs >= row.retryAfterUntil;
}

export class GroqUsageRepository implements UsageRepository {
  constructor(private readonly db: D1Database) {}

  async selectAvailableModels(now: Date): Promise<ProviderConfig[]> {
    const rows = await this.run<GroqUsageRow>(
      this.db.prepare(SELECT_GROQ_USAGE),
    );
    const rowByModel = new Map(rows.map((row) => [row.model, row]));

    return GROQ_MODELS.filter((candidate) =>
      isGroqModelAvailable(rowByModel.get(candidate.model), now.getTime()),
    );
  }

  async recordSuccess(model: ProviderConfig, answer: ProviderSuccess, now: Date): Promise<void> {
    const at = dateTimeAest(now);
    await this.run(
      this.db
        .prepare(RECORD_GROQ_USAGE)
        .bind(
          model.model,
          at,
          answer.rateLimit?.remainingRequests ?? null,
          answer.rateLimit?.limitRequests ?? null,
          at,
        ),
    );
  }

  // A 429 makes the model unavailable until its retry-after time. Which limit
  // was hit does not matter. Every failure is stored as the last error.
  async recordFailure(model: ProviderConfig, failure: ProviderFailure, message: string, now: Date): Promise<void> {
    const at = dateTimeAest(now);
    const statements = [this.db.prepare(RECORD_GROQ_ERROR).bind(model.model, at, message, at)];
    if (failure.kind === "rateLimited") {
      const seconds = failure.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
      statements.unshift(
        this.db.prepare(MARK_GROQ_EXHAUSTED).bind(model.model, at, now.getTime() + seconds * 1000),
      );
    }
    await this.run(...statements);
  }

  // Runs the statements in one batch, after creating the table if needed.
  // Returns the first statement's rows.
  private async run<T = unknown>(...statements: D1PreparedStatement[]): Promise<T[]> {
    const results = await this.db.batch<T>([groqUsageTableStatement(this.db), ...statements]);
    return results[1].results;
  }
}
