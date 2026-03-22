import { createJobFinderWorkspaceServiceAsync } from './create-workspace-service'

let jobFinderWorkspaceServicePromise:
  | ReturnType<typeof createJobFinderWorkspaceServiceAsync>
  | undefined

export function getJobFinderWorkspaceService() {
  jobFinderWorkspaceServicePromise ??= createJobFinderWorkspaceServiceAsync()
  return jobFinderWorkspaceServicePromise
}
