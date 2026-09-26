import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { QUOTA_RESET_AFTER_MS } from "../../src/db/sql/userUsage";
import { UserUsageRepository } from "../../src/repositories/userUsageRepository";

const db = (env as unknown as { TEST_DB: D1Database }).TEST_DB;
const QUOTA = 3;
const UID = 42;
const T0 = 1_800_000_000_000;
const at = (ms: number) => new Date(ms);

describe("UserUsageRepository", () => {
  let repo: UserUsageRepository;

  beforeEach(async () => {
    await db.exec("DROP TABLE IF EXISTS user_usage");
    repo = new UserUsageRepository(db);
  });

  it("counts down and then denies without writing", async () => {
    expect((await repo.tryConsume(UID, at(T0), QUOTA)).remainingQuota).toBe(2);
    expect((await repo.tryConsume(UID, at(T0 + 1), QUOTA)).remainingQuota).toBe(1);
    const last = await repo.tryConsume(UID, at(T0 + 2), QUOTA);
    expect(last).toMatchObject({ successful: true, remainingQuota: 0, retryAt: T0 + 2 + QUOTA_RESET_AFTER_MS });

    const denied = await repo.tryConsume(UID, at(T0 + 3), QUOTA);
    expect(denied).toEqual({ successful: false, remainingQuota: 0, retryAt: T0 + 2 + QUOTA_RESET_AFTER_MS });
    expect(await repo.find(UID, at(T0 + 3), QUOTA)).toMatchObject({ remainingQuota: 0, lastUsedAt: T0 + 2 });
  });

  it("resets once the window has passed", async () => {
    for (let i = 0; i < QUOTA; i++) await repo.tryConsume(UID, at(T0 + i), QUOTA);
    const later = await repo.tryConsume(UID, at(T0 + 2 + QUOTA_RESET_AFTER_MS), QUOTA);
    expect(later).toMatchObject({ successful: true, remainingQuota: 2 });
  });

  it("lets only the available units through when messages race", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.tryConsume(UID, at(T0), QUOTA)),
    );
    expect(results.filter((r) => r.successful)).toHaveLength(QUOTA);
    expect(await repo.find(UID, at(T0), QUOTA)).toMatchObject({ remainingQuota: 0 });
  });

  it("refunds a new user back to a fresh state", async () => {
    const { reservation } = await repo.tryConsume(UID, at(T0), QUOTA);
    await repo.refund(reservation!);
    expect(await repo.find(UID, at(T0 + 1), QUOTA)).toMatchObject({ remainingQuota: QUOTA, lastUsedAt: 0 });
  });

  it("refunds without moving the reset time", async () => {
    await repo.tryConsume(UID, at(T0), QUOTA);
    await repo.tryConsume(UID, at(T0 + 1), QUOTA);
    const { reservation } = await repo.tryConsume(UID, at(T0 + 2), QUOTA);
    await repo.refund(reservation!);
    expect(await repo.find(UID, at(T0 + 3), QUOTA)).toMatchObject({ remainingQuota: 1, lastUsedAt: T0 + 1 });
  });

  it("gives back one unit when another consume happened after the refunded one", async () => {
    const first = await repo.tryConsume(UID, at(T0), QUOTA);
    await repo.tryConsume(UID, at(T0 + 1), QUOTA);
    await repo.refund(first.reservation!);
    expect(await repo.find(UID, at(T0 + 2), QUOTA)).toMatchObject({ remainingQuota: 2, lastUsedAt: T0 + 1 });
  });
});
