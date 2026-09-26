export interface GroqUsageRow {
  model: string;
  aestTime: string;
  retryAfterUntil: number;
  lastError: string;
  lastErrorAest: string;
  lastSuccessAest: string;
}
