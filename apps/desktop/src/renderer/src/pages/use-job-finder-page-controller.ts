import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DiscoveryActivityEvent,
  JobFinderResumeWorkspace,
  JobFinderWorkspaceSnapshot,
  ProfileCopilotMessage,
  ResumeAssistantMessage,
} from '@unemployed/contracts'
import { useJobFinderWorkspace } from '@renderer/features/job-finder/hooks/use-job-finder-workspace'
import type { ActionState, JobFinderShellActions } from '@renderer/features/job-finder/lib/job-finder-types'
import { useLocation, useNavigate } from 'react-router-dom'
import { type JobFinderPageContext } from './job-finder-page-routes'
import {
  buildJobFinderPageContext,
} from './use-job-finder-page-controller-context'
import {
  getActiveResumeWorkspaceJobId,
  getLatestApplicationAttempt,
  useResettableSelection,
} from './use-job-finder-page-controller-helpers'

export function useJobFinderPageController() {
  const location = useLocation()
  const navigate = useNavigate()
  const workspaceState = useJobFinderWorkspace()
  const [actionState, setActionState] = useState<ActionState>({
    busy: false,
    message: null,
  })
  const [liveDiscoveryEvents, setLiveDiscoveryEvents] = useState<
    DiscoveryActivityEvent[]
  >([])
  const [resumeWorkspace, setResumeWorkspace] =
    useState<JobFinderResumeWorkspace | null>(null)
  const [resumeAssistantMessages, setResumeAssistantMessages] = useState<
    readonly ResumeAssistantMessage[]
  >([])
  const [resumeAssistantPending, setResumeAssistantPending] = useState(false)
  const [optimisticProfileCopilotMessages, setOptimisticProfileCopilotMessages] =
    useState<readonly ProfileCopilotMessage[]>([])
  const [profileCopilotPendingContextKey, setProfileCopilotPendingContextKey] =
    useState<string | null>(null)
  const [profileCopilotBusy, setProfileCopilotBusy] = useState(false)
  const profileCopilotRequestTokenRef = useRef(0)
  const [resumeWorkspaceDirty, setResumeWorkspaceDirty] = useState(false)
  const sourceDebugRunIdRef = useRef(0)
  const activeResumeWorkspaceJobId = getActiveResumeWorkspaceJobId(
    location.pathname,
  )

  const [selectedDiscoveryJobId, setSelectedDiscoveryJobId] =
    useResettableSelection(
      workspaceState.status === 'ready'
        ? workspaceState.workspace.selectedDiscoveryJobId
        : null,
    )
  const [selectedReviewJobId, setSelectedReviewJobId] = useResettableSelection(
    workspaceState.status === 'ready'
      ? workspaceState.workspace.selectedReviewJobId
      : null,
  )
  const [selectedApplicationRecordId, setSelectedApplicationRecordId] =
    useResettableSelection(
      workspaceState.status === 'ready'
        ? workspaceState.workspace.selectedApplicationRecordId
        : null,
    )

  const activeRouteResumeWorkspace =
    activeResumeWorkspaceJobId &&
    resumeWorkspace?.job.id === activeResumeWorkspaceJobId
      ? resumeWorkspace
      : null
  const activeRouteResumeAssistantMessages = activeRouteResumeWorkspace
    ? resumeAssistantMessages
    : []
  const activeRouteResumeAssistantPending = activeRouteResumeWorkspace
    ? resumeAssistantPending
    : false
  const activeRouteResumeWorkspaceDirty = activeRouteResumeWorkspace
    ? resumeWorkspaceDirty
    : false
  const [profileSurfaceDirty, setProfileSurfaceDirty] = useState(false)

  const confirmLeaveDirtyResumeWorkspace = useCallback(() => {
    if (!activeResumeWorkspaceJobId || !activeRouteResumeWorkspaceDirty) {
      return true
    }

    return window.confirm(
      'You have unsaved resume edits. Leave this workspace and discard them?',
    )
  }, [activeResumeWorkspaceJobId, activeRouteResumeWorkspaceDirty])

  const readyWorkspaceState =
    workspaceState.status === 'ready' ? workspaceState : null
  const actions = readyWorkspaceState?.actions ?? null
  const lastKnownPlatformRef = useRef<
    'darwin' | 'win32' | 'linux' | undefined
  >(
    workspaceState.status === 'ready' ? workspaceState.platform : undefined,
  )
  if (readyWorkspaceState?.platform) {
    lastKnownPlatformRef.current = readyWorkspaceState.platform
  }
  const platform =
    readyWorkspaceState?.platform ??
    lastKnownPlatformRef.current ??
    (workspaceState.status === 'ready' ? workspaceState.platform : undefined)
  const workspace = readyWorkspaceState?.workspace ?? null
  const workspaceWithOptimisticProfileCopilot = useMemo<JobFinderWorkspaceSnapshot | null>(() => {
    if (!workspace) {
      return null
    }

    if (optimisticProfileCopilotMessages.length === 0) {
      return workspace
    }

    return {
      ...workspace,
      profileCopilotMessages: [
        ...workspace.profileCopilotMessages,
        ...optimisticProfileCopilotMessages,
      ],
    }
  }, [optimisticProfileCopilotMessages, workspace])
  const profileSetupState = workspace?.profileSetupState ?? null
  const canImportResume = !profileSurfaceDirty
  const importResumeGuardMessage = profileSurfaceDirty
    ? 'Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten.'
    : null
  const activeResumeWorkspaceJobIdRef = useRef<string | null>(
    activeResumeWorkspaceJobId,
  )
  const getResumeWorkspaceRef = useRef<
    JobFinderShellActions['getResumeWorkspace'] | null
  >(actions?.getResumeWorkspace ?? null)
  const resumeAssistantRequestTokenRef = useRef(0)
  activeResumeWorkspaceJobIdRef.current = activeResumeWorkspaceJobId
  getResumeWorkspaceRef.current = actions?.getResumeWorkspace ?? null

  const clearResumeWorkspaceState = useCallback(() => {
    setResumeWorkspace(null)
    setResumeAssistantMessages([])
    setResumeAssistantPending(false)
    setResumeWorkspaceDirty(false)
  }, [])

  const isCurrentResumeWorkspaceJob = useCallback(
    (jobId: string) => activeResumeWorkspaceJobIdRef.current === jobId,
    [],
  )

  const isCurrentResumeAssistantRequest = useCallback(
    (jobId: string, requestToken: number) =>
      activeResumeWorkspaceJobIdRef.current === jobId &&
      resumeAssistantRequestTokenRef.current === requestToken,
    [],
  )

  const refreshResumeWorkspace = useCallback(
    async (
      jobId: string,
      options?: {
        updateAssistantMessages?: boolean
      },
    ) => {
      const nextWorkspace = await actions?.getResumeWorkspace(jobId)

      if (!nextWorkspace || !isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
        return false
      }

      setResumeWorkspace(nextWorkspace)

      if (options?.updateAssistantMessages) {
        setResumeAssistantMessages(nextWorkspace.assistantMessages)
        setResumeAssistantPending(false)
      }

      return true
    },
    [actions, isCurrentResumeWorkspaceJob],
  )

  useEffect(() => {
    if (
      resumeWorkspace?.job.id &&
      resumeWorkspace.job.id !== activeResumeWorkspaceJobId
    ) {
      clearResumeWorkspaceState()
    }

    if (!activeResumeWorkspaceJobId) {
      clearResumeWorkspaceState()
    }
  }, [
    activeResumeWorkspaceJobId,
    clearResumeWorkspaceState,
    resumeWorkspace?.job.id,
  ])

  useEffect(() => {
    if (
      !activeResumeWorkspaceJobId ||
      !workspace?.reviewQueue ||
      workspace.reviewQueue.some((item) => item.jobId === activeResumeWorkspaceJobId)
    ) {
      return
    }

    setActionState({
      busy: false,
      message:
        'This resume is no longer available. Shortlisted is shown instead.',
    })
    void navigate('/job-finder/review-queue', { replace: true })
  }, [activeResumeWorkspaceJobId, navigate, workspace?.reviewQueue])

  useEffect(() => {
    let cancelled = false

    const getResumeWorkspace = getResumeWorkspaceRef.current

    if (!activeResumeWorkspaceJobId || !actions || !getResumeWorkspace) {
      return () => {
        cancelled = true
      }
    }

    void getResumeWorkspace(activeResumeWorkspaceJobId)
      .then((nextWorkspace) => {
        if (
          !cancelled &&
          nextWorkspace.job.id === activeResumeWorkspaceJobIdRef.current
        ) {
          setActionState((current) =>
            current.message === null ? current : { ...current, message: null },
          )
          setResumeWorkspace(nextWorkspace)
          setResumeAssistantMessages(nextWorkspace.assistantMessages)
          setResumeAssistantPending(false)
          setSelectedReviewJobId(nextWorkspace.job.id)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setActionState({
            busy: false,
            message:
              error instanceof Error
                ? `Resume editor could not be loaded. ${error.message}`
                : 'Resume editor could not be loaded. Shortlisted is shown instead.',
          })
          void navigate('/job-finder/review-queue', { replace: true })
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    activeResumeWorkspaceJobId,
    actions,
    navigate,
    setSelectedReviewJobId,
  ])

  const navigateFromShell = useCallback(
    (path: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return
      }

      setResumeWorkspaceDirty(false)
      void navigate(path)
    },
    [confirmLeaveDirtyResumeWorkspace, navigate],
  )

  const selectedDiscoveryJob = useMemo(
    () =>
      workspace?.discoveryJobs.find((job) => job.id === selectedDiscoveryJobId) ??
      workspace?.discoveryJobs[0] ??
      null,
    [selectedDiscoveryJobId, workspace?.discoveryJobs],
  )

  const selectedReviewItem = useMemo(
    () =>
      workspace?.reviewQueue.find((item) => item.jobId === selectedReviewJobId) ??
      workspace?.reviewQueue[0] ??
      null,
    [selectedReviewJobId, workspace?.reviewQueue],
  )

  const selectedReviewJob = useMemo(
    () =>
      workspace?.discoveryJobs.find(
        (job) => job.id === selectedReviewItem?.jobId,
      ) ??
      selectedDiscoveryJob ??
      null,
    [selectedDiscoveryJob, selectedReviewItem?.jobId, workspace?.discoveryJobs],
  )

  const selectedTailoredAsset = useMemo(
    () =>
      workspace?.tailoredAssets.find(
        (asset) => asset.id === selectedReviewItem?.resumeAssetId,
      ) ?? null,
    [selectedReviewItem?.resumeAssetId, workspace?.tailoredAssets],
  )

  const { selectedApplicationAttempt, selectedApplicationRecord } = useMemo(
    () =>
      workspace
        ? getLatestApplicationAttempt(workspace, selectedApplicationRecordId)
        : { selectedApplicationAttempt: null, selectedApplicationRecord: null },
    [selectedApplicationRecordId, workspace],
  )

  const context = useMemo<JobFinderPageContext | null>(() => {
    if (!readyWorkspaceState || !workspace || !actions) {
      return null
    }

    return buildJobFinderPageContext({
      actionState,
      actions,
      activeRouteResumeAssistantMessages,
      activeRouteResumeAssistantPending,
     activeRouteResumeWorkspace,
     canImportResume,
     confirmLeaveDirtyResumeWorkspace,
      importResumeGuardMessage,
      isCurrentResumeAssistantRequest,
      isCurrentResumeWorkspaceJob,
      liveDiscoveryEvents,
      locationPathname: location.pathname,
      navigate: (path, options) => {
        void navigate(path, options)
      },
      profileCopilotBusy,
      profileCopilotPendingContextKey,
      profileCopilotRequestTokenRef,
      profileSetupState,
      refreshResumeWorkspace,
      resumeAssistantRequestTokenRef,
      selectedApplicationAttempt,
      selectedApplicationRecord,
       selectedDiscoveryJob,
       selectedReviewItem,
       selectedReviewJob,
       selectedTailoredAsset,
       setActionState,
       setLiveDiscoveryEvents,
       setOptimisticProfileCopilotMessages,
       setProfileCopilotBusy,
       setProfileCopilotPendingContextKey,
      setProfileSurfaceDirty,
      setResumeAssistantMessages,
      setResumeAssistantPending,
      setResumeWorkspace,
      setResumeWorkspaceDirty,
      setSelectedApplicationRecordId,
      setSelectedDiscoveryJobId,
      setSelectedReviewJobId,
      sourceDebugRunIdRef,
      workspace: workspaceWithOptimisticProfileCopilot ?? workspace,
    })
  }, [
    actionState,
    actions,
    activeRouteResumeAssistantMessages,
    activeRouteResumeAssistantPending,
    activeRouteResumeWorkspace,
    clearResumeWorkspaceState,
    confirmLeaveDirtyResumeWorkspace,
    isCurrentResumeAssistantRequest,
    isCurrentResumeWorkspaceJob,
    liveDiscoveryEvents,
    location.pathname,
     navigate,
     optimisticProfileCopilotMessages,
     canImportResume,
     profileCopilotBusy,
     profileSetupState,
     profileCopilotPendingContextKey,
     importResumeGuardMessage,
     refreshResumeWorkspace,
    selectedApplicationAttempt,
    selectedApplicationRecord,
    selectedDiscoveryJob,
    selectedReviewItem,
    selectedReviewJob,
    selectedTailoredAsset,
    workspace,
    workspaceWithOptimisticProfileCopilot,
  ])

  if (!readyWorkspaceState || !workspace || !actions) {
    return {
      appearanceTheme: null,
      context: null,
      navigateFromShell,
      platform,
      workspace,
      workspaceState,
    }
  }

  return {
    appearanceTheme: workspace.settings.appearanceTheme,
    context: context!,
    navigateFromShell,
    platform,
    workspace,
    workspaceState,
  }
}
