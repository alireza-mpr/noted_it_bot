// Represents one consumed unit of a user's daily quota, with what is needed
// to refund it exactly.
export interface QuotaReservation {
  userId: number;
  dailyQuota: number;
  consumedAt: Date;
  previousRemainingQuota: number;
  previousLastUsedAt: Date;
}

// Represents the result of trying to consume a unit.
export type QuotaResult =
  | { ok: true; remaining: number; reservation: QuotaReservation }
  | { ok: false; retryAt: Date };

// Represents where quota usage is stored. A port: the database adapter
// implements it.
export interface UsageStore {
  tryConsume(
    userId: number,
    dailyQuota: number,
    now: Date,
  ): Promise<QuotaResult>;
  refund(reservation: QuotaReservation): Promise<void>;
}
