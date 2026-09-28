// Returns the record with its nested records turned back into dotted keys,
// e.g. { user: { id: 42 } } gives { "user.id": 42 }. The inverse of
// nestedRecordOf, so tests can read the events sent to Axiom by their names.
export function flatRecordOf(nestedRecord: Record<string, unknown>): Record<string, unknown> {
  return flatRecordWithPrefix(nestedRecord, "");
}

function flatRecordWithPrefix(nestedRecord: Record<string, unknown>, keyPrefix: string): Record<string, unknown> {
  const flatRecord: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(nestedRecord)) {
    const flatKey = `${keyPrefix}${key}`;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(flatRecord, flatRecordWithPrefix(value as Record<string, unknown>, `${flatKey}.`));
    } else {
      flatRecord[flatKey] = value;
    }
  }
  return flatRecord;
}
