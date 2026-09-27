export interface GroqUsageRow {
  model: string;
  aestTime: string;
  // The daily request count and limit from the last successful response. Only
  // for display.
  remainingRequests: number | null;
  limitRequests: number | null;
  retryAfterUntil: number;
  lastError: string;
  lastErrorAest: string;
  lastSuccessAest: string;
}
