import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  CandidateProfile,
  DiscoveryActivityEvent,
  JobFinderResumeWorkspace,
  JobFinderOpenBrowserSessionInput,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  ProfileCopilotMessage,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupState,
  ProfileSetupStep,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
} from '@unemployed/contracts'
import type {
  ActionState,
  JobFinderShellActions,
} from '@renderer/features/job-finder/lib/job-finder-types'
import {
  type PendingActionScope,
  type PendingActionState,
  jobFinderPendingActions,
} from './job-finder-pending-actions'
import { getProfileCopilotContextKey } from '@renderer/features/job-finder/lib/profile-copilot-context'
import { buildSourceDebugOutcomeMessage } from './job-finder-page-routes'

type ActionOptions = {
  clearMessageOnStart?: boolean
  scope?: PendingActionScope
}

type BaseActionArgs = {
  actions: JobFinderShellActions
  activeRouteResumeWorkspace: JobFinderResumeWorkspace | null
  canImportResume: boolean
  confirmLeaveDirtyResumeWorkspace: () => boolean
  importResumeGuardMessage: string | null
  isCurrentResumeAssistantRequest: (jobId: string, requestToken: number) => boolean
  isCurrentResumeWorkspaceJob: (jobId: string) => boolean
  locationPathname: string
  navigate: (path: string, options?: { replace?: boolean; state?: unknown }) => void
  profileSetupState: ProfileSetupState | null
  profileCopilotRequestTokenRef: MutableRefObject<number>
  refreshResumeWorkspace: (
    jobId: string,
    options?: {
      updateAssistantMessages?: boolean
    },
  ) => Promise<boolean>
  resumeAssistantRequestTokenRef: MutableRefObject<number>
  setActionState: Dispatch<SetStateAction<ActionState>>
  setLiveDiscoveryEvents: Dispatch<SetStateAction<DiscoveryActivityEvent[]>>
  setOptimisticProfileCopilotMessages: Dispatch<
    SetStateAction<readonly ProfileCopilotMessage[]>
  >
  setPendingActionState: Dispatch<SetStateAction<PendingActionState>>
  setProfileCopilotBusy: Dispatch<SetStateAction<boolean>>
  setProfileCopilotPendingContextKey: Dispatch<SetStateAction<string | null>>
  setResumeAssistantMessages: Dispatch<
    SetStateAction<readonly ResumeAssistantMessage[]>
  >
  setResumeAssistantPending: Dispatch<SetStateAction<boolean>>
  setResumeWorkspace: Dispatch<SetStateAction<JobFinderResumeWorkspace | null>>
  setResumeWorkspaceDirty: Dispatch<SetStateAction<boolean>>
  setSelectedReviewJobId: (jobId: string) => void
  sourceDebugRunIdRef: MutableRefObject<number>
  workspace: JobFinderWorkspaceSnapshot
}

const handledRefreshErrorTag = Symbol('handledRefreshError')

type HandledRefreshError = Error & {
  [handledRefreshErrorTag]: true
}

function resolvePendingScope(
  options: ActionOptions | undefined,
): PendingActionScope | null {
  return options?.scope ?? null
}

function markHandledRefreshError(error: unknown): HandledRefreshError {
  const handledError =
    error instanceof Error
      ? error
      : new Error('The resume editor could not refresh automatically.')

  ;(handledError as HandledRefreshError)[handledRefreshErrorTag] = true
  return handledError as HandledRefreshError
}

function isHandledRefreshError(error: unknown): error is HandledRefreshError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      handledRefreshErrorTag in (error as Record<PropertyKey, unknown>),
  )
}

function incrementPendingScope(
  current: PendingActionState,
  scope: PendingActionScope,
): PendingActionState {
  return {
    ...current,
    [scope]: (current[scope] ?? 0) + 1,
  }
}

function decrementPendingScope(
  current: PendingActionState,
  scope: PendingActionScope,
): PendingActionState {
  const nextCount = (current[scope] ?? 0) - 1

  if (nextCount > 0) {
    return {
      ...current,
      [scope]: nextCount,
    }
  }

  if (!(scope in current)) {
    return current
  }

  const nextState = { ...current }
  delete nextState[scope]
  return nextState
}

