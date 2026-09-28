// Represents a JSON object, before its fields are read.
export type JsonRecord = Record<string, unknown>;

// Returns the JSON value as an object. Throws if it is not one. jsonName names
// the value in the error, e.g. "the answer".
export function readRecord(json: unknown, jsonName: string): JsonRecord {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error(`${jsonName} is not an object`);
  }
  return json as JsonRecord;
}

// Returns the field as an object, or null if it is missing or null. Throws if
// it is something else.
export function readRecordOrNull(
  jsonRecord: JsonRecord,
  fieldName: string,
): JsonRecord | null {
  const fieldValue = jsonRecord[fieldName] ?? null;
  return fieldValue === null ? null : readRecord(fieldValue, fieldName);
}

// Returns the field as a string. Throws if it is not one.
export function readString(jsonRecord: JsonRecord, fieldName: string): string {
  const fieldValue = jsonRecord[fieldName];
  if (typeof fieldValue !== "string") {
    throw new Error(`${fieldName} is not a string`);
  }
  return fieldValue;
}

// Returns the field as a string, or null if it is missing or null. Throws if
// it is something else.
export function readStringOrNull(
  jsonRecord: JsonRecord,
  fieldName: string,
): string | null {
  return (jsonRecord[fieldName] ?? null) === null
    ? null
    : readString(jsonRecord, fieldName);
}

// Returns the field as a list of strings, or null if it is missing or null.
// Throws if it is something else.
export function readStringsOrNull(
  jsonRecord: JsonRecord,
  fieldName: string,
): string[] | null {
  const fieldValue = jsonRecord[fieldName] ?? null;
  if (fieldValue === null) {
    return null;
  }
  if (!Array.isArray(fieldValue) || !fieldValue.every((item) => typeof item === "string")) {
    throw new Error(`${fieldName} is not a list of strings`);
  }
  return fieldValue;
}

// Returns the field as a finite number. Throws if it is not one.
export function readNumber(jsonRecord: JsonRecord, fieldName: string): number {
  const fieldValue = jsonRecord[fieldName];
  if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
    throw new Error(`${fieldName} is not a number`);
  }
  return fieldValue;
}

// Returns the field as a whole number. Throws if it is not one.
export function readInteger(jsonRecord: JsonRecord, fieldName: string): number {
  const fieldValue = readNumber(jsonRecord, fieldName);
  if (!Number.isInteger(fieldValue)) {
    throw new Error(`${fieldName} is not a whole number`);
  }
  return fieldValue;
}

// Returns the field as a whole number, or null if it is missing or null.
// Throws if it is something else.
export function readIntegerOrNull(
  jsonRecord: JsonRecord,
  fieldName: string,
): number | null {
  return (jsonRecord[fieldName] ?? null) === null
    ? null
    : readInteger(jsonRecord, fieldName);
}

// Returns the field if it is one of the allowed values. Throws if it is not.
export function readOneOf<Value extends string>(
  jsonRecord: JsonRecord,
  fieldName: string,
  allowedValues: readonly Value[],
): Value {
  const fieldValue = jsonRecord[fieldName];
  const allowedValue = allowedValues.find((value) => value === fieldValue);
  if (allowedValue === undefined) {
    throw new Error(`${fieldName} is not one of ${allowedValues.join(", ")}`);
  }
  return allowedValue;
}
