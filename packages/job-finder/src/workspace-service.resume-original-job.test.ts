import { describe, expect, test, vi } from "vitest";
import { createSeed } from "./workspace-service.test-fixtures";
import { createAiClient } from "./workspace-service.test-runtimes";
import { createWorkspaceServiceHarness } from "./workspace-service.test-support";

function createOriginalJobHarness() {
  const seed = createSeed();
  const baseAiClient = createAiClient();
  const reviseResumeDraft = vi.fn(baseAiClient.reviseResumeDraft);
  const harness = createWorkspaceServiceHarness({
    seed: {
      ...seed,
      // No resume written yet: the job sends the imported file.
      tailoredAssets: seed.tailoredAssets.filter(
        (asset) => asset.jobId !== "job_ready",
      ),
    },
    aiClient: { ...baseAiClient, reviseResumeDraft },
  });
  return { ...harness, reviseResumeDraft };
}

describe("Resume Studio on an Original job", () => {
  test("opening the studio does not record the seeded draft as a ready resume", async () => {
    const { repository, workspaceService } = createOriginalJobHarness();
    await workspaceService.setJobResumeApplicationMode(
      "job_ready",
      "original_resume",
    );

    const workspace = await workspaceService.getResumeWorkspace("job_ready");

    expect(workspace.draft.jobId).toBe("job_ready");
    const assets = await repository.listTailoredAssets();
    expect(assets.find((asset) => asset.jobId === "job_ready")).toBeUndefined();
  });

  test("the Assistant names the switch to an editable draft instead of proposing an edit Original never sends", async () => {
    const { workspaceService, reviseResumeDraft } = createOriginalJobHarness();
    await workspaceService.setJobResumeApplicationMode(
      "job_ready",
      "original_resume",
    );

    const messages = await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Shorten the summary to one sentence.",
    );

    expect(reviseResumeDraft).not.toHaveBeenCalled();
    const reply = messages.at(-1);
    expect(reply?.role).toBe("assistant");
    expect(reply?.patches).toEqual([]);
    expect(reply?.approvalBlockers ?? []).toEqual([]);
    expect(reply?.content).toContain("sends your original resume file unchanged");
    expect(reply?.content).toContain('"Write an editable');
    expect(messages.at(-2)?.content).toBe(
      "Shorten the summary to one sentence.",
    );
  });

  test("after switching to a written level the same request reaches the model", async () => {
    const { workspaceService, reviseResumeDraft } = createOriginalJobHarness();
    await workspaceService.setJobResumeApplicationMode(
      "job_ready",
      "original_resume",
    );
    await workspaceService.getResumeWorkspace("job_ready");

    await workspaceService.setJobResumeApplicationMode(
      "job_ready",
      "tailored_per_job",
      "conservative",
    );
    await workspaceService.generateResume("job_ready");
    await workspaceService.sendResumeAssistantMessage(
      "job_ready",
      "Shorten the summary to one sentence.",
    );

    expect(reviseResumeDraft).toHaveBeenCalledTimes(1);
  });
});

describe("a repeated Create the resume press", () => {
  test("joins the run already writing this job's resume instead of starting a second one", async () => {
    const baseAiClient = createAiClient();
    const createResumeDraft = vi.fn(baseAiClient.createResumeDraft);
    const { workspaceService } = createWorkspaceServiceHarness({
      aiClient: { ...baseAiClient, createResumeDraft },
    });

    const first = workspaceService.generateResume("job_ready");
    const second = workspaceService.generateResume("job_ready");
    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);

    expect(createResumeDraft).toHaveBeenCalledTimes(1);
    expect(secondSnapshot).toBe(firstSnapshot);

    await workspaceService.generateResume("job_ready");
    expect(createResumeDraft).toHaveBeenCalledTimes(2);
  });
});
