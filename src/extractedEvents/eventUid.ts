// The same message always gives the same UID. So if a user forwards the same
// event again, the calendar updates the existing entry. It does not add a copy.
export async function computeEventUid(sourceText: string): Promise<string> {
  const data = new TextEncoder().encode(sourceText.trim());
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}@notedit`;
}
