import { describe, expect, it } from "vitest";
import { parseUserTimeZoneName } from "../../../../src/domain/user/user-time-zone-rule";

describe("parseUserTimeZoneName", () => {
  it("accepts IANA names and fixes their casing", () => {
    expect(parseUserTimeZoneName("Australia/Melbourne")).toBe("Australia/Melbourne");
    expect(parseUserTimeZoneName("asia/tokyo")).toBe("Asia/Tokyo");
    expect(parseUserTimeZoneName("America/Argentina/Buenos_Aires")).not.toBeNull();
    expect(parseUserTimeZoneName("  Europe/Paris ")).toBe("Europe/Paris");
    expect(parseUserTimeZoneName("utc")).toBe("UTC");
  });

  it("refuses places, made-up time zones and old short names", () => {
    for (const badName of ["Melbourne", "Japan", "Mars/Olympus", "EST", "PST8PDT", "Asia/", "/Tokyo", "", "Asia/Tokyo; DROP"]) {
      expect(parseUserTimeZoneName(badName), badName).toBeNull();
    }
  });
});
