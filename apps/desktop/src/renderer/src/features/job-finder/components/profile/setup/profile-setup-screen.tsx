import { useEffect, useMemo } from "react";
import {
  type CandidateProfile,
  type JobFinderWorkspaceSnapshot,
  type JobSearchPreferences,
  type ProfileCopilotContext,
  type ProfileSetupReviewActionOptions,
  type ProfileSetupState,
  type ProfileSetupStep,
  type ResumeImportFieldCandidateSummary,
  type ResumeImportProgressEvent,
  isRunnableJobDiscoveryTarget,
} from "@unemployed/contracts";
import { LockedScreenLayout } from "../../locked-screen-layout";
import { PageHeader } from "../../page-header";
import { ProfileCopilotRail } from "../profile-copilot-rail";
import { COPILOT_BOTTOM_OFFSET } from "../profile-copilot-rail-layout";
import { buildCopilotStarterQuestion } from "../profile-copilot-prompts";
import { ProfileSetupStepEditor } from "./profile-setup-step-editor";
import {
  buildSetupCopilotPlaceholder,
  isBlockingPendingReviewItem,
  isOptionalPendingReviewItem,
  buildStepEditorContext,
} from "./profile-setup-screen-helpers";
import {
  ProfileSetupPathCard,
  ProfileSetupReviewQueueCard,
  ProfileSetupSummaryCards,
} from "./profile-setup-screen-sections";
import { useProfileSetupForms } from "./profile-setup-screen-hooks";
import {
  getProfileSetupScrollBehavior,
  useProfileSetupScreenActions,
} from "./profile-setup-screen-actions";
import {
  PROFILE_SETUP_STEP_HEADING_ID,
  focusProfileSetupStepHeading,
} from "./profile-setup-step-focus";
import { formatProfileSetupStepLabel } from "./profile-setup-steps";

const setupScreenColumnsClassName =
  "grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.95fr)]";
const setupScreenWideEditorClassName = "grid gap-6 xl:grid-cols-1";
const pristineSetupSummaryClassName = "mx-auto grid w-full max-w-5xl gap-6";
const setupScreenReviewRailClassName =
  "flex h-full min-h-0 flex-col gap-6 pb-24 xl:pb-28";
const setupScreenInlineReviewClassName = "grid gap-6 pb-24 xl:pb-28";
const unsavedSetupCopilotMessage =
  "Save this step before asking Profile Copilot to edit it so your current setup draft does not get overwritten.";
const unsavedSetupCopilotActionsMessage =
  "Save this step before applying, rejecting, or undoing copilot changes so your current setup draft stays intact.";
const unsavedSetupReviewActionsMessage =
  "Save this step before confirming, dismissing, or clearing review items so your current setup draft stays intact.";

export function getProfileSetupLayoutClassNames(input: {
  hasPendingReviewItems: boolean;
  isPristineSetup: boolean;
}) {
  const hasReviewRail = !input.isPristineSetup && input.hasPendingReviewItems;

  return {
    content: hasReviewRail
      ? setupScreenColumnsClassName
      : setupScreenWideEditorClassName,
    reviewRail: hasReviewRail
      ? setupScreenReviewRailClassName
      : setupScreenInlineReviewClassName,
    summary: input.isPristineSetup
      ? pristineSetupSummaryClassName
      : setupScreenColumnsClassName,
  };
}

