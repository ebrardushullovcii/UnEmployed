import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  CandidateProfile,
  DiscoveryActivityEvent,
  JobFinderResumeWorkspace,
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
import { getProfileCopilotContextKey } from '@renderer/features/job-finder/lib/profile-copilot-context'
import { buildSourceDebugOutcomeMessage } from './job-finder-page-routes'

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

export function createActionRunners(args: {
  setActionState: Dispatch<SetStateAction<ActionState>>
}) {
  const { setActionState } = args

  const runAction = async <TResult,>(
    action: () => Promise<TResult>,
    onSuccess: (result: TResult) => void | Promise<void>,
    successMessage: string | null | ((result: TResult) => string | null),
  ) => {
    try {
      setActionState({ busy: true, message: null })
      const result = await action()
      const resolvedSuccessMessage =
        typeof successMessage === 'function'
          ? successMessage(result)
          : successMessage

      try {
        await onSuccess(result)
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : 'The workspace view could not refresh automatically.'
        setActionState({
          busy: false,
          message: `Action completed, but the current view could not refresh automatically. ${detail}`,
        })
        return
      }

      setActionState({
        busy: false,
        message: resolvedSuccessMessage,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The requested Job Finder action failed.'
      setActionState({ busy: false, message })
    }
  }

  const runResumeWorkspaceAction = async <TResult,>(
    action: () => Promise<TResult>,
    onSuccess: (result: TResult) => void | Promise<void>,
    successMessage: string | null,
  ) => {
    try {
      setActionState({ busy: true, message: null })
      const result = await action()

      try {
        await onSuccess(result)
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : 'The resume editor could not refresh automatically.'
        setActionState({
          message: `Resume action succeeded, but the editor could not refresh automatically. ${detail}`,
          busy: false,
        })
        return
      }

      setActionState({ busy: false, message: successMessage })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The requested resume action failed.'
      setActionState({ busy: false, message })
    }
  }

  return { runAction, runResumeWorkspaceAction }
}

export function createPrimaryPageActions(
  args: BaseActionArgs & {
    runAction: <TResult>(
      action: () => Promise<TResult>,
      onSuccess: (result: TResult) => void | Promise<void>,
      successMessage: string | null | ((result: TResult) => string | null),
    ) => Promise<void>
    runResumeWorkspaceAction: <TResult>(
      action: () => Promise<TResult>,
      onSuccess: (result: TResult) => void | Promise<void>,
      successMessage: string | null,
    ) => Promise<void>
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
    setActionState,
    setLiveDiscoveryEvents,
    setOptimisticProfileCopilotMessages,
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
  return {
    onAnalyzeProfileFromResume: () => {
      if (!canImportResume) {
        setActionState({ busy: false, message: importResumeGuardMessage })
        return
      }

      void runAction(actions.analyzeProfileFromResume, () => undefined, null)
    },
    onApplyProfileCopilotPatchGroup: (patchGroupId: string) =>
      void runAction(
        () => actions.applyProfileCopilotPatchGroup(patchGroupId),
        () => undefined,
        'Profile change applied.',
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
      )
    },
    onCheckBrowserSession: () =>
      void runAction(
        actions.checkBrowserSession,
        () => undefined,
        'Browser status refreshed.',
      ),
    onDismissJob: (jobId: string) =>
      void runAction(
        () => actions.dismissDiscoveryJob(jobId),
        () => undefined,
        'Job dismissed.',
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
      ),
    onApproveResume: (jobId: string, exportId: string) =>
      void runResumeWorkspaceAction(
        () => actions.approveResume(jobId, exportId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'Resume approved for this job.',
      ),
    onImportResume: () => {
      if (!canImportResume) {
        setActionState({ busy: false, message: importResumeGuardMessage })
        return
      }

      void runAction(
        actions.importResume,
        () => undefined,
        'Resume imported from your device.',
      )
    },
    onOpenBrowserSession: () =>
      void runAction(
        actions.openBrowserSession,
        () => undefined,
        workspace.browserSession.status === 'ready'
          ? 'Browser refreshed.'
          : 'Browser opened and status refreshed.',
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
      )
    },
    onRejectProfileCopilotPatchGroup: (patchGroupId: string) =>
      void runAction(
        () => actions.rejectProfileCopilotPatchGroup(patchGroupId),
        () => undefined,
        'Profile change proposal dismissed.',
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
      ),
    onRegenerateResumeDraft: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.regenerateResumeDraft(jobId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'Draft refreshed.',
      ),
    onRegenerateResumeSection: (jobId: string, sectionId: string) =>
      void runResumeWorkspaceAction(
        () => actions.regenerateResumeSection(jobId, sectionId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'Section refreshed.',
      ),
    onRunAgentDiscovery: () => {
      setLiveDiscoveryEvents([])
      void runAction(
        () =>
          actions.runAgentDiscovery((event) => {
            setLiveDiscoveryEvents((current) => [...current, event])
          }),
        () => {
          setLiveDiscoveryEvents([])
        },
        'Search finished and results were saved on this device.',
      )
    },
    onRunDiscoveryForTarget: (targetId: string) => {
      setLiveDiscoveryEvents([])
      void runAction(
        () =>
          actions.runAgentDiscovery(
            (event) => {
              setLiveDiscoveryEvents((current) => [...current, event])
            },
            targetId,
          ),
        () => {
          setLiveDiscoveryEvents([])
        },
        () => `Search finished for this source and results were saved on this device.`,
      )
    },
    onRunSourceDebug: (targetId: string) => {
      const runId = sourceDebugRunIdRef.current + 1
      sourceDebugRunIdRef.current = runId
      setActionState({
        busy: true,
        message: 'Starting source debug and attaching the browser profile...',
      })
      void actions
        .runSourceDebug(targetId, (progressEvent) => {
          if (sourceDebugRunIdRef.current !== runId) {
            return
          }

          setActionState({
            busy: true,
            message: progressEvent.message,
          })
        })
        .then((nextWorkspace) => {
          if (sourceDebugRunIdRef.current !== runId) {
            return
          }

          sourceDebugRunIdRef.current = 0
          setActionState({
            busy: false,
            message: buildSourceDebugOutcomeMessage(nextWorkspace, targetId),
          })
        })
        .catch((error) => {
          if (sourceDebugRunIdRef.current !== runId) {
            return
          }

          sourceDebugRunIdRef.current = 0
          const message =
            error instanceof Error
              ? error.message
              : 'The requested Job Finder action failed.'
          setActionState({ busy: false, message })
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
      ),
    onSaveAll: (
      profile: CandidateProfile,
      searchPreferences: JobSearchPreferences,
    ) =>
      void runAction(
        () => actions.saveWorkspaceInputs(profile, searchPreferences),
        () => undefined,
        null,
      ),
    onSaveResumeDraft: (draft: ResumeDraft) =>
      void runResumeWorkspaceAction(
        () => actions.saveResumeDraft(draft),
        async () => {
          await refreshResumeWorkspace(draft.jobId)
        },
        'Draft saved.',
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
        )

        if (saveSucceeded && isCurrentResumeWorkspaceJob(jobId)) {
          next()
        }
      })(),
    onApplyResumePatch: (
      patch: ResumeDraftPatch,
      revisionReason?: string | null,
    ) =>
      void runResumeWorkspaceAction(
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
      ),
    onSaveProfile: (profile: CandidateProfile) =>
      void runAction(() => actions.saveProfile(profile), () => undefined, null),
    onExportResumePdf: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.exportResumePdf(jobId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'PDF exported for review.',
      ),
    onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
      void runAction(
        () => actions.saveSearchPreferences(searchPreferences),
        () => undefined,
        null,
      ),
    onClearResumeApproval: (jobId: string) =>
      void runResumeWorkspaceAction(
        () => actions.clearResumeApproval(jobId),
        async () => {
          await refreshResumeWorkspace(jobId)
        },
        'Approved PDF removed.',
      ),
    onSaveSettings: (settings: JobFinderSettings) =>
      void runAction(() => actions.saveSettings(settings), () => undefined, null),
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
          setActionState((current) => ({
            ...current,
            message: 'Profile Copilot replied.',
          }))
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
          setActionState((current) => ({ ...current, message }))
        }
      })(),
    onUndoProfileRevision: (revisionId: string) =>
      void runAction(
        () => actions.undoProfileRevision(revisionId),
        () => undefined,
        'Last assistant change was undone.',
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

        setResumeAssistantPending(true)
        setResumeAssistantMessages((current) => [
          ...current,
          optimisticUserMessage,
          optimisticAssistantMessage,
        ])
        setActionState({
          busy: true,
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
              busy: false,
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
            setActionState({ busy: false, message })
          }
        } finally {
          if (resumeAssistantRequestTokenRef.current === requestToken) {
            setActionState((current) =>
              current.busy ? { ...current, busy: false } : current,
            )
          }
        }
      })(),
  }
}
