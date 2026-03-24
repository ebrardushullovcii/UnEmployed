import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CandidateProfile,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences
} from '@unemployed/contracts'
import type { JobFinderShellActions } from '../lib/job-finder-types'

type JobFinderWorkspaceState =
  | { status: 'loading' }
  | {
      status: 'ready'
      actions: JobFinderShellActions
      platform: 'darwin' | 'win32' | 'linux'
      workspace: JobFinderWorkspaceSnapshot
    }
  | { status: 'error'; message: string }

export function useJobFinderWorkspace(): JobFinderWorkspaceState {
  const [workspaceState, setWorkspaceState] = useState<JobFinderWorkspaceState>({ status: 'loading' })

  const runWorkspaceAction = useCallback(async (action: () => Promise<JobFinderWorkspaceSnapshot>) => {
    const workspace = await action()

    setWorkspaceState((currentState) => {
      if (currentState.status !== 'ready') {
        return currentState
      }

      return {
        ...currentState,
        workspace
      }
    })
  }, [])

  const actions = useMemo<JobFinderShellActions>(
    () => ({
      analyzeProfileFromResume: () =>
        runWorkspaceAction(() => window.unemployed.jobFinder.analyzeProfileFromResume()),
      openBrowserSession: () =>
        runWorkspaceAction(() => window.unemployed.jobFinder.openBrowserSession()),
      approveApply: (jobId: string) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.approveApply(jobId)),
      dismissDiscoveryJob: (jobId: string) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.dismissDiscoveryJob(jobId)),
      generateResume: (jobId: string) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.generateResume(jobId)),
      importResume: () => runWorkspaceAction(() => window.unemployed.jobFinder.importResume()),
      queueJobForReview: (jobId: string) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.queueJobForReview(jobId)),
      refreshWorkspace: () => runWorkspaceAction(() => window.unemployed.jobFinder.getWorkspace()),
      resetWorkspace: () => runWorkspaceAction(() => window.unemployed.jobFinder.resetWorkspace()),
      runDiscovery: () => runWorkspaceAction(() => window.unemployed.jobFinder.runDiscovery()),
      saveProfile: (profile: CandidateProfile) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.saveProfile(profile)),
      saveWorkspaceInputs: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.saveWorkspaceInputs(profile, searchPreferences)),
      saveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.saveSearchPreferences(searchPreferences)),
      saveSettings: (settings: JobFinderSettings) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.saveSettings(settings))
    }),
    [runWorkspaceAction]
  )

  useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      try {
        const [platformResponse, workspace] = await Promise.all([
          window.unemployed.ping(),
          window.unemployed.jobFinder.getWorkspace()
        ])

        if (!cancelled) {
          setWorkspaceState({
            status: 'ready',
            actions,
            platform: platformResponse.platform,
            workspace
          })
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load the Job Finder workspace.'

        if (!cancelled) {
          setWorkspaceState({ status: 'error', message })
        }
      }
    }

    void loadWorkspace()

    return () => {
      cancelled = true
    }
  }, [actions])

  return workspaceState
}
