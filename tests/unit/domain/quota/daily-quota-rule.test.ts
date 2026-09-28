import { describe, expect, it } from "vitest";
import {
  QUOTA_RESET_AFTER_MS,
  consumeUnit,
  refundUnit,
  remainingQuotaOf,
  type ConsumeResult,
} from "../../../../src/domain/quota/daily-quota-rule";
import type { QuotaUsage } from "../../../../src/domain/quota/quota-usage";

const DAILY_QUOTA = 3;
const START_MS = 1_800_000_000_000;
const UNUSED: QuotaUsage = { kind: "unused" };

const at = (ms: number) => new Date(ms);

// Returns the consumed result. Fails the test if the unit was refused.
function consumedOf(consumeResult: ConsumeResult) {
  if (!consumeResult.ok) {
    throw new Error("expected the unit to be consumed");
  }
  return consumeResult;
}

// Consumes one unit at each moment, and returns the quota usage after them.
function afterUses(...usedAtMs: number[]): QuotaUsage {
  return usedAtMs.reduce<QuotaUsage>(
    (quotaUsage, ms) => consumedOf(consumeUnit(quotaUsage, DAILY_QUOTA, at(ms))).quotaUsage,
    UNUSED,
  );
}

describe("consumeUnit", () => {
  it("counts down, then refuses with the time the quota is full again", () => {
    expect(consumedOf(consumeUnit(UNUSED, DAILY_QUOTA, at(START_MS))).remainingQuota).toBe(2);
    const usedUp = afterUses(START_MS, START_MS + 1, START_MS + 2);

    expect(usedUp).toEqual({ kind: "used", remainingQuota: 0, lastUsedAt: at(START_MS + 2) });
    expect(consumeUnit(usedUp, DAILY_QUOTA, at(START_MS + 3))).toEqual({
      ok: false,
      retryAt: at(START_MS + 2 + QUOTA_RESET_AFTER_MS),
    });
  });

  it("gives the full quota again 24 hours after the last use", () => {
    const usedUp = afterUses(START_MS, START_MS + 1, START_MS + 2);

    expect(remainingQuotaOf(usedUp, DAILY_QUOTA, at(START_MS + 2 + QUOTA_RESET_AFTER_MS - 1))).toBe(0);
    expect(consumedOf(consumeUnit(usedUp, DAILY_QUOTA, at(START_MS + 2 + QUOTA_RESET_AFTER_MS))).remainingQuota).toBe(2);
  });

  it("keeps what a refund needs: the usage before, and when the unit was consumed", () => {
    const beforeUse = afterUses(START_MS);

    expect(consumedOf(consumeUnit(beforeUse, DAILY_QUOTA, at(START_MS + 1))).quotaReservation).toEqual({
      previousQuotaUsage: beforeUse,
      consumedAt: at(START_MS + 1),
    });
  });
});

describe("refundUnit", () => {
  it("puts a new user back to a quota never used", () => {
    const consumed = consumedOf(consumeUnit(UNUSED, DAILY_QUOTA, at(START_MS)));

    expect(refundUnit(consumed.quotaUsage, consumed.quotaReservation, DAILY_QUOTA)).toEqual(UNUSED);
  });

  it("does not move the reset time", () => {
    const beforeUse = afterUses(START_MS, START_MS + 1);
    const consumed = consumedOf(consumeUnit(beforeUse, DAILY_QUOTA, at(START_MS + 2)));

    expect(refundUnit(consumed.quotaUsage, consumed.quotaReservation, DAILY_QUOTA)).toEqual({
      kind: "used",
      remainingQuota: 1,
      lastUsedAt: at(START_MS + 1),
    });
  });

  it("gives back one unit when another unit was used after the refunded one", () => {
    const first = consumedOf(consumeUnit(UNUSED, DAILY_QUOTA, at(START_MS)));
    const afterSecondUse = consumedOf(consumeUnit(first.quotaUsage, DAILY_QUOTA, at(START_MS + 1))).quotaUsage;

    expect(refundUnit(afterSecondUse, first.quotaReservation, DAILY_QUOTA)).toEqual({
      kind: "used",
      remainingQuota: 2,
      lastUsedAt: at(START_MS + 1),
    });
  });

  it("never gives back more than the daily quota", () => {
    const first = consumedOf(consumeUnit(UNUSED, DAILY_QUOTA, at(START_MS)));
    const full: QuotaUsage = { kind: "used", remainingQuota: DAILY_QUOTA, lastUsedAt: at(START_MS + 5) };

    expect(refundUnit(full, first.quotaReservation, DAILY_QUOTA)).toMatchObject({ remainingQuota: DAILY_QUOTA });
  });
});
