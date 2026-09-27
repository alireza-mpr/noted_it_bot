// Returns the text with the characters that have a meaning in HTML escaped,
// so it can go into HTML text or an attribute value.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
