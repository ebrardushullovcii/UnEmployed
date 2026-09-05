import { describe, expect, it } from "vitest";
import {
  JobFinderRepositoryStateSchema,
  STARTER_JOB_SOURCES,
  evaluateProfileSetupReadiness,
  isRunnableJobDiscoveryTarget,
} from "@unemployed/contracts";
import { createEmptyJobFinderRepositoryState } from "./job-finder-initial-state";

describe("createEmptyJobFinderRepositoryState fresh seed", () => {
  it("seeds disabled starter sources so first-run setup can offer real choices", () => {
    const state = createEmptyJobFinderRepositoryState();
    const parsed = JobFinderRepositoryStateSchema.parse(state);
    const seededTargets = parsed.searchPreferences.discovery.targets;

    expect(seededTargets).toHaveLength(STARTER_JOB_SOURCES.length);
    for (const [index, source] of STARTER_JOB_SOURCES.entries()) {
      expect(seededTargets[index]).toMatchObject({
        enabled: false,
        id: source.id,
        label: source.label,
        startingUrl: source.startingUrl,
      });
    }

    for (const target of seededTargets) {
      expect(target.instructionStatus).toBe("missing");
      expect(target.validatedInstructionId).toBeNull();
      // Seeding never creates a runnable source and never enables one.
      expect(isRunnableJobDiscoveryTarget(target)).toBe(false);
    }

    expect(
      evaluateProfileSetupReadiness(parsed.profile, parsed.searchPreferences)
        .hasDiscoverySource,
    ).toBe(false);
    expect(seededTargets.every((target) => !target.enabled)).toBe(true);
  });
});
