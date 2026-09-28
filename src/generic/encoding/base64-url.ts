// Returns the bytes as base64url text (RFC 4648, section 5), with no padding,
// e.g. for a URL.
export function toBase64Url(bytes: Uint8Array): string {
  let binaryText = "";
  for (const byte of bytes) {
    binaryText += String.fromCharCode(byte);
  }
  return btoa(binaryText)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Returns the bytes in base64url text, or null if the text is not base64url.
export function fromBase64Url(base64UrlText: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(base64UrlText)) {
    return null;
  }
  try {
    const binaryText = atob(base64UrlText.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binaryText, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}
