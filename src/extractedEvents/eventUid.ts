// Same source message always produces the same UID, so re-forwarding the
// same event updates a calendar's existing entry instead of duplicating it.
export async function computeEventUid(sourceText: string): Promise<string> {
  const data = new TextEncoder().encode(sourceText.trim());
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}@notedit`;
}
