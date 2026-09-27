import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../../../src/generic/hash/sha256-hex";

describe("sha256Hex", () => {
  it("returns the SHA-256 hash as lowercase hex", async () => {
    // The test vector from FIPS 180-2.
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
