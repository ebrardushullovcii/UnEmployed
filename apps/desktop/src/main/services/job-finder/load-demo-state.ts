import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { JobFinderWorkspaceSnapshotSchema } from "@unemployed/contracts";
import {
  createApplyQueueDemoState,
  createResumeWorkspaceDemoState,
} from "../../adapters/job-finder-demo-state";
import { getJobFinderWorkspaceService } from "./workspace-service";

async function ensureDemoExportFiles(filePaths: readonly (string | null | undefined)[]) {
  await Promise.all(
    filePaths.map(async (filePath) => {
      if (!filePath) {
        return;
      }

      const directory = path.dirname(filePath);
      await mkdir(directory, { recursive: true });
      await writeFile(filePath, "%PDF-1.4\n% deterministic demo export\n", "utf8");
    }),
  );
}

export async function loadResumeWorkspaceDemoState() {
  const state = createResumeWorkspaceDemoState();
  await ensureDemoExportFiles(state.resumeExportArtifacts.map((artifact) => artifact.filePath));
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
  const snapshot = await jobFinderWorkspaceService.resetWorkspace(
    state,
  );

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
}

export async function loadApplyQueueDemoState() {
  const state = createApplyQueueDemoState();
  await ensureDemoExportFiles(state.resumeExportArtifacts.map((artifact) => artifact.filePath));
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
  const snapshot = await jobFinderWorkspaceService.resetWorkspace(
    state,
  );

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
}
