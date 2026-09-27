// Represents one use of a user's daily quota, with enough detail to undo it
// exactly.
export interface QuotaReservation {
  userId: number;
  dailyQuota: number;
  consumedAt: Date;
  previousRemainingQuota: number;
  previousLastUsedAt: Date;
}

// Represents the result of trying to use one unit of a user's daily quota.
export type QuotaResult =
  | { ok: true; remaining: number; reservation: QuotaReservation }
  | { ok: false; retryAt: Date };

// Represents the storage that the quota rules need. The database adapter
// implements it.
export interface UsageStore {
  tryConsume(userId: number, dailyQuota: number, now: Date): Promise<QuotaResult>;
  refund(reservation: QuotaReservation): Promise<void>;
}