export function createActionRunners(args: {
  setActionState: Dispatch<SetStateAction<ActionState>>
  setPendingActionState: Dispatch<SetStateAction<PendingActionState>>
}) {
  const { setActionState, setPendingActionState } = args

  const withPendingScope = async <TResult,>(
    scope: PendingActionScope | null,
    action: () => Promise<TResult>,
  ) => {
    if (!scope) {
      return action()
    }

    setPendingActionState((current) => incrementPendingScope(current, scope))

    try {
      return await action()
    } finally {
      setPendingActionState((current) => decrementPendingScope(current, scope))
    }
  }

  const runAction = async <TResult,>(
    action: () => Promise<TResult>,
    onSuccess: (result: TResult) => void | Promise<void>,
    successMessage: string | null | ((result: TResult) => string | null),
    options?: ActionOptions,
  ) => {
    const pendingScope = resolvePendingScope(options)

    try {
      if (options?.clearMessageOnStart !== false) {
        setActionState((current) =>
          current.message === null ? current : { ...current, message: null },
        )
      }

      const result = await withPendingScope(pendingScope, action)
      const resolvedSuccessMessage =
        typeof successMessage === 'function'
          ? successMessage(result)
          : successMessage

      try {
        await onSuccess(result)
      } catch (error) {
        if (isHandledRefreshError(error)) {
          throw error
        }

        const detail =
          error instanceof Error
            ? error.message
            : 'The workspace view could not refresh automatically.'
        setActionState({
          message: `Action completed, but the current view could not refresh automatically. ${detail}`,
        })
        return
      }

      setActionState({
        message: resolvedSuccessMessage,
      })
    } catch (error) {
      if (isHandledRefreshError(error)) {
        return
      }

      const message =
        error instanceof Error
          ? error.message
          : 'The requested Job Finder action failed.'
      setActionState({ message })
    }
  }

  const runResumeWorkspaceAction = async <TResult,>(
    action: () => Promise<TResult>,
    onSuccess: (result: TResult) => void | Promise<void>,
    successMessage: string | null,
    options?: ActionOptions,
  ) => {
    await runAction(
      action,
      async (result) => {
        try {
          await onSuccess(result)
        } catch (error) {
          if (isHandledRefreshError(error)) {
            throw error
          }

          const detail =
            error instanceof Error
              ? error.message
              : 'The resume editor could not refresh automatically.'
          setActionState({
            message: `Resume action succeeded, but the editor could not refresh automatically. ${detail}`,
          })
          throw markHandledRefreshError(error)
        }
      },
      successMessage,
      options,
    )
  }

  return { runAction, runResumeWorkspaceAction, withPendingScope }
}

