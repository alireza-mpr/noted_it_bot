// Returns the number in the language's digits, e.g. "۹٬۹۷۴" in Persian.
export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(language).format(value);
}
