import { createJobFinderWorkspaceServiceAsync } from './create-workspace-service'

let jobFinderWorkspaceServicePromise:
  | ReturnType<typeof createJobFinderWorkspaceServiceAsync>
  | undefined

let jobFinderWorkspaceServiceOverrideEnv: Partial<NodeJS.ProcessEnv> | null = null

export function getJobFinderWorkspaceService() {
  jobFinderWorkspaceServicePromise ??= createJobFinderWorkspaceServiceAsync(
    jobFinderWorkspaceServiceOverrideEnv ?? undefined,
  )
  return jobFinderWorkspaceServicePromise
}

export async function setJobFinderWorkspaceServiceTestEnv(
  envOverrides: Partial<NodeJS.ProcessEnv> | null,
) {
  await shutdownJobFinderWorkspaceService()
  jobFinderWorkspaceServiceOverrideEnv = envOverrides
}

export async function shutdownJobFinderWorkspaceService() {
  const servicePromise = jobFinderWorkspaceServicePromise
  jobFinderWorkspaceServicePromise = undefined

  if (!servicePromise) {
    return
  }

  const service = await servicePromise.catch((error) => {
    console.warn('[Desktop] Job Finder workspace service was not created before shutdown.', error)
    return undefined
  })
  if (!service) {
    return
  }

  await service.shutdown().catch((error) => {
    console.warn('[Desktop] Failed to shut down Job Finder workspace service cleanly.', error)
  })
}
