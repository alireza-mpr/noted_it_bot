// Returns the text cut after maxLength characters, with a note that says how
// many were cut, e.g. "abc…[truncated 7 chars]". A short text stays as it is.
export function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength
    ? `${text.slice(0, maxLength)}…[truncated ${text.length - maxLength} chars]`
    : text;
}
