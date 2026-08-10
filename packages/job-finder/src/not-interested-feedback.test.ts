import { describe, expect, it } from "vitest";

import { SavedJobSchema } from "@unemployed/contracts";
import { mergeSavedJobs } from "./internal/workspace-discovery-state-helpers";
import { createWorkspaceServiceHarness } from "./workspace-service.test-harness";
import { createSeed } from "./workspace-service.test-fixtures";

describe("not-interested discovery feedback", () => {
  it("persists local reasons, preserves scoring facts, and supports resettable undo", async () => {
    const seed = createSeed();
    const original = seed.savedJobs[0]!;
    seed.savedJobs[0] = SavedJobSchema.parse({
      ...original,
      status: "discovered",
    });
    const { repository, workspaceService } = createWorkspaceServiceHarness({ seed });

    const hidden = await workspaceService.dismissDiscoveryJob({
      jobId: original.id,
      reasons: ["location", "duplicate"],
    });
    const persisted = (await repository.listSavedJobs()).find(
      (job) => job.id === original.id,
    );

    expect(hidden.discoveryJobs.some((job) => job.id === original.id)).toBe(false);
    expect(hidden.dismissedDiscoveryJobs[0]).toMatchObject({
      id: original.id,
      status: "archived",
      discoveryFeedback: {
        version: 1,
        revision: 1,
        reasons: ["location", "duplicate"],
      },
    });
    expect(persisted?.matchAssessment).toEqual(original.matchAssessment);

    const restored = await workspaceService.restoreDismissedDiscoveryJob(original.id);
    expect(restored.dismissedDiscoveryJobs).toHaveLength(0);
    expect(restored.discoveryJobs.find((job) => job.id === original.id)).toMatchObject({
      status: "discovered",
      discoveryFeedback: null,
    });
  });

  it("keeps explicit feedback across duplicate rediscovery without contaminating the new assessment", () => {
    const original = createSeed().savedJobs[0]!;
    const hidden = SavedJobSchema.parse({
      ...original,
      status: "archived",
      discoveryFeedback: {
        version: 1,
        revision: 2,
        reasons: ["company"],
        recordedAt: "2026-07-31T12:00:00.000Z",
      },
    });
    const rediscovered = SavedJobSchema.parse({
      ...original,
      status: "discovered",
      matchAssessment: { ...original.matchAssessment, score: 41 },
    });

    expect(mergeSavedJobs([hidden], [rediscovered])[0]).toMatchObject({
      status: "archived",
      discoveryFeedback: hidden.discoveryFeedback,
      matchAssessment: { score: 41 },
    });
  });
});