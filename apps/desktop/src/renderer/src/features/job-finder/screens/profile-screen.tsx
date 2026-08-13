import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  CandidateProfile,
  EditableSourceInstructionArtifact,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupState,
  ResumeImportFieldCandidateSummary,
  ResumeImportProgressEvent,
  ResumeImportRun,
  ResumeTimelineRepairAction,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { buildComparableValueFingerprint } from "../lib/profile-editor-review-candidates";
import { LockedScreenLayout } from "../components/locked-screen-layout";
import { ProfileActiveSectionContent } from "../components/profile/profile-active-section-content";
import { ProfileCopilotRail } from "../components/profile/profile-copilot-rail";
import {
  PROFILE_SECTION_SCROLL_AREA_ID,
  focusProfileDeepLink,
  resetProfileSectionScroll,
  type ProfileDeepLinkFocus,
} from "../components/profile/profile-deep-link-focus";
import { COPILOT_BOTTOM_OFFSET } from "../components/profile/profile-copilot-rail-layout";
import { buildProfileSectionStarterQuestion } from "../components/profile/profile-copilot-prompts";
import { ProfileResumePanel } from "../components/profile/profile-resume-panel";
import {
  focusProfileImportSuggestion,
  getProfileImportSuggestionDestination,
} from "../components/profile/profile-import-suggestion-navigation";
import { ProfileSaveFooter } from "../components/profile/profile-save-footer";
import { ProfileSectionTabs } from "../components/profile/profile-section-tabs";
import { PageHeader } from "../components/page-header";
import { JOB_FINDER_ROUTE_HREFS } from "../lib/job-finder-route-hrefs";
import {
  buildProfilePayload,
  buildSearchPreferencesPayload,
} from "../lib/profile-editor";
import type { ProfileSection } from "../lib/profile-screen-progress";
import { useProfileScreenForms } from "./profile-screen-hooks";

const unsavedProfileCopilotMessage =
  "Save this page before asking Profile Copilot to edit it so your current profile draft does not get overwritten.";
const unsavedProfileCopilotActionsMessage =
  "Save this page before applying, rejecting, or undoing copilot changes so your current profile draft stays intact.";
const unsavedProfileSourceActionMessage =
  "Save your current profile and source setup before running source checks or searches so those actions use the latest saved configuration.";
const unsavedProfileSourceSignInMessage =
  "Save this source before opening a sign-in session so the browser uses the latest saved source entry.";

function parseProfileSection(value: string | null): ProfileSection | null {
  switch (value) {
    case "basics":
    case "experience":
    case "background":
    case "preferences":
    case "sources":
      return value;
    default:
      return null;
  }
}

type ProfileScreenPendingActions = {
  analyzeProfile: boolean;
  browserSession: (targetId: string) => boolean;
  importResume: boolean;
  profileCopilotBusy: boolean;
  profileMutation: boolean;
  profileSetup: boolean;
  sourceDebug: (targetId: string) => boolean;
  sourceInstruction: (targetId: string) => boolean;
  sourceInstructionVerify: (instructionId: string) => boolean;
  targetDiscovery: (targetId: string) => boolean;
};

