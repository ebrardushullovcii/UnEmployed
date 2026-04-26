import { useEffect, useState } from 'react'
import type {
  CandidateProfile,
  EditableSourceInstructionArtifact,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupState,
  ResumeImportFieldCandidateSummary,
  ResumeImportRun,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact
} from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { LockedScreenLayout } from '../components/locked-screen-layout'
import { ProfileActiveSectionContent } from '../components/profile/profile-active-section-content'
import { ProfileCopilotRail } from '../components/profile/profile-copilot-rail'
import { buildProfileSectionStarterQuestion } from '../components/profile/profile-copilot-prompts'
import { ProfileResumePanel } from '../components/profile/profile-resume-panel'
import { ProfileSaveFooter } from '../components/profile/profile-save-footer'
import { ProfileSectionTabs } from '../components/profile/profile-section-tabs'
import { PageHeader } from '../components/page-header'
import {
  buildProfilePayload,
  buildSearchPreferencesPayload,
} from '../lib/profile-editor'
import type { ProfileSection } from '../lib/profile-screen-progress'
import { useProfileScreenForms } from './profile-screen-hooks'

const unsavedProfileCopilotMessage =
  'Save this page before asking Profile Copilot to edit it so your current profile draft does not get overwritten.'
const unsavedProfileCopilotActionsMessage =
  'Save this page before applying, rejecting, or undoing copilot changes so your current profile draft stays intact.'

