import { describe, expect, it } from "vitest";
import { nestedRecordOf } from "../../../../src/generic/json/nested-record";

describe("nestedRecordOf", () => {
  it("turns dotted keys into nested records, and keeps other keys", () => {
    expect(nestedRecordOf({ "user.id": 42, "user.name": "alice", "telegram.chat.id": 7, _time: "t" })).toEqual({
      user: { id: 42, name: "alice" },
      telegram: { chat: { id: 7 } },
      _time: "t",
    });
  });

  it("keeps values as they are, e.g. lists, null and records", () => {
    const listValue = ["a", "b"];
    const recordValue = { kept: true };
    expect(nestedRecordOf({ "a.list": listValue, "a.none": null, "a.record": recordValue })).toEqual({
      a: { list: listValue, none: null, record: recordValue },
    });
  });

  it("keeps a key flat when its path clashes with another key's value", () => {
    expect(nestedRecordOf({ user: 1, "user.id": 42 })).toEqual({ user: 1, "user.id": 42 });
    expect(nestedRecordOf({ "user.id": 42, "user.id.extra": 1 })).toEqual({ user: { id: 42 }, "user.id.extra": 1 });
  });

  it("never goes into a value that is a record, and never changes it", () => {
    const recordValue = { kept: true };
    expect(nestedRecordOf({ extra: recordValue, "extra.added": 1 })).toEqual({ extra: recordValue, "extra.added": 1 });
    expect(recordValue).toEqual({ kept: true });
  });
});
