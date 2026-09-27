import { describe, expect, it } from "vitest";
import { canonicalTimezone } from "../../src/time/canonicalTimezone";
import { TZ_CITIES } from "../../src/web/tzCities";

describe("time zone page cities", () => {
  it("maps every city to a real zone", () => {
    const unknown = Object.entries(TZ_CITIES).filter(([, zone]) => !canonicalTimezone(zone));
    expect(unknown).toEqual([]);
  });

  it("lists each city once, ignoring case", () => {
    const names = Object.keys(TZ_CITIES).map((city) => city.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("finds Washington in New York's zone", () => {
    expect(TZ_CITIES.Washington).toBe("America/New_York");
  });
});
