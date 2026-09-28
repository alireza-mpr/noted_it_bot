// Represents how much of the daily quota a user has used: never used, or the
// units left and when the last one was used.
export type QuotaUsage =
  | { kind: "unused" }
  | { kind: "used"; remainingQuota: number; lastUsedAt: Date };
