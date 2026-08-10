import { describe, expect, it } from "vitest";

import {
  DiscoveryFeedbackSchema,
  JobFinderDismissDiscoveryJobInputSchema,
  SavedJobSchema,
} from "./index";

const legacyJob = {
  id: "job_1",
  source: "target_site",
  sourceJobId: "source_job_1",
  canonicalUrl: "https://boards.greenhouse.io/example/jobs/1",
  title: "Platform Engineer",
  company: "Example",
  location: "Remote",
  workMode: ["remote"],
  applyPath: "external_redirect",
  easyApplyEligible: false,
  discoveredAt: "2026-07-31T12:00:00.000Z",
  salaryText: null,
  description: "Build dependable systems.",
  status: "discovered",
  matchAssessment: { score: 72, reasons: [], gaps: [] },
};

describe("discovery feedback contracts", () => {
  it("parses a bounded set of fact-neutral reason chips", () => {
    expect(
      JobFinderDismissDiscoveryJobInputSchema.parse({
        jobId: "job_1",
        reasons: ["role", "location"],
      }),
    ).toEqual({ jobId: "job_1", reasons: ["role", "location"] });
  });

  it("rejects empty and unknown feedback", () => {
    expect(() =>
      JobFinderDismissDiscoveryJobInputSchema.parse({
        jobId: "job_1",
        reasons: [],
      }),
    ).toThrow();
    expect(() =>
      DiscoveryFeedbackSchema.parse({
        version: 1,
        revision: 1,
        reasons: ["salary_is_a_hard_fact"],
        recordedAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("migrates legacy jobs without feedback to an explicit null", () => {
    expect(SavedJobSchema.parse(legacyJob).discoveryFeedback).toBeNull();
  });
});