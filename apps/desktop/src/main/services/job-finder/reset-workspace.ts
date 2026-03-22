import { rm } from 'node:fs/promises'
import { JobFinderWorkspaceSnapshotSchema } from '@unemployed/contracts'
import { createFreshJobFinderRepositorySeed } from '../../adapters/job-finder-seed'
import { getJobFinderDocumentsDirectory, getLinkedInBrowserProfileDirectory } from './paths'
import { getJobFinderWorkspaceService } from './workspace-service'

export async function resetJobFinderWorkspace() {
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()

  await Promise.all([
    rm(getJobFinderDocumentsDirectory(), { recursive: true, force: true }),
    rm(getLinkedInBrowserProfileDirectory(), { recursive: true, force: true })
  ])

  const snapshot = await jobFinderWorkspaceService.resetWorkspace(createFreshJobFinderRepositorySeed())

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
}