export function createPrimaryPageActions(
  args: BaseActionArgs & {
    runAction: <TResult>(
      action: () => Promise<TResult>,
      onSuccess: (result: TResult) => void | Promise<void>,
      successMessage: string | null | ((result: TResult) => string | null),
      options?: ActionOptions,
    ) => Promise<void>
    runResumeWorkspaceAction: <TResult>(
      action: () => Promise<TResult>,
      onSuccess: (result: TResult) => void | Promise<void>,
      successMessage: string | null,
      options?: ActionOptions,
    ) => Promise<void>
    withPendingScope: <TResult>(
      scope: PendingActionScope | null,
      action: () => Promise<TResult>,
    ) => Promise<TResult>
  },
) {
  const {
    actions,
    activeRouteResumeWorkspace,
    canImportResume,
    confirmLeaveDirtyResumeWorkspace,
    importResumeGuardMessage,
    isCurrentResumeAssistantRequest,
    isCurrentResumeWorkspaceJob,
    locationPathname,
    navigate,
    profileSetupState,
    profileCopilotRequestTokenRef,
    refreshResumeWorkspace,
    resumeAssistantRequestTokenRef,
    runAction,
    runResumeWorkspaceAction,
    withPendingScope,
    setActionState,
    setLiveDiscoveryEvents,
    setOptimisticProfileCopilotMessages,
    setPendingActionState,
    setProfileCopilotBusy,
    setProfileCopilotPendingContextKey,
    setResumeAssistantMessages,
    setResumeAssistantPending,
    setResumeWorkspace,
    setResumeWorkspaceDirty,
    setSelectedReviewJobId,
    sourceDebugRunIdRef,
    workspace,
  } = args

  function getConfiguredSourceTarget(targetId: string) {
    return (
      workspace.searchPreferences.discovery.targets.find((target) => target.id === targetId) ??
      null
    )
  }

  const runDiscoveryAction = (targetId?: string) => {
    setLiveDiscoveryEvents([])
    void runAction(
      async () => {
        try {
          return await actions.runAgentDiscovery(
            (event) => {
              setLiveDiscoveryEvents((current) => [...current, event])
            },
            targetId,
          )
        } finally {
          setLiveDiscoveryEvents([])
        }
      },
      () => undefined,
      targetId
        ? 'Search finished for this source and results were saved on this device.'
        : 'Search finished and results were saved on this device.',
      {
        scope: targetId
          ? jobFinderPendingActions.discoveryTarget(targetId)
          : jobFinderPendingActions.discoveryAll(),
      },
    )
  }

  const startAutoFlow = (
    runner: () => Promise<unknown>,
    successMessage: string,
    scope: PendingActionScope,
  ) => {
    if (!confirmLeaveDirtyResumeWorkspace()) {
      return
    }

    void runAction(
      runner,
      () => {
        setResumeWorkspaceDirty(false)
        navigate('/job-finder/applications')
      },
      successMessage,
      { scope },
    )
  }

  return {
    onAnalyzeProfileFromResume: () => {
      if (!canImportResume) {
        setActionState({ message: importResumeGuardMessage })
        return
      }

      void runAction(actions.analyzeProfileFromResume, () => undefined, null, {
        scope: jobFinderPendingActions.profileAnalyze(),
      })
    },
    onApplyProfileCopilotPatchGroup: (patchGroupId: string) =>
      void runAction(
        () => actions.applyProfileCopilotPatchGroup(patchGroupId),
        () => undefined,
        'Profile change applied.',
        { scope: jobFinderPendingActions.profileMutation() },
      ),
    onApplyProfileSetupReviewAction: (
      reviewItemId: string,
      action: 'confirm' | 'dismiss' | 'clear_value',
    ) =>
      void runAction(
        () => actions.applyProfileSetupReviewAction(reviewItemId, action),
        () => undefined,
        action === 'confirm'
          ? 'Imported suggestion confirmed.'
          : action === 'dismiss'
            ? 'Review item dismissed for now.'
            : 'Current value cleared and the review item was resolved.',
        { scope: jobFinderPendingActions.profileReviewItem(reviewItemId) },
      ),
    onApproveApplyRun: (runId: string) =>
      void runAction(
        () => actions.approveApplyRun(runId),
        () => undefined,
        'Submit approval recorded. This safe build still stops before final submit.',
        { scope: jobFinderPendingActions.applyRun(runId) },
      ),
    onCancelApplyRun: (runId: string) =>
      void runAction(
        () => actions.cancelApplyRun(runId),
        () => undefined,
        'Automatic apply run cancelled.',
        { scope: jobFinderPendingActions.applyRun(runId) },
      ),
    onApproveApply: (jobId: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return
      }

      void runAction(
        () => actions.approveApply(jobId),
        () => {
          setResumeWorkspaceDirty(false)
          navigate('/job-finder/applications')
        },
        'Applications updated. Check the latest attempt and next step there.',
        { scope: jobFinderPendingActions.apply() },
      )
    },
    onRevokeApplyRunApproval: (runId: string) =>
      void runAction(
        () => actions.revokeApplyRunApproval(runId),
        () => undefined,
        'Submit approval revoked. The run is back to pending approval.',
        { scope: jobFinderPendingActions.applyRun(runId) },
      ),
    onResolveApplyConsentRequest: (
      requestId: string,
      action: 'approve' | 'decline',
    ) =>
      void runAction(
        () => actions.resolveApplyConsentRequest(requestId, action),
        () => undefined,
        action === 'approve'
          ? 'Consent approved. The safe run resumed without final submit.'
          : 'Consent declined. The run skipped that job and stayed non-submitting.',
        { scope: jobFinderPendingActions.applyRequest(requestId) },
      ),
    onStartAutoApplyQueue: (jobIds: string[]) => {
      if (jobIds.length === 0) {
        setActionState({ message: 'No jobs selected for auto-apply queue.' })
        return
      }

      startAutoFlow(
        () => actions.startAutoApplyQueueRun(jobIds),
        'Automatic apply queue staged. Review and approve it in Applications before any later execution step.',
        jobFinderPendingActions.apply(),
      )
    },
    onStartAutoApply: (jobId: string) => {
      startAutoFlow(
        () => actions.startAutoApplyRun(jobId),
        'Automatic submit run staged. Review and approve it in Applications before any later execution step.',
        jobFinderPendingActions.apply(),
      )
    },
    onStartApplyCopilot: (jobId: string) => {
      startAutoFlow(
        () => actions.startApplyCopilotRun(jobId),
        'Apply copilot prepared the application and paused before final submit. Review it in Applications.',
        jobFinderPendingActions.apply(),
      )
    },
    onCheckBrowserSession: () =>
      void runAction(
        actions.checkBrowserSession,
        () => undefined,
        'Browser status refreshed.',
        { scope: jobFinderPendingActions.browserSession() },
      ),
    onDismissJob: (jobId: string) =>
      void runAction(
        () => actions.dismissDiscoveryJob(jobId),
        () => undefined,
        'Job dismissed.',
        { scope: jobFinderPendingActions.discoveryJob(jobId) },
      ),
    onEditResumeWorkspace: (jobId: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return
      }

      if (!jobId) {
        navigate('/job-finder/review-queue')
        return
      }

      setSelectedReviewJobId(jobId)
      navigate(`/job-finder/review-queue/${jobId}/resume`)
    },
    onGenerateResume: (jobId: string) =>
      void runAction(
        () => actions.generateResume(jobId),
        () => setSelectedReviewJobId(jobId),
        'Resume created for this job.',
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onApproveResume: (jobId: string, exportId: string) =>
      void runResumeWorkspaceAction(
        () => actions.approveResume(jobId, exportId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'Resume approved for this job.',
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onImportResume: () => {
      if (!canImportResume) {
        setActionState({ message: importResumeGuardMessage })
        return
      }

      void runAction(actions.importResume, () => undefined, 'Resume imported from your device.', {
        scope: jobFinderPendingActions.profileImport(),
      })
    },
    onOpenBrowserSession: (input?: JobFinderOpenBrowserSessionInput) =>
      void runAction(
        () => actions.openBrowserSession(input),
        () => undefined,
        () => {
          if (input?.targetId) {
            const target = getConfiguredSourceTarget(input.targetId)
            return target
              ? `Opened the browser for ${target.label}. Sign in there, then return to continue.`
              : 'Browser opened and status refreshed.'
          }

          return workspace.browserSession.status === 'ready'
            ? 'Browser refreshed.'
            : 'Browser opened and status refreshed.'
        },
        {
          scope: input?.targetId
            ? jobFinderPendingActions.browserSessionTarget(input.targetId)
            : jobFinderPendingActions.browserSession(),
        },
      ),
    onOpenProfile: () => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return
      }

      navigate('/job-finder/profile', { state: { forceFullProfile: true } })
    },
    onQueueJob: (jobId: string) => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return
      }

      void runAction(
        () => actions.queueJobForReview(jobId),
        () => {
          setResumeWorkspaceDirty(false)
          setSelectedReviewJobId(jobId)
          navigate('/job-finder/review-queue')
        },
        'Job added to Shortlisted.',
        { scope: jobFinderPendingActions.discoveryJob(jobId) },
      )
    },
    onRejectProfileCopilotPatchGroup: (patchGroupId: string) =>
      void runAction(
        () => actions.rejectProfileCopilotPatchGroup(patchGroupId),
        () => undefined,
        'Profile change proposal dismissed.',
        { scope: jobFinderPendingActions.profileMutation() },
      ),
    onRefreshResumeWorkspace: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.getResumeWorkspace(jobId),
        (nextWorkspace) => {
          if (!isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
            return
          }

          setResumeWorkspace(nextWorkspace)
          setResumeAssistantMessages(nextWorkspace.assistantMessages)
          setResumeAssistantPending(false)
        },
        'Workspace reloaded.',
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRegenerateResumeDraft: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.regenerateResumeDraft(jobId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'Draft refreshed.',
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRegenerateResumeSection: (jobId: string, sectionId: string) =>
      void runResumeWorkspaceAction(
        () => actions.regenerateResumeSection(jobId, sectionId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'Section refreshed.',
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onRunAgentDiscovery: () => runDiscoveryAction(),
    onRunDiscoveryForTarget: (targetId: string) => runDiscoveryAction(targetId),
    onRunSourceDebug: (targetId: string) => {
      const runId = sourceDebugRunIdRef.current + 1
      const scope = jobFinderPendingActions.sourceDebug(targetId)
      sourceDebugRunIdRef.current = runId
      void withPendingScope(scope, async () => {
        setActionState({
          message: 'Starting source debug and attaching the browser profile...',
        })

        try {
          const nextWorkspace = await actions.runSourceDebug(targetId, (progressEvent) => {
            if (sourceDebugRunIdRef.current !== runId) {
              return
            }

            setActionState({
              message: progressEvent.message,
            })
          })

          if (sourceDebugRunIdRef.current !== runId) {
            return
          }

          sourceDebugRunIdRef.current = 0
          setActionState({
            message: buildSourceDebugOutcomeMessage(nextWorkspace, targetId),
          })
        } catch (error) {
          if (sourceDebugRunIdRef.current !== runId) {
            return
          }

          sourceDebugRunIdRef.current = 0
          const message =
            error instanceof Error
              ? error.message
              : 'The requested Job Finder action failed.'
          setActionState({ message })
        }
      })
    },
    onResumeProfileSetup: (step?: ProfileSetupStep) =>
      void runAction(
        () =>
          actions.saveProfileSetupState({
            ...(profileSetupState ?? {
              status: 'not_started',
              currentStep: 'import',
              completedAt: null,
              reviewItems: [],
              lastResumedAt: null,
            }),
            status:
              profileSetupState?.status === 'completed'
                ? 'completed'
                : 'in_progress',
            currentStep: step ?? profileSetupState?.currentStep ?? 'import',
            lastResumedAt: new Date().toISOString(),
          }),
        () => {
          navigate('/job-finder/profile/setup')
        },
        null,
        { scope: jobFinderPendingActions.profileSetup() },
      ),
    onSaveSetupStep: (
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
      nextStep: ProfileSetupStep,
      options?: { message?: string; openProfile?: boolean; stayOnCurrentStep?: boolean },
    ) =>
      void runAction(
        () => actions.saveWorkspaceInputs(profile, searchPreferences),
        (snapshot) => {
          const nextStatus =
            nextStep === 'ready_check' &&
            snapshot.profileSetupState.reviewItems.every(
              (item) => item.status !== 'pending' || item.severity === 'optional',
            )
              ? 'completed'
              : 'in_progress'

          return actions
            .saveProfileSetupState({
              ...snapshot.profileSetupState,
              status: nextStatus,
              currentStep:
                nextStatus === 'completed'
                  ? 'ready_check'
                  : options?.stayOnCurrentStep
                    ? snapshot.profileSetupState.currentStep
                    : nextStep,
              completedAt:
                nextStatus === 'completed'
                  ? snapshot.profileSetupState.completedAt ?? new Date().toISOString()
                  : null,
              lastResumedAt: new Date().toISOString(),
            })
            .then((updatedSnapshot) => {
              if (
                options?.openProfile ||
                updatedSnapshot.profileSetupState.status === 'completed'
              ) {
                navigate('/job-finder/profile')
                return
              }

              if (locationPathname !== '/job-finder/profile/setup') {
                navigate('/job-finder/profile/setup')
              }
            })
        },
        () =>
          options?.message ??
          (options?.openProfile
            ? 'Saved and opened the full Profile editor.'
            : nextStep === 'ready_check'
              ? 'Saved and refreshed your readiness check.'
              : options?.stayOnCurrentStep
                ? 'Saved this step.'
                : `Saved and moved to ${nextStep.replaceAll('_', ' ')}.`),
        { scope: jobFinderPendingActions.profileSetup() },
      ),
    onSaveAll: (
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
    ) =>
      void runAction(
        () => actions.saveWorkspaceInputs(profile, searchPreferences),
        () => undefined,
        null,
        { scope: jobFinderPendingActions.profileMutation() },
      ),
    onSaveResumeDraft: (draft: ResumeDraft) =>
      void runResumeWorkspaceAction(
        () => actions.saveResumeDraft(draft),
        async () => {
          await refreshResumeWorkspace(draft.jobId)
        },
        'Draft saved.',
        { scope: jobFinderPendingActions.resumeJob(draft.jobId) },
      ),
    onSaveResumeDraftAndThen: (
      draft: ResumeDraft,
      next: () => void,
      successMessage?: string | null,
    ) =>
      void (async () => {
        const jobId = draft.jobId
        let saveSucceeded = false

        await runResumeWorkspaceAction(
          () => actions.saveResumeDraft(draft),
          async () => {
            saveSucceeded = true
            await refreshResumeWorkspace(jobId)
          },
          successMessage === undefined ? 'Changes saved.' : successMessage,
          { scope: jobFinderPendingActions.resumeJob(jobId) },
        )

        if (saveSucceeded && isCurrentResumeWorkspaceJob(jobId)) {
          next()
        }
      })(),
    onApplyResumePatch: (
      patch: ResumeDraftPatch,
      revisionReason?: string | null,
    ) => {
      const scope = activeRouteResumeWorkspace
        ? jobFinderPendingActions.resumeJob(activeRouteResumeWorkspace.job.id)
        : null

      return void runResumeWorkspaceAction(
        () => actions.applyResumePatch(patch, revisionReason),
        async () => {
          if (!activeRouteResumeWorkspace) {
            return
          }

          await refreshResumeWorkspace(activeRouteResumeWorkspace.job.id, {
            updateAssistantMessages: true,
          })
        },
        'Resume updated.',
        scope ? { scope } : undefined,
      )
    },
    onSaveProfile: (profile: CandidateProfile) =>
      void runAction(() => actions.saveProfile(profile), () => undefined, null, {
        scope: jobFinderPendingActions.profileMutation(),
      }),
    onExportResumePdf: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.exportResumePdf(jobId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'PDF exported for review.',
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
      void runAction(
        () => actions.saveSearchPreferences(searchPreferences),
        () => undefined,
        null,
        { scope: jobFinderPendingActions.profileMutation() },
      ),
    onClearResumeApproval: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.clearResumeApproval(jobId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'Approved PDF removed.',
        { scope: jobFinderPendingActions.resumeJob(jobId) },
      ),
    onSaveSettings: (settings: JobFinderSettings) =>
      void runAction(() => actions.saveSettings(settings), () => undefined, null, {
        scope: jobFinderPendingActions.settingsSave(),
      }),
    onSendProfileCopilotMessage: (
      content: string,
      context?: ProfileCopilotContext,
    ) =>
      void (async () => {
        const requestToken = ++profileCopilotRequestTokenRef.current
        const effectiveContext = context ?? { surface: 'general' as const }
        const contextKey = getProfileCopilotContextKey(effectiveContext)
        const createdAt = new Date().toISOString()
        const optimisticUserMessage: ProfileCopilotMessage = {
          id: `profile_copilot_user_optimistic_${contextKey}_${Date.now()}`,
          role: 'user',
          content,
          context: effectiveContext,
          patchGroups: [],
          createdAt,
        }

        setOptimisticProfileCopilotMessages((current) => [...current, optimisticUserMessage])
        setProfileCopilotBusy(true)
        setProfileCopilotPendingContextKey(contextKey)
        setActionState((current) =>
          current.message === null ? current : { ...current, message: null },
        )

        try {
          await actions.sendProfileCopilotMessage(content, effectiveContext)

          if (requestToken !== profileCopilotRequestTokenRef.current) {
            return
          }

          setOptimisticProfileCopilotMessages([])
          setProfileCopilotBusy(false)
          setProfileCopilotPendingContextKey(null)
          setActionState({
            message: 'Profile Copilot replied.',
          })
        } catch (error) {
          if (requestToken !== profileCopilotRequestTokenRef.current) {
            return
          }

          const message =
            error instanceof Error
              ? error.message
              : 'The requested Job Finder action failed.'
          setOptimisticProfileCopilotMessages([])
          setProfileCopilotBusy(false)
          setProfileCopilotPendingContextKey(null)
          setActionState({ message })
        }
      })(),
    onUndoProfileRevision: (revisionId: string) =>
      void runAction(
        () => actions.undoProfileRevision(revisionId),
        () => undefined,
        'Last assistant change was undone.',
        { scope: jobFinderPendingActions.profileMutation() },
      ),
    onSendResumeAssistantMessage: (jobId: string, content: string) =>
      void (async () => {
        const requestJobId = jobId
        const requestToken = ++resumeAssistantRequestTokenRef.current
        const createdAt = new Date().toISOString()
        const optimisticUserMessage: ResumeAssistantMessage = {
          id: `resume_message_user_optimistic_${jobId}_${requestToken}`,
          jobId,
          role: 'user',
          content,
          patches: [],
          createdAt,
        }
        const optimisticAssistantMessage: ResumeAssistantMessage = {
          id: `resume_message_assistant_pending_${jobId}_${requestToken}`,
          jobId,
          role: 'assistant',
          content: 'Updating your draft...',
          patches: [],
          createdAt,
        }
        const scope = jobFinderPendingActions.resumeJob(jobId)

        setPendingActionState((current) => incrementPendingScope(current, scope))
        setResumeAssistantPending(true)
        setResumeAssistantMessages((current) => [
          ...current,
          optimisticUserMessage,
          optimisticAssistantMessage,
        ])
        setActionState({
          message: 'Assistant is updating your draft...',
        })

        try {
          const messages = await actions.sendResumeAssistantMessage(jobId, content)
          const assistantReply = [...messages]
            .reverse()
            .find((message) => message.role === 'assistant')
          const appliedCount = assistantReply?.patches.length ?? 0

          if (
            !isCurrentResumeWorkspaceJob(requestJobId) ||
            requestToken !== resumeAssistantRequestTokenRef.current
          ) {
            return
          }

          setResumeAssistantMessages(messages)
          setResumeAssistantPending(false)

          let refreshMessage: string | null = null

          try {
            const nextWorkspace = await actions.getResumeWorkspace(jobId)
            if (isCurrentResumeWorkspaceJob(nextWorkspace.job.id)) {
              setResumeWorkspace(nextWorkspace)
            }
          } catch (error) {
            refreshMessage =
              error instanceof Error
                ? error.message
                : 'The editor could not refresh automatically.'
          }

          if (isCurrentResumeAssistantRequest(requestJobId, requestToken)) {
            setActionState({
              message:
                refreshMessage !== null
                  ? `Assistant finished${appliedCount > 0 ? ` and applied ${appliedCount} change${appliedCount === 1 ? '' : 's'}` : ''}, but the editor could not refresh automatically. ${refreshMessage}`
                  : appliedCount > 0
                    ? `Assistant finished and applied ${appliedCount} change${appliedCount === 1 ? '' : 's'}.`
                    : 'Assistant finished and shared a reply with no direct resume changes.',
            })
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'The requested resume action failed.'
          if (isCurrentResumeAssistantRequest(requestJobId, requestToken)) {
            setResumeAssistantPending(false)
            setResumeAssistantMessages((current) =>
              current.filter(
                (entry) =>
                  entry.id !== optimisticUserMessage.id &&
                  entry.id !== optimisticAssistantMessage.id,
              ),
            )
            setActionState({ message })
          }
        } finally {
          setPendingActionState((current) => decrementPendingScope(current, scope))
        }
      })(),
  }
}
