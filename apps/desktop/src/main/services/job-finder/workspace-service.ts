import { createJobFinderWorkspaceServiceAsync } from './create-workspace-service'

let jobFinderWorkspaceServicePromise:
  | ReturnType<typeof createJobFinderWorkspaceServiceAsync>
  | undefined

export function getJobFinderWorkspaceService() {
  jobFinderWorkspaceServicePromise ??= createJobFinderWorkspaceServiceAsync()
  return jobFinderWorkspaceServicePromise
}

export async function shutdownJobFinderWorkspaceService() {
  const servicePromise = jobFinderWorkspaceServicePromise
  jobFinderWorkspaceServicePromise = undefined

  if (!servicePromise) {
    return
  }

  const service = await servicePromise
  await service.shutdown().catch((error) => {
    console.warn('[Desktop] Failed to shut down Job Finder workspace service cleanly.', error)
  })
}
