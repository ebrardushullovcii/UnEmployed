import { describe, expect, test } from "vitest";

import { parseSourceInstructionReviewOverride } from "./source-instruction-types";

describe("source instruction review normalization", () => {
  test("uses safe defaults when an organizer returns null for defaulted enums", () => {
    const parsed = parseSourceInstructionReviewOverride({
      navigationGuidance: [],
      searchGuidance: [],
      detailGuidance: [],
      applyGuidance: [],
      warnings: [],
      intelligence: {
        provider: null,
        collection: {
          preferredMethod: null,
          rankedMethods: [],
          startingRoutes: [],
          searchRouteTemplates: [],
          detailRoutePatterns: [],
          listingMarkers: [],
        },
        apply: {
          applyPath: null,
          authMarkers: [],
          consentMarkers: [],
          questionSurfaceHints: [],
          resumeUploadHints: [],
        },
        reliability: {},
        overrides: {},
      },
    });

    expect(parsed?.intelligence?.collection.preferredMethod).toBe(
      "fallback_search",
    );
    expect(parsed?.intelligence?.apply.applyPath).toBe("unknown");
  });
});
