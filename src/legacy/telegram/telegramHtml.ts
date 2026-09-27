// Escapes a URL for an HTML href (Telegram parse_mode HTML). Calendar links
// contain "&".
export function escapeHtmlAttribute(url: string): string {
  return url
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
