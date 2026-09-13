import { describe, expect, it } from "vitest";
import {
  collapseRepeatedLocationTokens,
  isTruncatedLocationFragment,
  looksLikePlaceValue,
  splitListingLocations,
} from "./listing-field-shapes";
import {
  normalizeListingText,
  resolveListingEmployer,
  resolveListingLocation,
} from "./workspace-discovery-methods";

describe("looksLikePlaceValue", () => {
  it("recognises a country, a city-region pair and a work mode as places", () => {
    expect(looksLikePlaceValue("United States")).toBe(true);
    expect(looksLikePlaceValue("Chicago, IL")).toBe(true);
    expect(looksLikePlaceValue("Remote")).toBe(true);
    expect(looksLikePlaceValue("Austin, TX 78701")).toBe(true);
  });

  it("leaves an ordinary employer name alone", () => {
    expect(looksLikePlaceValue("Garner Health")).toBe(false);
    expect(looksLikePlaceValue("Rose, Klein & Marias")).toBe(false);
    expect(looksLikePlaceValue("Transportation Partners & Logistics")).toBe(
      false,
    );
  });

  it.each([
    "Acme, Inc",
    "Acme, Inc.",
    "Acme, LLC",
    "Acme, Ltd",
    "Acme, Ltd.",
    "Acme, GmbH",
    "Acme, PLC",
    "Acme, Corp",
    "Acme, Corp.",
    "Acme, Co.",
    "Acme, S.A.",
    "Acme, AG",
    "Acme, BV",
    "Acme, Pty",
    "Acme, LLP",
    "Acme, LP",
    "Acme, SRL",
    "Acme, Global Solutions",
    "Acme, Inc., USA",
    "Acme Solutions, Germany",
  ])("recognises company-shaped comma tails in %s", (employer) => {
    expect(looksLikePlaceValue(employer)).toBe(false);
    expect(resolveListingEmployer(employer, "Security Engineer")).toBe(
      employer,
    );
  });

  it.each(["Austin, TX", "Toronto, ON", "Berlin, Germany"])(
    "requires a real region signal in %s",
    (place) => {
      expect(looksLikePlaceValue(place)).toBe(true);
    },
  );
});

describe("isTruncatedLocationFragment", () => {
  it("rejects a value cut off after a preposition", () => {
    expect(isTruncatedLocationFragment("Security Remote in")).toBe(true);
    expect(isTruncatedLocationFragment("Remote in the")).toBe(true);
  });

  it("accepts a whole place", () => {
    expect(isTruncatedLocationFragment("Chicago, IL")).toBe(false);
    expect(isTruncatedLocationFragment("Toronto, ON")).toBe(false);
    expect(isTruncatedLocationFragment("Indianapolis, IN")).toBe(false);
    expect(isTruncatedLocationFragment("Portland, OR")).toBe(false);
    expect(isTruncatedLocationFragment("Remote")).toBe(false);
  });
});

describe("splitListingLocations", () => {
  it("counts 'City, ST' as one place, not two", () => {
    expect(splitListingLocations("Chicago, IL")).toEqual(["Chicago, IL"]);
  });

  it("splits on an explicit list separator", () => {
    expect(splitListingLocations("Chicago, IL / Austin, TX")).toEqual([
      "Chicago, IL",
      "Austin, TX",
    ]);
    expect(splitListingLocations("Remote or New York, NY")).toEqual([
      "Remote",
      "New York, NY",
    ]);
  });
});

describe("collapseRepeatedLocationTokens", () => {
  it("states one place once", () => {
    expect(collapseRepeatedLocationTokens("Anywhere, Anywhere, Anywhere")).toBe(
      "Anywhere",
    );
  });

  it("keeps a genuine city and region pair", () => {
    expect(collapseRepeatedLocationTokens("Philadelphia, PA")).toBe(
      "Philadelphia, PA",
    );
  });
});

describe("the stored employer and location pair", () => {
  it("refuses a place in the employer field", () => {
    expect(resolveListingEmployer("United States", "Security Engineer")).toBe(
      "Employer not stated",
    );
  });

  it("refuses a fragment in the location field", () => {
    expect(resolveListingLocation("Security Remote in")).toBe(
      "Location not stated",
    );
  });

  it("keeps a real employer and a real place", () => {
    expect(resolveListingEmployer("Garner Health", "Security Engineer")).toBe(
      "Garner Health",
    );
    expect(resolveListingLocation("Chicago, IL")).toBe("Chicago, IL");
  });
});

describe("normalizeListingText", () => {
  it("decodes a double-encoded entity all the way to readable text", () => {
    expect(
      normalizeListingText("Transportation Partners &amp;amp; Logistics"),
    ).toBe("Transportation Partners & Logistics");
  });

  it("still decodes a single-encoded entity", () => {
    expect(normalizeListingText("Rose, Klein &amp; Marias")).toBe(
      "Rose, Klein & Marias",
    );
  });
});
