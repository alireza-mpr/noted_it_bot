import { describe, expect, it } from "vitest";
import {
  readInteger,
  readIntegerOrNull,
  readNumber,
  readOneOf,
  readRecord,
  readRecordOrNull,
  readString,
  readStringOrNull,
  readStringsOrNull,
} from "../../../../src/generic/json/json-fields";

const JSON_RECORD = { name: "Ali", age: 30, score: 1.5, tags: ["a", "b"], nested: { id: 1 }, empty: null };

describe("json fields", () => {
  it("reads an object, and throws for anything else", () => {
    expect(readRecord(JSON_RECORD, "the record")).toBe(JSON_RECORD);
    for (const notAnObject of [null, [], "text", 3]) {
      expect(() => readRecord(notAnObject, "the record")).toThrow("the record is not an object");
    }
  });

  it("reads fields of the right type", () => {
    expect(readString(JSON_RECORD, "name")).toBe("Ali");
    expect(readNumber(JSON_RECORD, "score")).toBe(1.5);
    expect(readInteger(JSON_RECORD, "age")).toBe(30);
    expect(readStringsOrNull(JSON_RECORD, "tags")).toEqual(["a", "b"]);
    expect(readRecordOrNull(JSON_RECORD, "nested")).toEqual({ id: 1 });
    expect(readOneOf(JSON_RECORD, "name", ["Ali", "Sara"])).toBe("Ali");
  });

  it("reads a missing or null field as null, where null is allowed", () => {
    expect(readStringOrNull(JSON_RECORD, "missing")).toBeNull();
    expect(readStringOrNull(JSON_RECORD, "empty")).toBeNull();
    expect(readIntegerOrNull(JSON_RECORD, "missing")).toBeNull();
    expect(readStringsOrNull(JSON_RECORD, "empty")).toBeNull();
    expect(readRecordOrNull(JSON_RECORD, "missing")).toBeNull();
  });

  it("throws for a field of the wrong type, naming the field", () => {
    expect(() => readString(JSON_RECORD, "age")).toThrow("age is not a string");
    expect(() => readString(JSON_RECORD, "missing")).toThrow("missing is not a string");
    expect(() => readInteger(JSON_RECORD, "score")).toThrow("score is not a whole number");
    expect(() => readStringsOrNull(JSON_RECORD, "nested")).toThrow("nested is not a list of strings");
    expect(() => readOneOf(JSON_RECORD, "name", ["Sara"])).toThrow("name is not one of Sara");
  });
});