export function ProfileScreen(props: {
  actionState: { message: string | null };
  importResumeGuardMessage: string | null;
  pendingActions: ProfileScreenPendingActions;
  onApplyProfileCopilotPatchGroup: (patchGroupId: string) => void;
  onAnalyzeProfileFromResume: () => void;
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>;
  onImportResume: () => void;
  onApplyResumeTimelineRepairAction: (
    runId: string,
    proposalId: string,
    action: ResumeTimelineRepairAction,
  ) => Promise<void>;
  onOpenBrowserSessionForTarget: (targetId: string) => void;
  onProfileSurfaceDirtyChange: (dirty: boolean) => void;
  profileCopilotPendingContextKey: string | null;
  onRejectProfileCopilotPatchGroup: (patchGroupId: string) => void;
  onResumeProfileSetup: (
    step?:
      | "import"
      | "essentials"
      | "background"
      | "targeting"
      | "narrative"
      | "answers"
      | "ready_check",
  ) => void;
  onRunDiscoveryForTarget?: (targetId: string) => void;
  onRunSourceDebug: (targetId: string) => void;
  onSaveSourceInstructionArtifact: (
    targetId: string,
    artifact: EditableSourceInstructionArtifact,
  ) => void;
  onSaveAll: (
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
  ) => void;
  onSendProfileCopilotMessage: (
    content: string,
    context?: ProfileCopilotContext,
  ) => void;
  onUndoProfileRevision: (revisionId: string) => void;
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void;
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[];
  latestResumeImportRun: ResumeImportRun | null;
  resumeImportProgress: ResumeImportProgressEvent | null;
  profile: CandidateProfile;
  profileCopilotMessages: readonly JobFinderWorkspaceSnapshot["profileCopilotMessages"][number][];
  profileRevisions: readonly JobFinderWorkspaceSnapshot["profileRevisions"][number][];
  profileSetupState: ProfileSetupState;
  recentSourceDebugRuns: readonly SourceDebugRunRecord[];
  searchPreferences: JobSearchPreferences;
  sourceAccessPrompts: JobFinderWorkspaceSnapshot["sourceAccessPrompts"];
  sourceInstructionArtifacts: readonly SourceInstructionArtifact[];
}) {
  const {
    importResumeGuardMessage,
    pendingActions,
    onApplyProfileCopilotPatchGroup,
    onAnalyzeProfileFromResume,
    onGetSourceDebugRunDetails,
    onImportResume,
    onApplyResumeTimelineRepairAction,
    onOpenBrowserSessionForTarget,
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
    resumeImportProgress,
    profile,
    profileCopilotMessages,
    profileRevisions,
    profileSetupState,
    recentSourceDebugRuns,
    searchPreferences,
    sourceAccessPrompts,
    sourceInstructionArtifacts,
  } = props;

  const [searchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const requestedFocus = searchParams.get("focus");
  const [activeSection, setActiveSection] = useState<ProfileSection>(
    parseProfileSection(requestedSection) ?? "basics",
  );
  const pendingImportSuggestionRef =
    useRef<ResumeImportFieldCandidateSummary | null>(null);
  const [importSuggestionFocusRequest, setImportSuggestionFocusRequest] =
    useState(0);
  const {
    backgroundArrays,
    draftSearchPreferencesResult,
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
  });

  useEffect(() => {
    onProfileSurfaceDirtyChange(hasUserDraftChanges);
    return () => onProfileSurfaceDirtyChange(false);
  }, [hasUserDraftChanges, onProfileSurfaceDirtyChange]);

  useEffect(() => {
    resetProfileSectionScroll();
  }, [activeSection]);

  useEffect(() => {
    const candidate = pendingImportSuggestionRef.current;
    if (!candidate) {
      return;
    }

    let focusFrame = 0;
    let attemptsRemaining = 12;
    const focusWhenReady = () => {
      if (focusProfileImportSuggestion(candidate)) {
        pendingImportSuggestionRef.current = null;
        return;
      }

      if (attemptsRemaining <= 0) {
        return;
      }

      attemptsRemaining -= 1;
      focusFrame = window.requestAnimationFrame(focusWhenReady);
    };

    focusFrame = window.requestAnimationFrame(focusWhenReady);
    return () => window.cancelAnimationFrame(focusFrame);
  }, [activeSection, importSuggestionFocusRequest]);

  useEffect(() => {
    const parsedSection = parseProfileSection(requestedSection);
    if (!parsedSection) {
      return;
    }

    const requestedDeepLink =
      requestedFocus === "job-sources" || requestedFocus === "target-roles"
        ? (requestedFocus as ProfileDeepLinkFocus)
        : null;
    const destinationSection =
      requestedDeepLink === "job-sources"
        ? "sources"
        : requestedDeepLink === "target-roles"
          ? "preferences"
          : parsedSection;

    if (activeSection !== destinationSection) {
      setActiveSection(destinationSection);
      return;
    }

    if (!requestedDeepLink) {
      return;
    }

    let focusFrame = 0;
    let attemptsRemaining = 12;
    const focusWhenReady = () => {
      if (focusProfileDeepLink(requestedDeepLink) || attemptsRemaining <= 0) {
        return;
      }

      attemptsRemaining -= 1;
      focusFrame = window.requestAnimationFrame(focusWhenReady);
    };
    const renderFrame = window.requestAnimationFrame(focusWhenReady);

    return () => {
      window.cancelAnimationFrame(renderFrame);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [activeSection, requestedFocus, requestedSection]);

  const activeSectionPanelId = "profile-section-panel";
  const pendingSetupItems = profileSetupState.reviewItems.filter(
    (item) => item.status === "pending",
  );
  const resumeAnalysisPending =
    pendingActions.importResume || pendingActions.analyzeProfile;
  const profileCopilotContext: ProfileCopilotContext = {
    surface: "profile",
    section: activeSection === "sources" ? "preferences" : activeSection,
  };

  const visibleProfileCopilotMessages = profileCopilotMessages.filter(
    (message) => {
      if (message.context.surface !== "profile") {
        return false;
      }

      return message.context.section === profileCopilotContext.section;
    },
  );
  const starterQuestion = buildProfileSectionStarterQuestion(
    profileSetupState.reviewItems,
    activeSection === "sources" ? "preferences" : activeSection,
  );

  const savedTargetsById = new Map(
    searchPreferences.discovery.targets.map((target) => [target.id, target]),
  );
  const draftTargets = preferencesForm.watch("discoveryTargets");
  const hasUnsavedSearchPreferenceChanges =
    preferencesForm.formState.isDirty ||
    buildComparableValueFingerprint(searchPreferences) !==
      buildComparableValueFingerprint(
        draftSearchPreferencesResult.payload ?? searchPreferences,
      );

  function hasUnsavedSourceRowChanges(targetId: string) {
    const savedTarget = savedTargetsById.get(targetId);
    const draftTarget = draftTargets.find((target) => target.id === targetId);

    if (!savedTarget || !draftTarget) {
      return false;
    }

    return (
      buildComparableValueFingerprint(savedTarget) !==
      buildComparableValueFingerprint({ ...draftTarget })
    );
  }

  function handleSignInForTarget(targetId: string) {
    if (hasUnsavedSourceRowChanges(targetId)) {
      setValidationMessage(unsavedProfileSourceSignInMessage);
      return;
    }

    setValidationMessage(null);
    onOpenBrowserSessionForTarget(targetId);
  }

  function handleRunDiscoveryForTarget(targetId: string) {
    if (hasUnsavedSearchPreferenceChanges) {
      setValidationMessage(unsavedProfileSourceActionMessage);
      return;
    }

    setValidationMessage(null);
    onRunDiscoveryForTarget?.(targetId);
  }

  function handleRunSourceDebug(targetId: string) {
    if (hasUnsavedSearchPreferenceChanges) {
      setValidationMessage(unsavedProfileSourceActionMessage);
      return;
    }

    setValidationMessage(null);
    onRunSourceDebug(targetId);
  }

  function handleSaveAll() {
    const profileResult = buildProfilePayload(profile, profileForm.getValues());

    if (!profileResult.payload) {
      setValidationMessage(
        profileResult.validationMessage ?? "Profile data is invalid.",
      );
      return;
    }

    const preferencesResult = buildSearchPreferencesPayload(
      searchPreferences,
      preferencesForm.getValues(),
    );

    if (!preferencesResult.payload) {
      setValidationMessage(
        preferencesResult.validationMessage ??
          "Search preferences are invalid.",
      );
      return;
    }

    setValidationMessage(null);
    onSaveAll(profileResult.payload, preferencesResult.payload);
  }

  function handleReviewImportSuggestion(
    candidate: ResumeImportFieldCandidateSummary,
  ) {
    pendingImportSuggestionRef.current = candidate;
    setActiveSection(getProfileImportSuggestionDestination(candidate).section);
    setImportSuggestionFocusRequest((current) => current + 1);
  }

  return (
    <LockedScreenLayout
      contentClassName="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3 pb-2 xl:overflow-hidden"
      topClassName="grid gap-(--gap-section) pb-(--gap-section) pt-8"
      topContent={
        <>
          <PageHeader
            eyebrow="Profile"
            title="Your profile"
            description="Import your resume, confirm the essentials, and add optional details only when they help."
          />

          {profileSetupState.status !== "completed" ? (
            <div className="surface-card-tint flex flex-col gap-3 rounded-(--radius-panel) border border-border/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-1">
                <p className="text-(length:--text-tiny) uppercase tracking-[0.18em] text-muted-foreground">
                  Setup still in progress
                </p>
                <p className="text-sm text-foreground-soft">
                  {pendingSetupItems.length > 0
                    ? `${pendingSetupItems.length} setup item${pendingSetupItems.length === 1 ? "" : "s"} still need${pendingSetupItems.length === 1 ? "s" : ""} review. Continue from ${profileSetupState.currentStep.replace("_", " ")}.`
                    : `Continue setup from ${profileSetupState.currentStep.replace("_", " ")}.`}
                </p>
              </div>
              <Button
                pending={pendingActions.profileSetup}
                onClick={() =>
                  onResumeProfileSetup(profileSetupState.currentStep)
                }
                type="button"
                variant="secondary"
              >
                Resume guided setup
              </Button>
            </div>
          ) : (
            <div className="surface-card-tint flex flex-col gap-3 rounded-(--radius-panel) border border-border/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-1">
                <p className="text-(length:--text-tiny) uppercase tracking-[0.18em] text-muted-foreground">
                  Profile ready
                </p>
                <p className="text-sm text-foreground-soft">
                  Your saved profile is ready. Continue to Find jobs to run your
                  configured sources.
                </p>
              </div>
              <Button asChild>
                <a href={JOB_FINDER_ROUTE_HREFS.discovery}>
                  Continue to Find jobs
                </a>
              </Button>
            </div>
          )}

          <ProfileResumePanel
            importDisabledReason={importResumeGuardMessage}
            isProfileReady={profileSetupState.status === "completed"}
            isAnalyzeProfilePending={pendingActions.analyzeProfile}
            isImportResumePending={pendingActions.importResume}
            latestResumeImportReviewCandidates={
              latestResumeImportReviewCandidates
            }
            latestResumeImportRun={latestResumeImportRun}
            resumeImportProgress={resumeImportProgress}
            onAnalyzeProfileFromResume={onAnalyzeProfileFromResume}
            onApplyTimelineRepairAction={(proposalId, action) => {
              if (!latestResumeImportRun) {
                return Promise.reject(
                  new Error("The resume import run is no longer available."),
                );
              }
              return onApplyResumeTimelineRepairAction(
                latestResumeImportRun.id,
                proposalId,
                action,
              );
            }}
            onImportResume={onImportResume}
            onReviewImportSuggestion={handleReviewImportSuggestion}
            profile={overviewProfile}
          />

          {resumeAnalysisPending ? (
            <div
              className="rounded-(--radius-field) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-sm leading-6 text-(--info-text)"
              role="status"
            >
              Profile editing is paused while the résumé update finishes. This
              prevents the completed import from overwriting a draft created at
              the same time.
            </div>
          ) : null}
        </>
      }
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
            <div
              className="min-h-0 flex-1 overflow-y-auto"
              id={PROFILE_SECTION_SCROLL_AREA_ID}
            >
              <div
                aria-labelledby={`${activeSection}-tab`}
                className="relative z-0 p-4 sm:p-5"
                id={activeSectionPanelId}
                role="tabpanel"
              >
                <fieldset
                  className="m-0 min-w-0 border-0 p-0 disabled:opacity-80"
                  disabled={resumeAnalysisPending}
                >
                  <ProfileActiveSectionContent
                    activeSection={activeSection}
                    backgroundArrays={backgroundArrays}
                    experienceArray={experienceArray}
                    isBrowserSessionPending={pendingActions.browserSession}
                    isProfileMutationPending={
                      pendingActions.profileMutation || resumeAnalysisPending
                    }
                    isSourceDebugPending={pendingActions.sourceDebug}
                    isSourceInstructionPending={
                      pendingActions.sourceInstruction
                    }
                    isSourceInstructionVerifyPending={
                      pendingActions.sourceInstructionVerify
                    }
                    isTargetDiscoveryPending={pendingActions.targetDiscovery}
                    onGetSourceDebugRunDetails={onGetSourceDebugRunDetails}
                    onOpenBrowserSessionForTarget={handleSignInForTarget}
                    {...(onRunDiscoveryForTarget
                      ? { onRunDiscoveryForTarget: handleRunDiscoveryForTarget }
                      : {})}
                    onRunSourceDebug={handleRunSourceDebug}
                    onSaveSourceInstructionArtifact={
                      onSaveSourceInstructionArtifact
                    }
                    onVerifySourceInstructions={onVerifySourceInstructions}
                    preferencesForm={preferencesForm}
                    profileForm={profileForm}
                    recentSourceDebugRuns={recentSourceDebugRuns}
                    sourceAccessPrompts={sourceAccessPrompts}
                    sourceInstructionArtifacts={sourceInstructionArtifacts}
                  />
                </fieldset>
              </div>
            </div>

            <ProfileSaveFooter
              actionMessage={props.actionState.message}
              hasUnsavedChanges={hasUnsavedChanges}
              isSavePending={
                pendingActions.profileMutation || resumeAnalysisPending
              }
              onSave={handleSaveAll}
              validationMessage={validationMessage}
            />
          </div>
        </div>
      </section>
      {activeSection !== "sources" ? (
        <ProfileCopilotRail
          busy={pendingActions.profileCopilotBusy}
          actionsDisabledReason={
            hasUserDraftChanges ? unsavedProfileCopilotActionsMessage : null
          }
          context={profileCopilotContext}
          emptyStateDescription="Ask for a tighter headline, stronger summary, or another specific change. You review every proposal before anything is applied."
          emptyStateTitle="No requests yet"
          messages={visibleProfileCopilotMessages}
          onApplyPatchGroup={onApplyProfileCopilotPatchGroup}
          onRejectPatchGroup={onRejectProfileCopilotPatchGroup}
          onSendMessage={onSendProfileCopilotMessage}
          onUndoRevision={onUndoProfileRevision}
          pendingContextKey={profileCopilotPendingContextKey}
          placeholder={
            'Example: update my headline to "Principal systems designer focused on workflow platforms"'
          }
          revisions={profileRevisions}
          sendDisabledReason={
            hasUserDraftChanges ? unsavedProfileCopilotMessage : null
          }
          starterQuestion={starterQuestion}
          minBottomOffset={COPILOT_BOTTOM_OFFSET}
        />
      ) : null}
    </LockedScreenLayout>
  );
}
