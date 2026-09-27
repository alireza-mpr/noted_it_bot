// Returns the SHA-256 hash of a text, as lowercase hex.
export async function sha256Hex(text: string): Promise<string> {
  const textBytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", textBytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
