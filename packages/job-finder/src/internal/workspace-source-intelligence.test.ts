import { afterEach, describe, expect, test, vi } from "vitest";

import type { JobDiscoveryTarget, JobSource } from "@unemployed/contracts";

import {
  collectPublicProviderJobs,
  inferSourceIntelligenceFromTarget,
} from "./workspace-source-intelligence";

afterEach(() => {
  vi.restoreAllMocks();
});

function createGreenhouseTarget(): JobDiscoveryTarget {
  return {
    id: "greenhouse_remote",
    label: "Remote Greenhouse",
    startingUrl: "https://job-boards.greenhouse.io/remote",
    enabled: true,
    adapterKind: "auto",
    customInstructions: null,
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  };
}

function createLeverTarget(): JobDiscoveryTarget {
  return {
    id: "lever_aircall",
    label: "Aircall Lever",
    startingUrl: "https://jobs.lever.co/aircall",
    enabled: true,
    adapterKind: "auto",
    customInstructions: null,
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  };
}

function createUnknownCareersTarget(): JobDiscoveryTarget {
  return {
    id: "unknown_careers",
    label: "Unknown Careers",
    startingUrl: "https://example.com/careers",
    enabled: true,
    adapterKind: "auto",
    customInstructions: null,
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  };
}

async function collectGreenhouseJobs(updatedAt: string | null) {
  const target = createGreenhouseTarget();
  const intelligence = inferSourceIntelligenceFromTarget({
    target,
    currentArtifact: null,
  });
  const source: JobSource = "target_site";

  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      jobs: [
        {
          id: 4622190,
          title: "SEI Instructor Lead",
          absolute_url: "https://job-boards.greenhouse.io/remote/jobs/4622190",
          location: { name: "New York, NY" },
          updated_at: updatedAt,
          content: "<p>Teach software engineering.</p>",
        },
      ],
      }),
    } as Response);

  return collectPublicProviderJobs({
    target,
    artifact: { intelligence },
    source,
  });
}

describe("collectPublicProviderJobs", () => {
  test("normalizes Greenhouse offset timestamps before job parsing", async () => {
    const result = await collectGreenhouseJobs("2024-07-24T16:08:01-04:00");

    expect(result.warning).toBeNull();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.postedAt).toBe("2024-07-24T20:08:01.000Z");
  });

  test("keeps Greenhouse jobs when provider timestamps are invalid", async () => {
    const result = await collectGreenhouseJobs("not-a-date");

    expect(result.warning).toBeNull();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.postedAt).toBeNull();
  });

  test("normalizes stringified numeric provider timestamps", async () => {
    const target = createLeverTarget();
    const intelligence = inferSourceIntelligenceFromTarget({
      target,
      currentArtifact: null,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          id: "lever_job_1",
          text: "Senior Engineer",
          createdAt: "1721851681000",
          hostedUrl: "https://jobs.lever.co/aircall/lever_job_1",
          applyUrl: null,
          descriptionPlain: "Build platform features.",
          categories: {
            location: "Remote",
          },
        },
      ]),
    } as Response);

    const result = await collectPublicProviderJobs({
      target,
      artifact: { intelligence },
      source: "target_site",
    });

    expect(result.warning).toBeNull();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.postedAt).toBe("2024-07-24T20:08:01.000Z");
  });

  test("returns a clear timeout warning when the Greenhouse API hangs", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(new AbortController().signal);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Timed out", "AbortError"));

    const target = createGreenhouseTarget();
    const intelligence = inferSourceIntelligenceFromTarget({
      target,
      currentArtifact: null,
    });

    const result = await collectPublicProviderJobs({
      target,
      artifact: { intelligence },
      source: "target_site",
    });

    expect(result.jobs).toEqual([]);
    expect(result.warning).toBe(
      "Public provider API collection failed: Greenhouse API request timed out.",
    );
  });

  test("returns a clear timeout warning when the Lever API hangs", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(new AbortController().signal);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Timed out", "AbortError"));

    const target = createLeverTarget();
    const intelligence = inferSourceIntelligenceFromTarget({
      target,
      currentArtifact: null,
    });

    const result = await collectPublicProviderJobs({
      target,
      artifact: { intelligence },
      source: "target_site",
    });

    expect(result.jobs).toEqual([]);
    expect(result.warning).toBe(
      "Public provider API collection failed: Lever API request timed out.",
    );
  });

  test("normalizes Lever createdAt timestamps when present", async () => {
    const target = createLeverTarget();
    const intelligence = inferSourceIntelligenceFromTarget({
      target,
      currentArtifact: null,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          id: "lever_job_1",
          text: "Senior Engineer",
          createdAt: "2024-07-24T16:08:01-04:00",
          hostedUrl: "https://jobs.lever.co/aircall/lever_job_1",
          applyUrl: null,
          descriptionPlain: "Build platform features.",
          categories: {
            location: "Remote",
          },
        },
      ]),
    } as Response);

    const result = await collectPublicProviderJobs({
      target,
      artifact: { intelligence },
      source: "target_site",
    });

    expect(result.warning).toBeNull();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.postedAt).toBe("2024-07-24T20:08:01.000Z");
  });

  test("infers a route-backed no-artifact collection method from the target URL", () => {
    const intelligence = inferSourceIntelligenceFromTarget({
      target: createUnknownCareersTarget(),
      currentArtifact: null,
    });

    expect(intelligence.collection.preferredMethod).toBe("careers_page");
  });
});
