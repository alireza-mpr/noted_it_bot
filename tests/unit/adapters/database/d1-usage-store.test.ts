import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1UsageStore } from "../../../../src/adapters/database/d1-usage-store";
import type { QuotaReservation, QuotaResult } from "../../../../src/domain/quota/usage-store";
import { QUOTA_RESET_AFTER_MS } from "../../../../src/domain/quota/user-quota-policy";

const TEST_DB = (env as unknown as { TEST_DB: D1Database }).TEST_DB;
const DAILY_QUOTA = 3;
const USER_ID = 42;
const START_MS = 1_800_000_000_000;

const at = (ms: number) => new Date(ms);

// Returns the reservation of an allowed use. Fails the test if the use was
// refused.
function reservationOf(quotaResult: QuotaResult): QuotaReservation {
  if (!quotaResult.ok) {
    throw new Error("expected the quota use to be allowed");
  }
  return quotaResult.reservation;
}

// Returns the user's row as it is stored.
function storedUserUsage() {
  return TEST_DB.prepare("SELECT remainingQuota, lastUsedAt FROM user_usage WHERE userId = ?")
    .bind(USER_ID)
    .first();
}

describe("D1UsageStore", () => {
  let usageStore: D1UsageStore;

  beforeEach(async () => {
    await TEST_DB.exec("DROP TABLE IF EXISTS user_usage");
    usageStore = new D1UsageStore(TEST_DB);
  });

  it("counts down and then refuses without writing", async () => {
    expect(await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS))).toMatchObject({ ok: true, remaining: 2 });
    expect(await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS + 1))).toMatchObject({ ok: true, remaining: 1 });
    expect(await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS + 2))).toMatchObject({ ok: true, remaining: 0 });

    const refused = await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS + 3));
    expect(refused).toEqual({ ok: false, retryAt: at(START_MS + 2 + QUOTA_RESET_AFTER_MS) });
    expect(await storedUserUsage()).toEqual({ remainingQuota: 0, lastUsedAt: START_MS + 2 });
  });

  it("resets once the quota reset time has passed", async () => {
    for (let i = 0; i < DAILY_QUOTA; i++) await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS + i));

    const later = await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS + 2 + QUOTA_RESET_AFTER_MS));
    expect(later).toMatchObject({ ok: true, remaining: 2 });
  });

  it("lets only the units that are left through when messages race", async () => {
    const quotaResults = await Promise.all(
      Array.from({ length: 10 }, () => usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS))),
    );

    expect(quotaResults.filter((quotaResult) => quotaResult.ok)).toHaveLength(DAILY_QUOTA);
    expect(await storedUserUsage()).toMatchObject({ remainingQuota: 0 });
  });

  it("refunds a new user back to a fresh state", async () => {
    await usageStore.refund(reservationOf(await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS))));

    expect(await storedUserUsage()).toEqual({ remainingQuota: DAILY_QUOTA, lastUsedAt: 0 });
  });

  it("refunds without moving the reset time", async () => {
    await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS));
    await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS + 1));
    await usageStore.refund(reservationOf(await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS + 2))));

    expect(await storedUserUsage()).toEqual({ remainingQuota: 1, lastUsedAt: START_MS + 1 });
  });

  it("gives back one unit when another consume happened after the refunded one", async () => {
    const firstReservation = reservationOf(await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS)));
    await usageStore.tryConsume(USER_ID, DAILY_QUOTA, at(START_MS + 1));
    await usageStore.refund(firstReservation);

    expect(await storedUserUsage()).toEqual({ remainingQuota: 2, lastUsedAt: START_MS + 1 });
  });
});
