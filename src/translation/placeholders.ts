export function fillPlaceholder(text: string, value: string): string {
  return text.replace("{0}", () => value);
}

// Fills {0}, {1}, … in one pass. So the inserted text is never searched again.
export function fillPlaceholders(text: string, values: string[]): string {
  return text.replace(/\{(\d+)\}/g, (match, index: string) => values[Number(index)] ?? match);
}
