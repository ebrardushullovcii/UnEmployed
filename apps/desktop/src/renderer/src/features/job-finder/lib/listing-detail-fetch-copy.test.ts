import { describe, expect, it } from "vitest";

import { describeMissingListingText } from "./listing-detail-fetch-copy";

describe("describeMissingListingText", () => {
  it("says a rate limit is the site asking to slow down, not a sign-in", () => {
    const text = describeMissingListingText({
      attemptedAt: "2026-09-12T10:00:00.000Z",
      outcome: "blocked",
      method: null,
      detail: "The site asked Job Finder to slow down (HTTP 429).",
      retryAfterAt: "2026-09-12T10:00:02.000Z",
    });
    expect(text).toContain("asked Job Finder to slow down");
    expect(text).not.toContain("signed-in");
  });

  it("keeps the sign-in wording for a refused read and points at Open listing", () => {
    const text = describeMissingListingText({
      attemptedAt: "2026-09-12T10:00:00.000Z",
      outcome: "blocked",
      method: null,
      detail:
        "The page answered 403; it may require access or a signed-in visitor.",
    });
    expect(text).toContain("signed-in visitor");
    expect(text).toContain("Use Open listing below");
    expect(text).not.toContain("open it in your browser");
  });
});
