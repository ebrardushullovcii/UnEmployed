import { describe, expect, test } from "vitest";
import {
  createDocumentManager,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

describe("resume preview cancellation", () => {
  test("discards a render that is aborted while the document manager is working", async () => {
    const baseDocumentManager = createDocumentManager();
    let markRenderStarted: () => void = () => {};
    let releaseRender: () => void = () => {};
    const renderStarted = new Promise<void>((resolve) => {
      markRenderStarted = resolve;
    });
    const renderRelease = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    let receivedSignal: AbortSignal | undefined;

    const documentManager = {
      ...baseDocumentManager,
      async renderResumePreview(
        input: Parameters<typeof baseDocumentManager.renderResumePreview>[0],
        signal?: AbortSignal,
      ) {
        receivedSignal = signal;
        markRenderStarted();
        await renderRelease;
        return baseDocumentManager.renderResumePreview(input);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      documentManager,
    });
    const workspace = await workspaceService.getResumeWorkspace("job_ready");
    const controller = new AbortController();

    const pendingPreview = workspaceService.previewResumeDraft(
      workspace.draft,
      controller.signal,
    );
    await renderStarted;
    expect(receivedSignal).toBe(controller.signal);

    controller.abort();
    releaseRender();

    await expect(pendingPreview).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
