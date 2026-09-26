export interface GroqUsageRow {
  model: string;
  aestTime: string;
  remainingRequests: number | null;
  resetRequestsAt: number;
  retryAfterUntil: number;
  lastError: string;
  lastErrorAest: string;
  lastSuccessAest: string;
}
