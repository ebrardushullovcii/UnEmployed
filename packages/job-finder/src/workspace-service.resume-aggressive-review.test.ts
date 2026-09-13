import { describe, expect, test } from "vitest";
import { createAiClient } from "./workspace-service.test-runtimes";
import {
  createWorkspaceServiceHarness,
  createSeed,
} from "./workspace-service.test-support";

describe("aggressive resume review routing", () => {
  test("review uses the global aggressive default when no strategy sets a strength", async () => {
    const seed = createSeed();
    seed.searchPreferences = {
      ...seed.searchPreferences,
      tailoringMode: "aggressive",
    };
    let capturedTailoringStrength: string | null | undefined;
    const baseAiClient = createAiClient();
    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      aiClient: {
        ...baseAiClient,
        reviseResumeDraft(input) {
          capturedTailoringStrength = input.tailoringStrength ?? null;
          return Promise.resolve({
            content: "No edits.",
            patches: [],
          });
        },
      },
    });

    await workspaceService.generateResume("job_ready");
    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    expect(workspace.effectiveTailoringStrength).toBe("aggressive");
    expect(workspace.strategyContext?.tailoringStrength ?? null).toBeNull();

    await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Tighten the summary.",
    );
    expect(capturedTailoringStrength).toBe("aggressive");
  });

  test("a conservative strategy wins over the global aggressive default for review", async () => {
    const seed = createSeed();
    seed.searchPreferences = {
      ...seed.searchPreferences,
      tailoringMode: "aggressive",
    };
    let capturedTailoringStrength: string | null | undefined;
    const baseAiClient = createAiClient();
    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      aiClient: {
        ...baseAiClient,
        reviseResumeDraft(input) {
          capturedTailoringStrength = input.tailoringStrength ?? null;
          return Promise.resolve({
            content: "No edits.",
            patches: [],
          });
        },
      },
    });

    await workspaceService.getWorkspaceSnapshot();
    const created = await workspaceService.saveResumeStrategy({
      id: null,
      name: "Keep every fact",
      roleFamily: "Product Designer",
      baseResumeDocumentId: "resume_1",
      templateId: "modern_split",
      headlinePolicy: "role_family_template",
      skillsPolicy: "role_family_expanded",
      coveragePolicy: "role_family_recommended",
      tailoringStrength: "conservative",
      evidenceBoundaries: {
        allowExactClaims: true,
        allowParaphrasedClaims: false,
        maxEvidenceRefsPerBullet: 3,
        requireVerifierPass: true,
      },
      enabled: true,
    });
    const strategyId = created.intelligence.resumeStrategies[0]!.id;
    await workspaceService.selectResumeStrategy({
      jobId: "job_ready",
      campaignId: "campaign_default",
      strategyId,
      source: "manual",
      reason: "User chose the conservative approach for this posting.",
    });

    await workspaceService.generateResume("job_ready");
    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    expect(workspace.effectiveTailoringStrength).toBe("conservative");
    expect(workspace.strategyContext?.tailoringStrength).toBe("conservative");

    await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Tighten the summary.",
    );
    expect(capturedTailoringStrength).toBe("conservative");
  });
});
