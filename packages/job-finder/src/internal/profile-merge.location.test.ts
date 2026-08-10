import { describe, expect, test } from "vitest";

import { parseLocationParts } from "./profile-merge";

describe("parseLocationParts", () => {
  test.each([
    ["Portland, Oregon", "Portland", "Oregon", "United States"],
    ["New York, NY", "New York", "NY", "United States"],
    ["Cedar Park, TX 78613", "Cedar Park", "TX 78613", "United States"],
    ["San Juan, Puerto Rico", "San Juan", "Puerto Rico", "United States"],
    ["Hagatna, Guam", "Hagatna", "Guam", "United States"],
    ["Toronto, Ontario", "Toronto", "Ontario", "Canada"],
  ])(
    "derives structured country only from a recognized administrative area: %s",
    (location, currentCity, currentRegion, currentCountry) => {
      expect(parseLocationParts(location)).toEqual({
        currentCity,
        currentRegion,
        currentCountry,
      });
    },
  );

  test.each([
    ["Tbilisi, Georgia", "Tbilisi", "Georgia"],
    ["Portland", "Portland", null],
    ["Springfield, Central", "Springfield", "Central"],
  ])(
    "does not fabricate a country from ambiguous free text: %s",
    (location, currentCity, currentRegion) => {
      expect(parseLocationParts(location)).toEqual({
        currentCity,
        currentRegion,
        currentCountry: null,
      });
    },
  );
});
