import { describe, expect, it } from "vitest";
import { TIME_ZONE_CITIES } from "../../../../src/adapters/web/time-zone-cities";
import { parseTimeZoneName } from "../../../../src/generic/date-time/time-zone";

describe("the time zone page's cities", () => {
  it("map every city to a real time zone", () => {
    const unknownTimeZones = Object.entries(TIME_ZONE_CITIES).filter(([, timeZoneName]) => !parseTimeZoneName(timeZoneName));
    expect(unknownTimeZones).toEqual([]);
  });

  it("list each city once, ignoring case", () => {
    const cityNames = Object.keys(TIME_ZONE_CITIES).map((cityName) => cityName.toLowerCase());
    expect(new Set(cityNames).size).toBe(cityNames.length);
  });

  it("find Washington in New York's time zone", () => {
    expect(TIME_ZONE_CITIES.Washington).toBe("America/New_York");
  });
});
