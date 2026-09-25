export function fillPlaceholder(text: string, value: string): string {
  return text.replace("{0}", () => value);
}
