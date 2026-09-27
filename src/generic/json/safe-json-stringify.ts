// Returns the value as JSON text. Never throws: returns String(value) when the
// value has no JSON form, e.g. undefined, a cycle or a BigInt.
export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
