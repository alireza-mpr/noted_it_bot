// Returns the record with each dotted key turned into nested records, e.g.
// { "user.id": 42, "user.name": "alice" } gives { user: { id: 42, name:
// "alice" } }. A key whose path would clash with another key's value stays
// as it is, e.g. { "user": 1, "user.id": 42 } keeps "user.id".
export function nestedRecordOf(
  flatRecord: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const nestedRecord: Record<string, unknown> = {};
  const madeRecords = new WeakSet<object>([nestedRecord]);
  const clashingKeys: string[] = [];
  for (const [key, value] of Object.entries(flatRecord)) {
    if (!setAtPath(nestedRecord, key.split("."), value, madeRecords)) {
      clashingKeys.push(key);
    }
  }
  for (const key of clashingKeys) {
    nestedRecord[key] = flatRecord[key];
  }
  return nestedRecord;
}

// Sets the value at the path, making the records on the way. Returns false,
// and changes nothing, when the path clashes with a value already there.
// It only goes into records it made, never into a value.
function setAtPath(
  record: Record<string, unknown>,
  pathParts: readonly string[],
  value: unknown,
  madeRecords: WeakSet<object>,
): boolean {
  const [firstPart, ...restParts] = pathParts;
  if (restParts.length === 0) {
    if (firstPart in record) {
      return false;
    }
    record[firstPart] = value;
    return true;
  }
  const childValue = record[firstPart];
  if (childValue === undefined) {
    const childRecord: Record<string, unknown> = {};
    madeRecords.add(childRecord);
    if (!setAtPath(childRecord, restParts, value, madeRecords)) {
      return false;
    }
    record[firstPart] = childRecord;
    return true;
  }
  return (
    isMadeRecord(childValue, madeRecords) &&
    setAtPath(childValue, restParts, value, madeRecords)
  );
}

function isMadeRecord(
  value: unknown,
  madeRecords: WeakSet<object>,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && madeRecords.has(value);
}
