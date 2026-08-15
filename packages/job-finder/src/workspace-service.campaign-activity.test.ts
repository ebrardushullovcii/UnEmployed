import { describe, expect, test } from "vitest";
import { createInMemoryJobFinderRepository } from "@unemployed/db";

import { createJobFinderWorkspaceService } from "./index";
import {
  createAiClient,
  createBrowserRuntime,
  createDocumentManager,
  createResearchAdapter,
  createSeed,
} from "./workspace-service.test-support";

function createService() {
  const repository = createInMemoryJobFinderRepository(createSeed());
  const service = createJobFinderWorkspaceService({
    repository,
    browserRuntime: createBrowserRuntime(),
    aiClient: createAiClient(),
    documentManager: createDocumentManager(),
    exportFileVerifier: { exists: () => Promise.resolve(true) },
    researchAdapter: createResearchAdapter(),
  });
  return { repository, service };
}

describe("workspace campaign and activity controls", () => {
  test("persists pause state and rejects new browser-backed work until resumed", async () => {
    const { service } = createService();
    const paused = await service.setActivityControl({
      paused: true,
      reason: "Pause all browser work.",
    });

    expect(paused.activityControl).toMatchObject({
      paused: true,
      reason: "Pause all browser work.",
    });
    await expect(service.runDiscovery()).rejects.toThrow(
      "Browser and application activity is paused",
    );
    await expect(
      service.runSourceDebug("target_linkedin_default"),
    ).rejects.toThrow("Browser and application activity is paused");

    const resumed = await service.setActivityControl({ paused: false });
    expect(resumed.activityControl).toEqual({
      paused: false,
      pausedAt: null,
      reason: null,
    });
  });

  test("rejects discovery when the active campaign itself is paused", async () => {
    const { service } = createService();
    const snapshot = await service.getWorkspaceSnapshot();
    const active = snapshot.campaigns.find(
      (campaign) => campaign.id === snapshot.activeCampaignId,
    );
    if (!active) throw new Error("Expected an active campaign fixture.");

    await service.saveCampaign({
      id: active.id,
      name: active.name,
      description: active.description,
      mode: active.mode,
      status: "paused",
      searchPreferences: active.searchPreferences,
      sourceTargetIds: active.sourceTargetIds,
      minimumFitScore: active.minimumFitScore,
      limits: active.limits,
      stopRules: active.stopRules,
      applicationPolicy: active.applicationPolicy,
      schedule: active.schedule,
      rules: active.rules,
      latestDigest: active.latestDigest,
    });

    await expect(service.runDiscovery()).rejects.toThrow(
      "Set it to active before starting discovery",
    );
  });
});
