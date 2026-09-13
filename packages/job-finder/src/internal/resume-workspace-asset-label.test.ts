import { describe, expect, test } from "vitest";

import {
  TAILORED_RESUME_ASSET_LABEL,
  UNTAILORABLE_RESUME_ASSET_LABEL,
  resolveTailoredAssetLabel,
} from "./resume-workspace-helpers";

describe("resolveTailoredAssetLabel", () => {
  test("names a draft whose listing text was never captured for what it is", () => {
    // The preview panel already explained that nothing could be tailored
    // while the shortlisted row, the documents list and the exported file
    // still read "Tailored Resume".
    expect(
      resolveTailoredAssetLabel({
        existingLabel: TAILORED_RESUME_ASSET_LABEL,
        generationMethod: "deterministic",
        generationReason: "listing_text_missing",
      }),
    ).toBe(UNTAILORABLE_RESUME_ASSET_LABEL);
  });

  test("returns the tailored name once a real draft replaces it", () => {
    expect(
      resolveTailoredAssetLabel({
        existingLabel: UNTAILORABLE_RESUME_ASSET_LABEL,
        generationMethod: "ai_assisted",
        generationReason: null,
      }),
    ).toBe(TAILORED_RESUME_ASSET_LABEL);
  });

  test("keeps a name the person or an earlier draft already chose", () => {
    expect(
      resolveTailoredAssetLabel({
        existingLabel: "Resume for Acme",
        generationMethod: "deterministic",
        generationReason: "ai_unavailable",
      }),
    ).toBe("Resume for Acme");
    expect(
      resolveTailoredAssetLabel({
        existingLabel: null,
        generationMethod: "deterministic",
        generationReason: null,
      }),
    ).toBe(TAILORED_RESUME_ASSET_LABEL);
  });

  test("covers a listing body that says nothing specific about the job", () => {
    // Two unrelated jobs were getting byte-identical "tailored" resumes.
    expect(
      resolveTailoredAssetLabel({
        existingLabel: TAILORED_RESUME_ASSET_LABEL,
        generationMethod: "deterministic",
        generationReason: "listing_text_not_distinguishing",
      }),
    ).toBe(UNTAILORABLE_RESUME_ASSET_LABEL);
  });
});
