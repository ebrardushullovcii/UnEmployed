import { describe, expect, it } from "vitest";
import {
  formatApplicationEmployerAriaLabel,
  formatApplicationEmployerLine,
  formatJobEmployerLocationLine,
  inferEmployerFromCanonicalUrl,
  inferListingSourceHostLabel,
  resolveJobEmployerDisplay,
  resolveJobLocationDisplay,
  scrubJobAbsencePlaceholders,
  scrubJobAbsencePlaceholdersList,
} from "./job-employer-location-display";

describe("job employer/location display", () => {
  it("infers employer from Wellfound-style company job URLs", () => {
    expect(
      inferEmployerFromCanonicalUrl(
        "https://wellfound.com/company/signal-systems/jobs/123456-software-engineer",
      ),
    ).toBe("Signal Systems");
  });

  it("does not treat company hubs as employers", () => {
    expect(
      inferEmployerFromCanonicalUrl("https://wellfound.com/company/lamatic"),
    ).toBeNull();
    expect(
      inferEmployerFromCanonicalUrl(
        "https://wellfound.com/company/lamatic/jobs",
      ),
    ).toBeNull();
  });

  it("hides absence placeholders and keeps known values", () => {
    expect(resolveJobLocationDisplay("Location not stated")).toBeNull();
    expect(resolveJobLocationDisplay("Remote")).toBe("Remote");
    expect(
      resolveJobEmployerDisplay({
        company: "Employer not stated",
        canonicalUrl:
          "https://wellfound.com/company/signal-systems/jobs/1-role",
      }),
    ).toBe("Signal Systems");
    expect(
      resolveJobEmployerDisplay({
        company: "Employer not stated",
        canonicalUrl: "https://wellfound.com/jobs/4634158-ai-product-engineer",
      }),
    ).toBeNull();
  });

  it("formats a meta line without placeholders", () => {
    expect(
      formatJobEmployerLocationLine({
        company: "Employer not stated",
        location: "Location not stated",
        canonicalUrl: "https://wellfound.com/jobs/1-role",
      }),
    ).toBe("");
    expect(
      formatJobEmployerLocationLine({
        company: "Employer not stated",
        location: "Remote",
        canonicalUrl:
          "https://wellfound.com/company/signal-systems/jobs/1-role",
        separator: " • ",
      }),
    ).toBe("Signal Systems • Remote");
  });

  it("formats Applications employer lines without absence placeholders", () => {
    expect(
      formatApplicationEmployerLine({
        company: "Employer not stated",
        canonicalUrl:
          "https://wellfound.com/company/signal-systems/jobs/1-role",
      }),
    ).toBe("Signal Systems");
    expect(
      formatApplicationEmployerLine({
        company: "Employer not stated",
        canonicalUrl: "https://wellfound.com/jobs/4634158-ai-product-engineer",
      }),
    ).toBe("Listing · wellfound.com");
    expect(
      formatApplicationEmployerLine({
        company: "Employer not stated",
        sourceLabels: ["Wellfound"],
      }),
    ).toBe("Listing · Wellfound");
    expect(
      formatApplicationEmployerLine({
        company: "Employer not stated",
      }),
    ).toBeNull();
    expect(
      inferListingSourceHostLabel("https://www.wellfound.com/jobs/1"),
    ).toBe("wellfound.com");
    expect(
      formatApplicationEmployerAriaLabel({
        title: "AI Product Engineer",
        company: "Employer not stated",
        canonicalUrl: "https://wellfound.com/jobs/4634158-ai-product-engineer",
      }),
    ).toBe("AI Product Engineer at Listing · wellfound.com");
  });

  it("locks extraction→display when companyHref recovery stored the employer", () => {
    // Discovery extraction (DOM card / compact / structured) may observe a
    // `/company/{slug}` hub beside a `/jobs/{id}-…` listing URL and persist
    // the titled slug as `company`. Display must prefer that stored name —
    // never invent from the numeric job-id segment, and never fall back to
    // Listing · source while a real employer is present.
    const extractedCompany = "Signal Systems";
    const jobsIdListingUrl =
      "https://wellfound.com/jobs/4634158-ai-product-engineer";

    expect(
      resolveJobEmployerDisplay({
        company: extractedCompany,
        canonicalUrl: jobsIdListingUrl,
      }),
    ).toBe("Signal Systems");
    expect(
      formatJobEmployerLocationLine({
        company: extractedCompany,
        location: "Remote",
        canonicalUrl: jobsIdListingUrl,
        separator: " • ",
      }),
    ).toBe("Signal Systems • Remote");
    expect(
      formatApplicationEmployerLine({
        company: extractedCompany,
        canonicalUrl: jobsIdListingUrl,
        sourceLabels: ["Wellfound"],
      }),
    ).toBe("Signal Systems");
    expect(
      formatApplicationEmployerAriaLabel({
        title: "AI Product Engineer",
        company: extractedCompany,
        canonicalUrl: jobsIdListingUrl,
      }),
    ).toBe("AI Product Engineer at Signal Systems");
  });

  it("documents legacy /jobs/{id} rows without company-path evidence", () => {
    // Rows discovered before companyHref recovery (or pages that never expose
    // a company hub link) keep absence/`Listing ·` until rediscovery.
    expect(
      formatApplicationEmployerLine({
        company: "Employer not stated",
        canonicalUrl: "https://wellfound.com/jobs/4634158-ai-product-engineer",
        sourceLabels: ["Wellfound"],
      }),
    ).toBe("Listing · Wellfound");
  });

  it("hides URL-derived and slug-garbage employer labels", () => {
    expect(
      resolveJobEmployerDisplay({
        company: "Https Therichmondmarketing Com",
        canonicalUrl: "https://wellfound.com/jobs/1-role",
      }),
    ).toBeNull();
    expect(
      formatApplicationEmployerLine({
        company: "Strongholdpay",
        canonicalUrl: "https://wellfound.com/jobs/1-role",
        sourceLabels: ["Wellfound"],
      }),
    ).toBe("Listing · Wellfound");
    expect(
      formatApplicationEmployerLine({
        company: "Dearhiringmanager IO",
        canonicalUrl: "https://wellfound.com/jobs/1-role",
        sourceLabels: ["Wellfound"],
      }),
    ).toBe("Listing · Wellfound");
    expect(
      formatApplicationEmployerLine({
        company: "Scan Com",
        canonicalUrl: "https://wellfound.com/jobs/1-role",
        sourceLabels: ["Wellfound"],
      }),
    ).toBe("Listing · Wellfound");
    expect(
      resolveJobEmployerDisplay({
        company: "Tennr",
        canonicalUrl: "https://wellfound.com/jobs/1-role",
      }),
    ).toBe("Tennr");
    expect(
      resolveJobEmployerDisplay({
        company: "Employer not stated",
        canonicalUrl:
          "https://wellfound.com/company/green-usd/jobs/1-data-engineer",
      }),
    ).toBeNull();
    expect(
      resolveJobEmployerDisplay({
        company: "Employer not stated",
        canonicalUrl:
          "https://wellfound.com/company/scale-ai/jobs/1-ml-researcher",
      }),
    ).toBe("Scale AI");
  });

  it("scrubs absence placeholders from fit-evidence prose", () => {
    expect(
      scrubJobAbsencePlaceholders(
        "Employer not stated is not on the preferred-company list.",
      ),
    ).toBe("is not on the preferred-company list.");
    expect(
      scrubJobAbsencePlaceholders(
        "Location not stated compared with Remote: outside the saved areas.",
      ),
    ).toBe("compared with Remote: outside the saved areas.");
    expect(
      scrubJobAbsencePlaceholdersList([
        "Employer not stated",
        "Remote role with strong skills overlap",
        "Location not stated · mixed preferences",
      ]),
    ).toEqual(["Remote role with strong skills overlap", "mixed preferences"]);
  });
});