export function ProfileSetupScreen(props: {
  actionState: { message: string | null };
  importResumeGuardMessage: string | null;
  isImportResumePending: boolean;
  isProfileSetupPending: boolean;
  isReviewItemPending: (reviewItemId: string) => boolean;
  profileCopilotBusy: boolean;
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[];
  resumeImportProgress: ResumeImportProgressEvent | null;
  onApplyProfileCopilotPatchGroup: (patchGroupId: string) => void;
  onApplyProfileSetupReviewAction: (
    reviewItemId: string,
    action: "confirm" | "dismiss" | "clear_value",
    options?: ProfileSetupReviewActionOptions,
  ) => void;
  onContinueToProfile: () => void;
  onImportResume: () => void;
  onProfileSurfaceDirtyChange: (dirty: boolean) => void;
  profileCopilotPendingContextKey: string | null;
  onRejectProfileCopilotPatchGroup: (patchGroupId: string) => void;
  onResumeSetup: (step: ProfileSetupStep) => void;
  onSaveSetupStep: (
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
    nextStep: ProfileSetupStep,
    options?: {
      message?: string;
      openProfile?: boolean;
      stayOnCurrentStep?: boolean;
    },
  ) => void;
  onSendProfileCopilotMessage: (
    content: string,
    context?: ProfileCopilotContext,
  ) => void;
  onUndoProfileRevision: (revisionId: string) => void;
  profile: CandidateProfile;
  profileCopilotMessages: readonly JobFinderWorkspaceSnapshot["profileCopilotMessages"][number][];
  profileRevisions: readonly JobFinderWorkspaceSnapshot["profileRevisions"][number][];
  profileSetupState: ProfileSetupState;
  searchPreferences: JobSearchPreferences;
}) {
  const {
    actionState,
    importResumeGuardMessage,
    isImportResumePending,
    isProfileSetupPending,
    isReviewItemPending,
    profileCopilotBusy,
    latestResumeImportReviewCandidates,
    resumeImportProgress,
    onApplyProfileCopilotPatchGroup,
    onApplyProfileSetupReviewAction,
    onContinueToProfile,
    onImportResume,
    onProfileSurfaceDirtyChange,
    profileCopilotPendingContextKey,
    onRejectProfileCopilotPatchGroup,
    onResumeSetup,
    onSaveSetupStep,
    onSendProfileCopilotMessage,
    onUndoProfileRevision,
    profile,
    profileCopilotMessages,
    profileRevisions,
    profileSetupState,
    searchPreferences,
  } = props;

  const {
    backgroundArrays,
    draftAwareReviewItems,
    draftProfile,
    draftSearchPreferences,
    experienceArray,
    hasUserDraftChanges,
    hasUnsavedChanges,
    preferencesForm,
    profileForm,
    setValidationMessage,
    validationMessage,
  } = useProfileSetupForms({
    latestResumeImportReviewCandidates,
    profile,
    profileSetupState,
    searchPreferences,
  });

  useEffect(() => {
    onProfileSurfaceDirtyChange(hasUserDraftChanges);
    return () => onProfileSurfaceDirtyChange(false);
  }, [hasUserDraftChanges, onProfileSurfaceDirtyChange]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      focusProfileSetupStepHeading();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [profileSetupState.currentStep]);

  const setupCopilotContext = buildStepEditorContext(
    profileSetupState.currentStep,
  );
  const {
    currentStepReviewItems,
    focusedReviewItemId,
    focusedReviewRequestKey,
    goToStep,
    handleEditReviewItem,
    handleSaveCurrentStep,
    handleSaveStep,
    openProfile,
  } = useProfileSetupScreenActions({
    draftAwareReviewItems,
    hasUnsavedChanges,
    onContinueToProfile,
    onResumeSetup,
    onSaveSetupStep,
    preferencesFormValues: () => preferencesForm.getValues(),
    profile,
    profileFormValues: () => profileForm.getValues(),
    profileSetupCurrentStep: profileSetupState.currentStep,
    searchPreferences,
    setValidationMessage,
  });

  const pendingCurrentStepReviewItems = currentStepReviewItems.filter(
    (item) => item.status === "pending",
  );
  const blockingCurrentStepReviewItems = pendingCurrentStepReviewItems.filter(
    isBlockingPendingReviewItem,
  );
  const optionalCurrentStepReviewItems = pendingCurrentStepReviewItems.filter(
    isOptionalPendingReviewItem,
  );
  const starterQuestion = buildCopilotStarterQuestion(
    pendingCurrentStepReviewItems,
  );
  const hasImportedResume = profile.baseResume.extractionStatus === "ready";
  const isPristineSetup =
    profileSetupState.status === "not_started" && !hasImportedResume;
  const profileSetupLayoutClassNames = getProfileSetupLayoutClassNames({
    hasPendingReviewItems: pendingCurrentStepReviewItems.length > 0,
    isPristineSetup,
  });
  const setupMutationPending = isProfileSetupPending || isImportResumePending;
  const setupActionsDisabledReason = isImportResumePending
    ? "Resume import is updating this workspace. Wait for it to finish before editing or reviewing profile details."
    : null;

  function resumeCurrentStep() {
    goToStep(profileSetupState.currentStep);

    window.requestAnimationFrame(() => {
      const target = document.getElementById(
        blockingCurrentStepReviewItems.length > 0
          ? "profile-setup-review-queue"
          : "profile-setup-step-editor",
      );
      target?.scrollIntoView({
        behavior: getProfileSetupScrollBehavior(),
        block: "start",
      });
      target?.focus({ preventScroll: true });
    });
  }

  const readinessCards = useMemo(() => {
    const hasSearchTarget =
      draftSearchPreferences.targetRoles.length > 0 ||
      draftSearchPreferences.jobFamilies.length > 0;
    const hasDiscoverySource = draftSearchPreferences.discovery.targets.some(
      isRunnableJobDiscoveryTarget,
    );

    return [
      {
        label: "Discovery",
        value:
          !hasImportedResume && profileSetupState.status === "not_started"
            ? "Not provided yet"
            : hasSearchTarget && hasDiscoverySource
              ? "Ready to search"
              : !hasSearchTarget
                ? "Needs a target role"
                : "Needs a job source",
      },
      {
        label: "Resume quality",
        value:
          !hasImportedResume && profileSetupState.status === "not_started"
            ? "Not analyzed yet"
            : draftProfile.experiences.length > 0
              ? "Structured background available"
              : "Needs stronger work history",
      },
      {
        label: "Apply readiness",
        value:
          !hasImportedResume && profileSetupState.status === "not_started"
            ? "Not provided yet"
            : draftProfile.email?.trim() || draftProfile.phone?.trim()
              ? "Contact path ready"
              : "Missing contact details",
      },
    ];
  }, [
    draftProfile.email,
    draftProfile.experiences.length,
    draftProfile.phone,
    draftSearchPreferences.discovery.targets,
    draftSearchPreferences.jobFamilies.length,
    draftSearchPreferences.targetRoles.length,
    hasImportedResume,
    profileSetupState.status,
  ]);

  return (
    <LockedScreenLayout
      contentClassName="pb-8 xl:pb-10"
      lockTopContent={!isPristineSetup}
      topClassName="grid gap-6 pb-8 pt-8"
      topContent={
        <>
          <PageHeader
            eyebrow="Profile setup"
            title="Guided setup"
            description="Import a resume, resolve the important missing details, and keep every change in sync with your full profile."
          />

          <div
            className={profileSetupLayoutClassNames.summary}
            data-profile-setup-summary-layout={
              isPristineSetup ? "pristine" : "overview"
            }
          >
            <ProfileSetupSummaryCards
              actionMessage={actionState.message}
              importDisabledReason={importResumeGuardMessage}
              isImportResumePending={isImportResumePending}
              isProfileSetupPending={isProfileSetupPending}
              resumeImportProgress={resumeImportProgress}
              hasImportedResume={hasImportedResume}
              onImportResume={onImportResume}
              onOpenProfile={openProfile}
              onResumeCurrentStep={resumeCurrentStep}
              onStartManually={() => goToStep("essentials")}
              profileSetupState={profileSetupState}
              readinessCards={readinessCards}
              reviewItemCount={blockingCurrentStepReviewItems.length}
              optionalReviewItemCount={optionalCurrentStepReviewItems.length}
            />
          </div>
        </>
      }
    >
      {isPristineSetup ? null : (
        <div
          className={`${profileSetupLayoutClassNames.content} min-h-0`}
          data-profile-setup-content-layout={
            pendingCurrentStepReviewItems.length > 0
              ? "review-rail"
              : "wide-editor"
          }
        >
          <div
            className="grid gap-6 min-h-0"
            id="profile-setup-step-editor"
            tabIndex={-1}
          >
            <h2
              className="sr-only"
              id={PROFILE_SETUP_STEP_HEADING_ID}
              tabIndex={-1}
            >
              {formatProfileSetupStepLabel(profileSetupState.currentStep)} setup
              step
            </h2>
            <ProfileSetupPathCard
              currentStep={profileSetupState.currentStep}
              disabled={setupMutationPending}
              onGoToStep={goToStep}
              profileSetupState={profileSetupState}
            />

            <fieldset
              className="m-0 min-w-0 border-0 p-0 disabled:opacity-80"
              disabled={setupMutationPending}
            >
              <ProfileSetupStepEditor
                backgroundArrays={backgroundArrays}
                currentStepReviewItems={currentStepReviewItems}
                currentStep={profileSetupState.currentStep}
                experienceArray={experienceArray}
                draftProfile={draftProfile}
                draftSearchPreferences={draftSearchPreferences}
                focusedReviewItemId={focusedReviewItemId}
                focusedReviewRequestKey={focusedReviewRequestKey}
                hasUnsavedChanges={hasUnsavedChanges}
                importDisabledReason={importResumeGuardMessage ?? null}
                isImportResumePending={isImportResumePending}
                isProfileSetupPending={setupMutationPending}
                latestResumeImportReviewCandidates={
                  latestResumeImportReviewCandidates
                }
                resumeImportProgress={resumeImportProgress}
                onContinueToProfile={onContinueToProfile}
                onImportResume={onImportResume}
                onSaveCurrentStep={handleSaveCurrentStep}
                onSaveAndFinish={() =>
                  handleSaveStep("ready_check", { openProfile: true })
                }
                onSaveAndGoToStep={(step) => handleSaveStep(step)}
                profile={profile}
                profileForm={profileForm}
                profileSetupReviewItems={draftAwareReviewItems}
                preferencesForm={preferencesForm}
                searchPreferences={searchPreferences}
                validationMessage={validationMessage}
              />
            </fieldset>
          </div>

          <div className={profileSetupLayoutClassNames.reviewRail}>
            <ProfileSetupReviewQueueCard
              actionsDisabledReason={
                setupActionsDisabledReason ??
                (hasUserDraftChanges ? unsavedSetupReviewActionsMessage : null)
              }
              isReviewItemPending={isReviewItemPending}
              items={currentStepReviewItems}
              latestResumeImportReviewCandidates={
                latestResumeImportReviewCandidates
              }
              onApplyReviewAction={onApplyProfileSetupReviewAction}
              onEditReviewItem={handleEditReviewItem}
            />

            <ProfileCopilotRail
              busy={profileCopilotBusy}
              actionsDisabledReason={
                setupActionsDisabledReason ??
                (hasUserDraftChanges ? unsavedSetupCopilotActionsMessage : null)
              }
              context={setupCopilotContext}
              emptyStateDescription="Ask why a field matters or request a specific change for this step. You review every proposal before anything is applied."
              emptyStateTitle="No requests yet"
              messages={profileCopilotMessages.filter((message) => {
                if (message.context.surface !== "setup") {
                  return false;
                }

                return message.context.step === profileSetupState.currentStep;
              })}
              onApplyPatchGroup={onApplyProfileCopilotPatchGroup}
              onRejectPatchGroup={onRejectProfileCopilotPatchGroup}
              onSendMessage={onSendProfileCopilotMessage}
              onUndoRevision={onUndoProfileRevision}
              pendingContextKey={profileCopilotPendingContextKey}
              placeholder={buildSetupCopilotPlaceholder(
                profileSetupState.currentStep,
              )}
              revisions={profileRevisions}
              sendDisabledReason={
                setupActionsDisabledReason ??
                (hasUserDraftChanges ? unsavedSetupCopilotMessage : null)
              }
              starterQuestion={starterQuestion}
              title="Profile Copilot"
              minBottomOffset={COPILOT_BOTTOM_OFFSET}
            />
          </div>
        </div>
      )}
    </LockedScreenLayout>
  );
}
