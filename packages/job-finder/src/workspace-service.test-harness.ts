import type { JobFinderAiClient } from "@unemployed/ai-providers";
import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  createInMemoryJobFinderRepository,
  type JobFinderRepositorySeed,
} from "@unemployed/db";
import { createJobFinderWorkspaceService } from "./index";
import { createSeed } from "./workspace-service.test-fixtures";
import {
  createAiClient,
  createBrowserRuntime,
  createDocumentManager,
  createResearchAdapter,
} from "./workspace-service.test-runtimes";

export function createWorkspaceServiceHarness(
  options: {
    seed?: JobFinderRepositorySeed;
    browserRuntime?: BrowserSessionRuntime;
    aiClient?: JobFinderAiClient;
    documentManager?: ReturnType<typeof createDocumentManager>;
    exportFileVerifier?: { exists(filePath: string): Promise<boolean> };
    researchAdapter?: ReturnType<typeof createResearchAdapter>;
  } = {},
) {
  const repository = createInMemoryJobFinderRepository(
    options.seed ?? createSeed(),
  );
  const browserRuntime = options.browserRuntime ?? createBrowserRuntime();
  const aiClient = options.aiClient ?? createAiClient();
  const documentManager = options.documentManager ?? createDocumentManager();
  const exportFileVerifier =
    options.exportFileVerifier ?? {
      exists: () => Promise.resolve(true),
    };
  const researchAdapter = options.researchAdapter ?? createResearchAdapter();
  const workspaceService = createJobFinderWorkspaceService({
    repository,
    browserRuntime,
    aiClient,
    documentManager,
    exportFileVerifier,
    researchAdapter,
  });

  return {
    repository,
    browserRuntime,
    aiClient,
    documentManager,
    exportFileVerifier,
    researchAdapter,
    workspaceService,
  };
}
