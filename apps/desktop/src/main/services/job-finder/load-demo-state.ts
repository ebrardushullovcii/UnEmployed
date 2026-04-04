import { JobFinderWorkspaceSnapshotSchema } from "@unemployed/contracts";
import { createResumeWorkspaceDemoState } from "../../adapters/job-finder-demo-state";
import { getJobFinderWorkspaceService } from "./workspace-service";

export async function loadResumeWorkspaceDemoState() {
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
  const snapshot = await jobFinderWorkspaceService.resetWorkspace(
    createResumeWorkspaceDemoState(),
  );

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
}
