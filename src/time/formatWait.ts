export function formatWait(retryAtMs: number, nowMs: number): string {
  const totalMinutes = Math.max(0, Math.ceil((retryAtMs - nowMs) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
