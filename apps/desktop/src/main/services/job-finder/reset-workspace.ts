import { rm } from 'node:fs/promises'
import { JobFinderWorkspaceSnapshotSchema } from '@unemployed/contracts'
import { createEmptyJobFinderRepositoryState } from '../../adapters/job-finder-initial-state'
import { getBrowserAgentProfileDirectory, getJobFinderDocumentsDirectory } from './paths'
import { getJobFinderWorkspaceService } from './workspace-service'

export async function resetJobFinderWorkspace() {
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()

  const snapshot = await jobFinderWorkspaceService.resetWorkspace(
    createEmptyJobFinderRepositoryState(),
    {
      beforeStateReset: () =>
        Promise.all([
          rm(getJobFinderDocumentsDirectory(), { recursive: true, force: true }),
          rm(getBrowserAgentProfileDirectory(), { recursive: true, force: true })
        ]).then(() => undefined)
    }
  )

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
}
