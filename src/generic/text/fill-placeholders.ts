// Returns the template with {0}, {1}, … replaced by the values, in one pass,
// so an inserted value is never searched again. A placeholder with no value
// stays as it is.
export function fillPlaceholders(template: string, values: string[]): string {
  return template.replace(
    /\{(\d+)\}/g,
    (placeholder, valueIndex: string) =>
      values[Number(valueIndex)] ?? placeholder,
  );
}
