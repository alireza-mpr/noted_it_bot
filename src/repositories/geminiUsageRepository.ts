import type { GeminiUsageRow } from "../db/schema/geminiUsageRow";
import { geminiUsageTableStatement } from "../db/schema/geminiUsageTable";
import {
  MARK_GEMINI_DAY_EXHAUSTED,
  MARK_GEMINI_MINUTE_EXHAUSTED,
  RECORD_GEMINI_ERROR,
  RECORD_GEMINI_USAGE,
  SELECT_GEMINI_EFFECTIVE_USAGE,
} from "../db/sql/geminiUsage";
import type { ProviderConfig } from "../lib/providers/ProviderConfig";
import type { QuotaLimitScope } from "../lib/quotaLimit/quotaLimitScope";
import { GEMINI_MODELS } from "../lib/providers/registry";
import { dateTimeAest } from "../lib/time/dateTimeAest";
import { currentDay, currentMinute } from "../lib/quotaLimit/quotaWindows";
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

  async recordUsage(
    model: ProviderConfig,
    tokens: number,
    now: Date,
  ): Promise<void> {
    await this.run(
      this.db
        .prepare(RECORD_GEMINI_USAGE)
        .bind(
          model.model,
          currentDay(now),
          currentMinute(now),
          dateTimeAest(now),
          tokens,
        ),
    );
  }

  async markQuotaExhausted(
    model: ProviderConfig,
    quotaLimitScope: QuotaLimitScope,
    now: Date,
  ): Promise<void> {
    const cap = quotaLimitScope === "day" ? model.limits.rpd : model.limits.rpm;
    if (cap === undefined) {
      return;
    }
    const sql =
      quotaLimitScope === "day"
        ? MARK_GEMINI_DAY_EXHAUSTED
        : MARK_GEMINI_MINUTE_EXHAUSTED;
    await this.run(
      this.db
        .prepare(sql)
        .bind(
          model.model,
          currentDay(now),
          currentMinute(now),
          dateTimeAest(now),
          cap,
        ),
    );
  }

  async recordError(
    model: ProviderConfig,
    message: string,
    now: Date,
  ): Promise<void> {
    const at = dateTimeAest(now);
    await this.run(
      this.db
        .prepare(RECORD_GEMINI_ERROR)
        .bind(
          model.model,
          currentDay(now),
          currentMinute(now),
          at,
          message,
          at,
        ),
    );
  }

  private async run<T = unknown>(statement: D1PreparedStatement): Promise<T[]> {
    const results = await this.db.batch<T>([
      geminiUsageTableStatement(this.db),
      statement,
    ]);
    return results[1].results;
  }
}
