import { describe, expect, it } from "vitest";
import { fullNameOf, isSameProfile } from "../../../../src/domain/user/user-profile";

const ALICE = { username: "alice", firstName: "Alice", lastName: null, telegramLanguageCode: "fa" };

describe("fullNameOf", () => {
  it("gives the first name, and the last name if there is one", () => {
    expect(fullNameOf(ALICE)).toBe("Alice");
    expect(fullNameOf({ ...ALICE, lastName: "Smith" })).toBe("Alice Smith");
  });
});

describe("isSameProfile", () => {
  it("is true only when every field is the same", () => {
    expect(isSameProfile(ALICE, { ...ALICE })).toBe(true);
    expect(isSameProfile(ALICE, { ...ALICE, username: null })).toBe(false);
    expect(isSameProfile(ALICE, { ...ALICE, telegramLanguageCode: "en" })).toBe(false);
    expect(isSameProfile(null, ALICE)).toBe(false);
  });
});