export function ProfileScreen(props: {
  actionState: { message: string | null }
  importResumeGuardMessage: string | null
  isAnalyzeProfilePending: boolean
  isImportResumePending: boolean
  isProfileMutationPending: boolean
  isProfileSetupPending: boolean
  isSourceDebugPending: (targetId: string) => boolean
  isSourceInstructionPending: (targetId: string) => boolean
  isSourceInstructionVerifyPending: (instructionId: string) => boolean
  isTargetDiscoveryPending: (targetId: string) => boolean
  profileCopilotBusy: boolean
  onApplyProfileCopilotPatchGroup: (patchGroupId: string) => void
  onAnalyzeProfileFromResume: () => void
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onImportResume: () => void
  onProfileSurfaceDirtyChange: (dirty: boolean) => void
  profileCopilotPendingContextKey: string | null
  onRejectProfileCopilotPatchGroup: (patchGroupId: string) => void
  onResumeProfileSetup: (step?: 'import' | 'essentials' | 'background' | 'targeting' | 'narrative' | 'answers' | 'ready_check') => void
  onRunDiscoveryForTarget?: (targetId: string) => void
  onRunSourceDebug: (targetId: string) => void
  onSaveSourceInstructionArtifact: (targetId: string, artifact: EditableSourceInstructionArtifact) => void
  onSaveAll: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) => void
  onSendProfileCopilotMessage: (content: string, context?: ProfileCopilotContext) => void
  onUndoProfileRevision: (revisionId: string) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[]
  latestResumeImportRun: ResumeImportRun | null
  profile: CandidateProfile
  profileCopilotMessages: readonly JobFinderWorkspaceSnapshot['profileCopilotMessages'][number][]
  profileRevisions: readonly JobFinderWorkspaceSnapshot['profileRevisions'][number][]
  profileSetupState: ProfileSetupState
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  searchPreferences: JobSearchPreferences
  sourceInstructionArtifacts: readonly SourceInstructionArtifact[]
}) {
  const {
    importResumeGuardMessage,
    isAnalyzeProfilePending,
    isImportResumePending,
    isProfileMutationPending,
    isProfileSetupPending,
    isSourceDebugPending,
    isSourceInstructionPending,
    isSourceInstructionVerifyPending,
    isTargetDiscoveryPending,
    profileCopilotBusy,
    onApplyProfileCopilotPatchGroup,
    onAnalyzeProfileFromResume,
    onGetSourceDebugRunDetails,
    onImportResume,
    onProfileSurfaceDirtyChange,
    profileCopilotPendingContextKey,
    onRejectProfileCopilotPatchGroup,
    onResumeProfileSetup,
    onRunDiscoveryForTarget,
    onRunSourceDebug,
    onSaveSourceInstructionArtifact,
    onSaveAll,
    onSendProfileCopilotMessage,
    onUndoProfileRevision,
    onVerifySourceInstructions,
    latestResumeImportReviewCandidates,
    latestResumeImportRun,
    profile,
    profileCopilotMessages,
    profileRevisions,
    profileSetupState,
    recentSourceDebugRuns,
    searchPreferences,
    sourceInstructionArtifacts
  } = props

  const [activeSection, setActiveSection] = useState<ProfileSection>('basics')
  const {
    backgroundArrays,
    experienceArray,
    hasUnsavedChanges,
    hasUserDraftChanges,
    overviewProfile,
    preferencesForm,
    profileForm,
    sections,
    setValidationMessage,
    validationMessage,
  } = useProfileScreenForms({
    latestResumeImportReviewCandidates,
    profile,
    searchPreferences,
  })

  useEffect(() => {
    onProfileSurfaceDirtyChange(hasUserDraftChanges)
    return () => onProfileSurfaceDirtyChange(false)
  }, [hasUserDraftChanges, onProfileSurfaceDirtyChange])

  const activeSectionPanelId = 'profile-section-panel'
  const pendingSetupItems = profileSetupState.reviewItems.filter((item) => item.status === 'pending')
  const profileCopilotContext: ProfileCopilotContext = {
    surface: 'profile',
    section: activeSection === 'preferences' ? 'preferences' : activeSection,
  }

  const visibleProfileCopilotMessages = profileCopilotMessages.filter((message) => {
    if (message.context.surface !== 'profile') {
      return false
    }

    return message.context.section === profileCopilotContext.section
  })
  const starterQuestion = buildProfileSectionStarterQuestion(
    profileSetupState.reviewItems,
    activeSection,
  )

  function handleSaveAll() {
    const profileResult = buildProfilePayload(profile, profileForm.getValues())

    if (!profileResult.payload) {
      setValidationMessage(profileResult.validationMessage ?? 'Profile data is invalid.')
      return
    }

    const preferencesResult = buildSearchPreferencesPayload(searchPreferences, preferencesForm.getValues())

    if (!preferencesResult.payload) {
      setValidationMessage(preferencesResult.validationMessage ?? 'Search preferences are invalid.')
      return
    }

    setValidationMessage(null)
    onSaveAll(profileResult.payload, preferencesResult.payload)
  }

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="grid gap-(--gap-section) pb-(--gap-section) pt-8"
        topContent={(
          <>
            <PageHeader
              eyebrow="Profile"
              title="Your profile"
              description="Import your resume, lock in the essentials first, then fill in optional details only where they help your search and applications."
            />

          <ProfileResumePanel
            importDisabledReason={importResumeGuardMessage}
            isAnalyzeProfilePending={isAnalyzeProfilePending}
            isImportResumePending={isImportResumePending}
            latestResumeImportReviewCandidates={latestResumeImportReviewCandidates}
            latestResumeImportRun={latestResumeImportRun}
            onAnalyzeProfileFromResume={onAnalyzeProfileFromResume}
            onImportResume={onImportResume}
            profile={overviewProfile}
          />

          {profileSetupState.status !== 'completed' ? (
            <div className="surface-card-tint flex flex-col gap-3 rounded-(--radius-panel) border border-border/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-1">
                <p className="text-(length:--text-tiny) uppercase tracking-[0.18em] text-muted-foreground">Setup still in progress</p>
                <p className="text-sm text-foreground-soft">
                  {pendingSetupItems.length > 0
                    ? `${pendingSetupItems.length} setup review item${pendingSetupItems.length === 1 ? '' : 's'} ${pendingSetupItems.length === 1 ? 'is' : 'are'} still open. Resume setup from ${profileSetupState.currentStep.replace('_', ' ')}.`
                    : `Your guided setup is still resumable from ${profileSetupState.currentStep.replace('_', ' ')}.`}
                </p>
              </div>
              <Button
                disabled={isProfileSetupPending}
                onClick={() => onResumeProfileSetup(profileSetupState.currentStep)}
                type="button"
                variant="secondary"
              >
                Resume guided setup
              </Button>
            </div>
          ) : null}
        </>
      )}
    >
      <section className="grid min-h-124 min-w-0 gap-(--gap-content) xl:h-full xl:min-h-0">
        <div className="grid min-h-0 min-w-0 gap-(--gap-content) xl:grid-rows-[auto_minmax(0,1fr)]">
          <ProfileSectionTabs
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            panelId={activeSectionPanelId}
            sections={sections}
          />

          <div className="surface-panel-shell relative flex min-h-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border-active-soft)">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div aria-labelledby={`${activeSection}-tab`} className="relative z-0 p-4 sm:p-5" id={activeSectionPanelId} role="tabpanel">
                <ProfileActiveSectionContent
                  activeSection={activeSection}
                  backgroundArrays={backgroundArrays}
                  experienceArray={experienceArray}
                  isProfileMutationPending={isProfileMutationPending}
                  isSourceDebugPending={isSourceDebugPending}
                  isSourceInstructionPending={isSourceInstructionPending}
                  isSourceInstructionVerifyPending={isSourceInstructionVerifyPending}
                  isTargetDiscoveryPending={isTargetDiscoveryPending}
                  onGetSourceDebugRunDetails={onGetSourceDebugRunDetails}
                  {...(onRunDiscoveryForTarget ? { onRunDiscoveryForTarget } : {})}
                  onRunSourceDebug={onRunSourceDebug}
                  onSaveSourceInstructionArtifact={onSaveSourceInstructionArtifact}
                  onVerifySourceInstructions={onVerifySourceInstructions}
                  preferencesForm={preferencesForm}
                  profileForm={profileForm}
                  recentSourceDebugRuns={recentSourceDebugRuns}
                  sourceInstructionArtifacts={sourceInstructionArtifacts}
                />
              </div>
            </div>

            <ProfileSaveFooter
              actionMessage={props.actionState.message}
              hasUnsavedChanges={hasUnsavedChanges}
              isSavePending={isProfileMutationPending}
              onSave={handleSaveAll}
              validationMessage={validationMessage}
            />
          </div>
        </div>

      </section>
      <ProfileCopilotRail
        busy={profileCopilotBusy}
        actionsDisabledReason={hasUserDraftChanges ? unsavedProfileCopilotActionsMessage : null}
        context={profileCopilotContext}
        emptyStateDescription="Ask for a tighter headline, a stronger summary, or a structured profile edit for this section."
        emptyStateTitle="No profile copilot requests yet"
        messages={visibleProfileCopilotMessages}
        onApplyPatchGroup={onApplyProfileCopilotPatchGroup}
        onRejectPatchGroup={onRejectProfileCopilotPatchGroup}
        onSendMessage={onSendProfileCopilotMessage}
        onUndoRevision={onUndoProfileRevision}
        pendingContextKey={profileCopilotPendingContextKey}
        placeholder={'Example: update my headline to "Principal systems designer focused on workflow platforms"'}
        revisions={profileRevisions}
        sendDisabledReason={hasUserDraftChanges ? unsavedProfileCopilotMessage : null}
        starterQuestion={starterQuestion}
        minBottomOffset={96}
      />
    </LockedScreenLayout>
  )
}
