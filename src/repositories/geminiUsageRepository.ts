import type { GeminiUsageRow } from "../db/schema/geminiUsageRow";
import { geminiUsageTableStatement } from "../db/schema/geminiUsageTable";
import {
  MARK_GEMINI_DAY_EXHAUSTED,
  MARK_GEMINI_MINUTE_EXHAUSTED,
  RECORD_GEMINI_ERROR,
  RECORD_GEMINI_USAGE,
  SELECT_GEMINI_EFFECTIVE_USAGE,
} from "../db/sql/geminiUsage";
import type { ProviderConfig } from "../providers/ProviderConfig";
import type { ProviderSuccess, ProviderFailure } from "../providers/providerClient";
import { GEMINI_MODELS } from "../providers/registry";
import { dateTimeAest } from "../time/dateTimeAest";
import { currentDay, currentMinute } from "../quotaLimit/quotaWindows";
import type { UsageRepository } from "../router/router";

type EffectiveUsage = Pick<GeminiUsageRow, "model" | "rpm" | "tpm" | "rpd">;

export class GeminiUsageRepository implements UsageRepository {
  constructor(private readonly db: D1Database) {}

  async selectAvailableModels(now: Date): Promise<ProviderConfig[]> {
    const minute = currentMinute(now);
    const rows = await this.run<EffectiveUsage>(
      this.db
        .prepare(SELECT_GEMINI_EFFECTIVE_USAGE)
        .bind(minute, minute, currentDay(now)),
    );
    const usageByModel = new Map(rows.map((row) => [row.model, row]));

    return GEMINI_MODELS.filter((candidate) => {
      const usage = usageByModel.get(candidate.model);
      const rpm = usage?.rpm ?? 0;
      const tpm = usage?.tpm ?? 0;
      const rpd = usage?.rpd ?? 0;
      const { rpm: rpmCap, tpm: tpmCap, rpd: rpdCap } = candidate.limits;
      return (
        (rpmCap === undefined || rpm < rpmCap) &&
        (tpmCap === undefined || tpm < tpmCap) &&
        (rpdCap === undefined || rpd < rpdCap)
      );
    });
  }

  async recordSuccess(model: ProviderConfig, answer: ProviderSuccess, now: Date): Promise<void> {
    const at = dateTimeAest(now);
    await this.run(
      this.db
        .prepare(RECORD_GEMINI_USAGE)
        .bind(model.model, currentDay(now), currentMinute(now), at, answer.totalTokens, at),
    );
  }

  // A 429 sets the model's count for that minute or day to its limit, so it is
  // skipped until the window ends. Every failure is stored as the last error.
  async recordFailure(model: ProviderConfig, failure: ProviderFailure, message: string, now: Date): Promise<void> {
    const at = dateTimeAest(now);
    const statements = [
      this.db
        .prepare(RECORD_GEMINI_ERROR)
        .bind(model.model, currentDay(now), currentMinute(now), at, message, at),
    ];
    if (failure.kind === "rateLimited") {
      const scope = failure.quotaLimitScope ?? "minute";
      const cap = scope === "day" ? model.limits.rpd : model.limits.rpm;
      if (cap !== undefined) {
        const sql = scope === "day" ? MARK_GEMINI_DAY_EXHAUSTED : MARK_GEMINI_MINUTE_EXHAUSTED;
        statements.unshift(
          this.db.prepare(sql).bind(model.model, currentDay(now), currentMinute(now), at, cap),
        );
      }
    }
    await this.run(...statements);
  }

  // Runs the statements in one batch, after creating the table if needed.
  // Returns the first statement's rows.
  private async run<T = unknown>(...statements: D1PreparedStatement[]): Promise<T[]> {
    const results = await this.db.batch<T>([geminiUsageTableStatement(this.db), ...statements]);
    return results[1].results;
  }
}
