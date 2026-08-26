import { describe, expect, test } from "vitest";

import {
  JobFinderRepositoryStateSchema,
  SavedJobDiscoveryProvenanceSchema,
} from "@unemployed/contracts";

import {
  createApplyQueueDemoState,
  createResumeWorkspaceDemoState,
} from "./job-finder-demo-state";

describe("job finder demo state", () => {
  test("keeps apply-queue seeds campaign-free so adoption derives coherent retention", () => {
    const state = createApplyQueueDemoState();

    // Campaign-free seeds let ensureCampaignState adopt one default campaign
    // whose retention and source targets derive from the seed itself; a
    // hand-built campaign here would be a second source of truth.
    expect(state.campaigns).toEqual([]);
    expect(state.activeCampaignId).toBeNull();

    const readyForReviewJobs = state.savedJobs.filter(
      (job) => job.status === "ready_for_review",
    );
    expect(readyForReviewJobs.length).toBeGreaterThan(0);
    const savedJobIds = new Set(state.savedJobs.map((job) => job.id));
    expect(
      [...state.tailoredAssets, ...state.resumeDrafts].every((entry) =>
        savedJobIds.has(entry.jobId),
      ),
    ).toBe(true);
    expect(state.searchPreferences.discovery.targets).toEqual(
      expect.arrayContaining([expect.objectContaining({ enabled: true })]),
    );
    expect(
      state.savedJobs.find((job) => job.id === "job_consent_queue"),
    ).toEqual(
      expect.objectContaining({
        company: "Consent Labs",
        employerDomain: "consentlabs.example.com",
        employerWebsiteUrl: "https://consentlabs.example.com",
      }),
    );
  });

  test("resume workspace seeds stay campaign-free with an enabled source", () => {
    const state = createResumeWorkspaceDemoState();

    expect(state.campaigns).toEqual([]);
    expect(state.activeCampaignId).toBeNull();
    expect(
      state.searchPreferences.discovery.targets.some(
        (target) => target.enabled,
      ),
    ).toBe(true);
  });

  test("apply-queue seed jobs pin historical provenance to the configured target", () => {
    const applyState = createApplyQueueDemoState();
    const configuredTarget =
      applyState.searchPreferences.discovery.targets.find(
        (target) => target.id === "target_linkedin_default",
      );

    expect(configuredTarget).toBeDefined();
    expect(configuredTarget?.enabled).toBe(true);
    expect(configuredTarget?.startingUrl).toBe(
      "https://www.linkedin.com/jobs/search/",
    );

    // job_generating seeds the queue's not-ready entry, so both seed jobs are
    // asserted through the apply queue's derivation chain.
    const generatingSeed = createResumeWorkspaceDemoState().savedJobs.find(
      (job) => job.id === "job_generating",
    );
    const seededJobs = [
      applyState.savedJobs.find((job) => job.id === "job_ready"),
      generatingSeed,
    ];

    for (const job of seededJobs) {
      expect(job?.provenance.length).toBeGreaterThan(0);
      for (const entry of job?.provenance ?? []) {
        expect(SavedJobDiscoveryProvenanceSchema.safeParse(entry).success).toBe(
          true,
        );
        expect(entry.targetId).toBe(configuredTarget?.id);
        expect(entry.adapterKind).toBe(configuredTarget?.adapterKind);
        expect(entry.startingUrl).toBe(configuredTarget?.startingUrl);
        expect(entry.resolvedAdapterKind).toBe(job?.source);
        expect(entry.discoveredAt).toBe(job?.discoveredAt);
      }
    }

    const notReadyQueueJob = applyState.savedJobs.find(
      (job) => job.id === "job_not_ready_queue",
    );
    expect(notReadyQueueJob?.provenance).toEqual(generatingSeed?.provenance);
    expect(applyState.savedJobs.every((job) => job.provenance.length > 0)).toBe(
      true,
    );
  });

  test("both demo repository states satisfy the repository state schema", () => {
    for (const factory of [
      createApplyQueueDemoState,
      createResumeWorkspaceDemoState,
    ]) {
      const parsed = JobFinderRepositoryStateSchema.safeParse(factory());
      expect(parsed.success).toBe(true);
    }
  });
});
