import { describe, expect, it } from "vitest";
import {
  formatPrepareApplicationDescription,
  formatPrepareApplicationSubject,
} from "./job-finder-browser-handoff-copy";

describe("formatPrepareApplicationSubject", () => {
  it("names the job and the employer when the listing states both", () => {
    expect(
      formatPrepareApplicationSubject({
        jobTitle: "Senior Frontend Engineer",
        employerName: "Umbrel",
      }),
    ).toBe("Senior Frontend Engineer at Umbrel");
  });

  it("drops the employer clause when the stored employer is the absence placeholder", () => {
    // Discovery stores "Employer not stated" when a listing names no company.
    // The prepare dialog is what the user agrees to, so it must not present an
    // absence as though it were the company they are applying to.
    expect(
      formatPrepareApplicationSubject({
        jobTitle: "Senior Frontend Engineer",
        employerName: "Employer not stated",
      }),
    ).toBe("Senior Frontend Engineer");
  });

  it("treats the placeholder as absent in every position, not just beside a title", () => {
    expect(
      formatPrepareApplicationSubject({
        jobTitle: null,
        employerName: "employer not stated",
      }),
    ).toBeNull();
    expect(
      formatPrepareApplicationSubject({
        jobTitle: null,
        employerName: "Umbrel",
      }),
    ).toBe("Umbrel");
    expect(
      formatPrepareApplicationSubject({ jobTitle: null, employerName: null }),
    ).toBeNull();
  });

  it("keeps the prepare-only boundary in the description either way", () => {
    const named = formatPrepareApplicationDescription(
      formatPrepareApplicationSubject({
        jobTitle: "Senior Frontend Engineer",
        employerName: "Employer not stated",
      }),
    );

    expect(named).toContain("Senior Frontend Engineer");
    expect(named).not.toContain("Employer not stated");
    expect(named).toContain("It stops before the employer's submit control");
  });
});
