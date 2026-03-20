import { useEffect, useState } from 'react'
import type { CandidateProfile, JobFinderSettings, JobFinderWorkspaceSnapshot, JobSearchPreferences } from '@unemployed/contracts'
import { JobFinderShell } from './job-finder-shell'

type AppLoadState =
  | { status: 'loading' }
  | {
      status: 'ready'
      platform: 'darwin' | 'win32' | 'linux'
      workspace: JobFinderWorkspaceSnapshot
    }
  | { status: 'error'; message: string }

export function App() {
  const [loadState, setLoadState] = useState<AppLoadState>({ status: 'loading' })

  async function runWorkspaceAction(
    action: () => Promise<JobFinderWorkspaceSnapshot>
  ): Promise<void> {
    const workspace = await action()

    setLoadState((currentState) => {
      if (currentState.status !== 'ready') {
        return currentState
      }

      return {
        ...currentState,
        workspace
      }
    })
  }

  useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      try {
        const [platformResponse, workspace] = await Promise.all([
          window.unemployed.ping(),
          window.unemployed.jobFinder.getWorkspace()
        ])

        if (!cancelled) {
          setLoadState({
            status: 'ready',
            platform: platformResponse.platform,
            workspace
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load the Job Finder workspace.'

        if (!cancelled) {
          setLoadState({ status: 'error', message })
        }
      }
    }

    void loadWorkspace()

    return () => {
      cancelled = true
    }
  }, [])

  if (loadState.status === 'loading') {
    return (
      <main className="boot-screen">
        <div className="boot-card">
          <p className="boot-kicker">UnEmployed</p>
          <h1>Booting Job Finder workspace</h1>
          <p>Loading the first LinkedIn Easy Apply slice and typed desktop context.</p>
        </div>
      </main>
    )
  }

  if (loadState.status === 'error') {
    return (
      <main className="boot-screen">
        <div className="boot-card boot-card-error">
          <p className="boot-kicker">Workspace Error</p>
          <h1>Job Finder failed to load</h1>
          <p>{loadState.message}</p>
        </div>
      </main>
    )
  }

  return (
    <JobFinderShell
      actions={{
        approveApply: (jobId) =>
          runWorkspaceAction(() => window.unemployed.jobFinder.approveApply(jobId)),
        dismissDiscoveryJob: (jobId) =>
          runWorkspaceAction(() => window.unemployed.jobFinder.dismissDiscoveryJob(jobId)),
        generateResume: (jobId) =>
          runWorkspaceAction(() => window.unemployed.jobFinder.generateResume(jobId)),
        queueJobForReview: (jobId) =>
          runWorkspaceAction(() => window.unemployed.jobFinder.queueJobForReview(jobId)),
        resetWorkspace: () =>
          runWorkspaceAction(() => window.unemployed.jobFinder.resetWorkspace()),
        importResume: () =>
          runWorkspaceAction(() => window.unemployed.jobFinder.importResume()),
        runDiscovery: () =>
          runWorkspaceAction(() => window.unemployed.jobFinder.runDiscovery()),
        saveProfile: (profile: CandidateProfile) =>
          runWorkspaceAction(() => window.unemployed.jobFinder.saveProfile(profile)),
        saveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
          runWorkspaceAction(() => window.unemployed.jobFinder.saveSearchPreferences(searchPreferences)),
        saveSettings: (settings: JobFinderSettings) =>
          runWorkspaceAction(() => window.unemployed.jobFinder.saveSettings(settings)),
        refreshWorkspace: () =>
          runWorkspaceAction(() => window.unemployed.jobFinder.getWorkspace())
      }}
      platform={loadState.platform}
      workspace={loadState.workspace}
    />
  )
}
