export interface GroqUsageRow {
  model: string;
  aestTime: string;
  // Daily request count and limit from the last successful response; display only.
  remainingRequests: number | null;
  limitRequests: number | null;
  retryAfterUntil: number;
  lastError: string;
  lastErrorAest: string;
  lastSuccessAest: string;
}
