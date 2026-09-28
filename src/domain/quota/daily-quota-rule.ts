import type { QuotaUsage } from "./quota-usage";

// The time after the last use when a user's daily quota is full again. See
// ADR-1 in ARCHITECTURE_DECISIONS.md.
export const QUOTA_RESET_AFTER_MS = 24 * 60 * 60 * 1000;

// Represents what refunding a unit needs: the quota usage before the unit
// was consumed, and when it was consumed.
export interface QuotaReservation {
  previousQuotaUsage: QuotaUsage;
  consumedAt: Date;
}

// Represents the result of consuming a unit: the new quota usage, the units
// left, and the reservation for a refund; or when the user can try again.
export type ConsumeResult =
  | {
      ok: true;
      quotaUsage: QuotaUsage;
      remainingQuota: number;
      quotaReservation: QuotaReservation;
    }
  | { ok: false; retryAt: Date };

// Consumes one unit of the daily quota, if one is left. The quota is full
// again 24 hours after the last use. See ADR-1 in ARCHITECTURE_DECISIONS.md.
export function consumeUnit(
  quotaUsage: QuotaUsage,
  dailyQuota: number,
  now: Date,
): ConsumeResult {
  const remainingQuota = remainingQuotaOf(quotaUsage, dailyQuota, now);
  if (remainingQuota <= 0) {
    const lastUsedAt = quotaUsage.kind === "used" ? quotaUsage.lastUsedAt : now;
    return { ok: false, retryAt: new Date(lastUsedAt.getTime() + QUOTA_RESET_AFTER_MS) };
  }
  return {
    ok: true,
    quotaUsage: { kind: "used", remainingQuota: remainingQuota - 1, lastUsedAt: now },
    remainingQuota: remainingQuota - 1,
    quotaReservation: { previousQuotaUsage: quotaUsage, consumedAt: now },
  };
}

// Returns the quota usage with a consumed unit given back, for a message
// that no model answered. If no other unit was used since, the usage goes
// back exactly to how it was, so the reset time does not move. Otherwise one
// unit is given back, up to the daily quota. See ADR-3 in
// ARCHITECTURE_DECISIONS.md.
export function refundUnit(
  quotaUsage: QuotaUsage,
  quotaReservation: QuotaReservation,
  dailyQuota: number,
): QuotaUsage {
  if (quotaUsage.kind === "unused") {
    return quotaUsage;
  }
  if (quotaUsage.lastUsedAt.getTime() === quotaReservation.consumedAt.getTime()) {
    return quotaReservation.previousQuotaUsage;
  }
  return {
    ...quotaUsage,
    remainingQuota: Math.min(quotaUsage.remainingQuota + 1, dailyQuota),
  };
}

// Returns the units left now: the full daily quota if the quota was never
// used, or if 24 hours have passed since the last use.
export function remainingQuotaOf(
  quotaUsage: QuotaUsage,
  dailyQuota: number,
  now: Date,
): number {
  if (quotaUsage.kind === "unused") {
    return dailyQuota;
  }
  const isReset = now.getTime() - quotaUsage.lastUsedAt.getTime() >= QUOTA_RESET_AFTER_MS;
  return isReset ? dailyQuota : quotaUsage.remainingQuota;
}
