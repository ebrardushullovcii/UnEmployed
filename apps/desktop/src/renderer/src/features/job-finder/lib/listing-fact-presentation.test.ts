import { describe, expect, it, test } from "vitest";

import {
  collapseRepeatedListingParts,
  countListingLocations,
  formatEmploymentTypeLabel,
  formatWorkModeLabel,
  splitListingLocationValues,
} from "./listing-fact-presentation";

describe("formatEmploymentTypeLabel", () => {
  test("says the machine value in plain words", () => {
    expect(formatEmploymentTypeLabel("FULL_TIME")).toBe("Full-time");
    expect(formatEmploymentTypeLabel("part-time")).toBe("Part-time");
    expect(formatEmploymentTypeLabel("CONTRACTOR")).toBe("Contract");
  });

  test("still reads as words for a spelling it does not know", () => {
    expect(formatEmploymentTypeLabel("FIXED_TERM_APPOINTMENT")).toBe(
      "Fixed Term Appointment",
    );
  });

  test("returns nothing for an absent value", () => {
    expect(formatEmploymentTypeLabel(null)).toBeNull();
    expect(formatEmploymentTypeLabel("  ")).toBeNull();
  });
});

describe("collapseRepeatedListingParts", () => {
  test("says a repeated place once", () => {
    expect(collapseRepeatedListingParts("Anywhere, Anywhere, Anywhere")).toBe(
      "Anywhere",
    );
    expect(collapseRepeatedListingParts("Berlin · Berlin · Germany")).toBe(
      "Berlin, Germany",
    );
  });

  test("keeps genuinely different parts in order", () => {
    expect(collapseRepeatedListingParts("Austin, Texas, United States")).toBe(
      "Austin, Texas, United States",
    );
  });

  test("returns nothing for an absent value", () => {
    expect(collapseRepeatedListingParts(null)).toBeNull();
    expect(collapseRepeatedListingParts(" , , ")).toBeNull();
  });
});

describe("formatWorkModeLabel", () => {
  test("says a repeated work mode once, in plain words", () => {
    expect(formatWorkModeLabel(["remote", "remote"])).toBe("Remote");
    expect(formatWorkModeLabel(["onsite", "hybrid"])).toBe("On-site, Hybrid");
  });

  test("returns nothing when no work mode was captured", () => {
    expect(formatWorkModeLabel([])).toBeNull();
    expect(formatWorkModeLabel(null)).toBeNull();
  });
});

describe("countListingLocations", () => {
  it("counts a city and its region as one place", () => {
    expect(countListingLocations("Chicago, IL")).toBe(1);
    expect(splitListingLocationValues("Chicago, IL")).toEqual(["Chicago, IL"]);
  });

  it("counts an explicit list as separate places", () => {
    expect(countListingLocations("Chicago, IL / Austin, TX")).toBe(2);
    expect(countListingLocations("Remote or New York, NY")).toBe(2);
  });

  it("says one place once however many times it was repeated", () => {
    expect(countListingLocations("Anywhere • Anywhere • Anywhere")).toBe(1);
  });

  it("counts nothing when no place was stated", () => {
    expect(countListingLocations(null)).toBe(0);
    expect(countListingLocations("   ")).toBe(0);
  });
});
