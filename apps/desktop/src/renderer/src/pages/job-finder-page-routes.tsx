import { useCallback, useState } from "react";
import { jobFinderPendingActions } from "./job-finder-pending-actions";
import { Button } from "@renderer/components/ui/button";
import { JobFinderRouteErrorBoundary } from "./job-finder-route-error-boundary";
import { ProfileSetupScreen } from "@renderer/features/job-finder/components/profile/setup/profile-setup-screen";
import { CampaignsScreen } from "@renderer/features/job-finder/screens/campaigns/campaigns-screen";
import { CompaniesScreen } from "@renderer/features/job-finder/screens/companies/companies-screen";
import { CompanyDetailScreen } from "@renderer/features/job-finder/screens/companies/company-detail-screen";
import { JobSearchHomeScreen } from "@renderer/features/job-finder/screens/job-search-home/job-search-home-screen";
import { ProfileScreen } from "@renderer/features/job-finder/screens/profile-screen";
import { ApplicationsScreen } from "@renderer/features/job-finder/screens/applications-screen";
import { ActionsScreen } from "@renderer/features/job-finder/screens/actions-screen";
import { OutcomeAnalyticsScreen } from "@renderer/features/job-finder/screens/analytics/outcome-analytics-screen";
import { ResumeStrategiesScreen } from "@renderer/features/job-finder/screens/resume-strategies/resume-strategies-screen";
import { DiscoveryScreen } from "@renderer/features/job-finder/screens/discovery-screen";
import { RapidReviewScreen } from "@renderer/features/job-finder/screens/rapid-review/rapid-review-screen";
import { ReviewQueueScreen } from "@renderer/features/job-finder/screens/review-queue-screen";
import { ResumeWorkspaceScreen } from "@renderer/features/job-finder/screens/review-queue/resume-workspace-screen";
import { SettingsScreen } from "@renderer/features/job-finder/screens/settings-screen";
import { SafeguardsScreen } from "@renderer/features/job-finder/screens/safeguards/safeguards-screen";
import { getDefaultProfileRoute } from "@renderer/features/job-finder/lib/job-finder-utils";
import {
  Navigate,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router-dom";
import type { JobFinderPageContext } from "./job-finder-page-context";
import type { JobFinderGlobalSearchEntry } from "@renderer/features/job-finder/lib/job-finder-global-search";
import type {
  CampaignRuleFunnelProjection,
  JobFinderWorkspaceSnapshot,
  JobSearchCampaign,
  RapidReviewDecisionLog,
  SavedJob,
  SaveCampaignRuleInput,
  SaveJobSearchCampaignInput,
  SetJobFinderActivityControlInput,
} from "@unemployed/contracts";
import { ApplicationCrmSettingsSchema } from "@unemployed/contracts";
import { countActiveSafeguardBlockers } from "@renderer/features/job-finder/lib/safeguards-blocker-count";

function useJobFinderPageContext() {
  return useOutletContext<JobFinderPageContext>();
}

export function selectRapidReviewScope(workspace: JobFinderWorkspaceSnapshot): {
  campaign: JobSearchCampaign | null;
  jobs: readonly SavedJob[];
  log: RapidReviewDecisionLog | null;
} {
  const campaign =
    workspace.campaigns.find(
      (entry) => entry.id === workspace.activeCampaignId,
    ) ?? null;
  const campaignJobIds = new Set(campaign?.jobIds ?? []);
  const jobs = workspace.discoveryJobs.filter((job) =>
    campaignJobIds.has(job.id),
  );
  const log =
    workspace.intelligence.rapidReviewLogs.find(
      (entry) => entry.campaignId === workspace.activeCampaignId,
    ) ?? null;
  return { campaign, jobs, log };
}

export function WorkspaceStateScreen(props: {
  action?: { label: string; onClick: () => void };
  kicker: string;
  message: string;
  title: string;
  tone?: "default" | "error";
}) {
  return (
    <main className="grid min-h-full place-items-center bg-canvas px-6 py-10">
      <div
        aria-atomic="true"
        aria-live={props.tone === "error" ? "assertive" : "polite"}
        className={
          props.tone === "error"
            ? "grid max-w-(--workspace-state-card-max-width) gap-3 rounded-(--workspace-state-card-radius) border border-critical/35 bg-(--workspace-state-card-bg-error) p-8 shadow-(--workspace-state-card-shadow)"
            : "grid max-w-(--workspace-state-card-max-width) gap-3 rounded-(--workspace-state-card-radius) border border-border-subtle bg-(--workspace-state-card-bg-default) p-8 shadow-(--workspace-state-card-shadow)"
        }
        role={props.tone === "error" ? "alert" : "status"}
      >
        <p className="text-(length:--text-tiny) uppercase tracking-[0.24em] text-foreground-muted">
          {props.kicker}
        </p>
        <h1>{props.title}</h1>
        <p>{props.message}</p>
        {props.action ? (
          <Button
            className="mt-2 w-fit"
            onClick={props.action.onClick}
            type="button"
          >
            {props.action.label}
          </Button>
        ) : null}
      </div>
    </main>
  );
}

export { JobFinderRouteErrorBoundary };

export function JobFinderCompaniesRoute() {
  const context = useJobFinderPageContext();

  return (
    <CompaniesScreen
      actionMessage={context.actionState.message}
      companies={context.workspace.intelligence.companies}
      discoveryJobs={context.workspace.discoveryJobs}
      isMergePending={(companyId) =>
        context.isPending(jobFinderPendingActions.companyMergeReview(companyId))
      }
      isMutationPending={(companyId) =>
        context.isPending(
          jobFinderPendingActions.companyIntelligenceMutation(companyId),
        )
      }
      isPreferencePending={(companyId) =>
        context.isPending(jobFinderPendingActions.companyPreference(companyId))
      }
      isRefreshPending={context.isPending(
        jobFinderPendingActions.companyIntelligenceRefresh(),
      )}
      onMutateCompanyIntelligence={context.onMutateCompanyIntelligence}
      onNavigate={context.onNavigateSafely}
      onRefresh={context.onRefreshCompanyIntelligence}
      onReviewCompanyMerge={context.onReviewCompanyMerge}
      onSetCompanyPreference={context.onSetCompanyPreference}
    />
  );
}

export function JobFinderCompanyDetailRoute() {
  const context = useJobFinderPageContext();
  const { companyId } = useParams<{ companyId: string }>();

  const company =
    context.workspace.intelligence.companies.find(
      (entry) => entry.id === companyId,
    ) ?? null;
  const relatedCompany = company ?? context.workspace.intelligence.companies[0] ?? null;

  if (!companyId || !relatedCompany) {
    return <Navigate replace to="/job-finder/companies" />;
  }

  return (
    <CompanyDetailScreen
      actionMessage={context.actionState.message}
      applicationRecords={context.workspace.applicationRecords}
      companies={context.workspace.intelligence.companies}
      company={relatedCompany}
      companyId={companyId}
      discoveryJobs={context.workspace.discoveryJobs}
      isMergePending={(targetCompanyId) =>
        context.isPending(
          jobFinderPendingActions.companyMergeReview(targetCompanyId),
        )
      }
      isMutationPending={(targetCompanyId) =>
        context.isPending(
          jobFinderPendingActions.companyIntelligenceMutation(targetCompanyId),
        )
      }
      isPreferencePending={(targetCompanyId) =>
        context.isPending(
          jobFinderPendingActions.companyPreference(targetCompanyId),
        )
      }
      onBack={() => context.onNavigateSafely("/job-finder/companies")}
      onMutateCompanyIntelligence={context.onMutateCompanyIntelligence}
      onNavigate={context.onNavigateSafely}
      onOpenJob={(jobId) => {
        context.onSelectDiscoveryJob(jobId);
        context.onNavigateSafely("/job-finder/discovery");
      }}
      onOpenApplication={(recordId) => {
        context.onSelectApplicationRecord(recordId);
        context.onNavigateSafely("/job-finder/applications");
      }}
      onReviewCompanyMerge={context.onReviewCompanyMerge}
      onSetCompanyPreference={context.onSetCompanyPreference}
      activeCapLimitReached={context.workspace.intelligence.safeguards.companyApplicationCaps.some(
        (cap) => cap.companyId === companyId && cap.limitReached,
      )}
      onOpenSafeguards={() =>
        context.onNavigateSafely("/job-finder/safeguards")
      }
    />
  );
}

export function JobFinderHomeRoute() {
  const context = useJobFinderPageContext();
  const [activityPending, setActivityPending] = useState(false);

  const handleActivityControl = (input: SetJobFinderActivityControlInput) => {
    setActivityPending(true);
    void context.onSetActivityControl(input).finally(() => {
      setActivityPending(false);
    });
  };

  const handleNavigateGlobalEntry = (entry: JobFinderGlobalSearchEntry) => {
    const { campaignId, href } = entry;

    if (campaignId && campaignId !== context.workspace.activeCampaignId) {
      void context.onSelectCampaign(campaignId).then((selected) => {
        if (selected) {
          context.onNavigateSafely(href);
        }
      });
      return;
    }

    context.onNavigateSafely(href);
  };

  return (
    <JobSearchHomeScreen
      activityPending={activityPending}
      campaignNotificationAllPending={context.isPending(
        jobFinderPendingActions.campaignNotificationAll(),
      )}
      campaignNotificationPending={(notificationId) =>
        context.isPending(
          jobFinderPendingActions.campaignNotification(notificationId),
        )
      }
      campaignNotifications={context.workspace.campaignNotifications}
      onMarkAllCampaignNotificationsRead={
        context.onMarkAllCampaignNotificationsRead
      }
      onMarkCampaignNotificationRead={context.onMarkCampaignNotificationRead}
      onNavigate={context.onNavigateSafely}
      onNavigateGlobalEntry={handleNavigateGlobalEntry}
      onPauseActivity={() =>
        handleActivityControl({ paused: true, reason: "Paused by you." })
      }
      onResumeActivity={() => handleActivityControl({ paused: false })}
      onSelectCampaign={(campaignId) => {
        void context.onSelectCampaign(campaignId);
      }}
      workspace={context.workspace}
    />
  );
}

export function JobFinderCampaignsRoute() {
  const context = useJobFinderPageContext();
  const [pending, setPending] = useState(false);
  const [rulePending, setRulePending] = useState(false);
  const [funnelProjection, setFunnelProjection] =
    useState<CampaignRuleFunnelProjection | null>(null);
  const [funnelCampaignId, setFunnelCampaignId] = useState<string | null>(null);

  const handleSaveCampaign = (campaign: SaveJobSearchCampaignInput) => {
    setPending(true);
    void context.onSaveCampaign(campaign).finally(() => {
      setPending(false);
    });
  };

  const handleSelectCampaign = (campaignId: string) => {
    setPending(true);
    void context.onSelectCampaign(campaignId).finally(() => {
      setPending(false);
    });
  };

  const refreshCampaignRuleFunnel = useCallback(
    (campaignId: string) => {
      setRulePending(true);
      void context
        .onProjectCampaignRuleFunnel(campaignId)
        .then((projection) => {
          setFunnelProjection(projection);
          setFunnelCampaignId(campaignId);
        })
        .catch(() => {
          setFunnelProjection(null);
          setFunnelCampaignId(null);
        })
        .finally(() => {
          setRulePending(false);
        });
    },
    [context],
  );

  const handleSaveCampaignRule = (
    campaignId: string,
    rule: SaveCampaignRuleInput,
  ) => {
    void context.onSaveCampaignRule(campaignId, rule).then((saved) => {
      if (saved) {
        refreshCampaignRuleFunnel(campaignId);
      }
    });
  };

  const handleDeleteCampaignRule = (campaignId: string, ruleId: string) => {
    void context.onDeleteCampaignRule(campaignId, ruleId).then((saved) => {
      if (saved) {
        refreshCampaignRuleFunnel(campaignId);
      }
    });
  };

  const handleToggleCampaignRule = (
    campaignId: string,
    ruleId: string,
    enabled: boolean,
  ) => {
    void context.onToggleCampaignRule(campaignId, ruleId, enabled).then(
      (saved) => {
        if (saved) {
          refreshCampaignRuleFunnel(campaignId);
        }
      },
    );
  };

  const handleRunCampaignNow = (campaignId: string) => {
    void context.onRunCampaignNow(campaignId);
  };

  return (
    <CampaignsScreen
      activeCampaignId={context.workspace.activeCampaignId}
      campaignRuleFunnel={funnelProjection}
      campaignRulePending={rulePending}
      campaigns={context.workspace.campaigns}
      onDeleteCampaignRule={handleDeleteCampaignRule}
      onRefreshCampaignRuleFunnel={refreshCampaignRuleFunnel}
      onRunCampaignNow={handleRunCampaignNow}
      onSaveCampaign={handleSaveCampaign}
      onSaveCampaignRule={handleSaveCampaignRule}
      onSelectCampaign={handleSelectCampaign}
      onToggleCampaignRule={handleToggleCampaignRule}
      pending={pending}
      runCampaignPending={(campaignId) =>
        context.isPending(jobFinderPendingActions.campaignRun(campaignId))
      }
    />
  );
}

export function JobFinderProfileRoute() {
  const context = useJobFinderPageContext();
  const location = useLocation();
  const forceFullProfile = Boolean(
    (location.state as { forceFullProfile?: boolean } | null)?.forceFullProfile,
  );
  const resolvedProfileRoute = getDefaultProfileRoute(
    context.workspace.profileSetupState,
    {
      forceFullProfile,
    },
  );

  if (resolvedProfileRoute !== "/job-finder/profile") {
    return <Navigate replace to={resolvedProfileRoute} />;
  }

  return (
    <ProfileScreen
      actionState={context.actionState}
      importResumeGuardMessage={context.importResumeGuardMessage}
      pendingActions={{
        analyzeProfile: context.isPending(
          jobFinderPendingActions.profileAnalyze(),
        ),
        browserSession: (targetId) =>
          context.isPending(
            jobFinderPendingActions.browserSessionTarget(targetId),
          ),
        importResume: context.isPending(
          jobFinderPendingActions.profileImport(),
        ),
        profileCopilotBusy: context.profileCopilotBusy,
        profileMutation: context.isPending(
          jobFinderPendingActions.profileMutation(),
        ),
        profileSetup: context.isPending(jobFinderPendingActions.profileSetup()),
        sourceDebug: (targetId) =>
          context.isPending(jobFinderPendingActions.sourceDebug(targetId)),
        sourceInstruction: (targetId) =>
          context.isPending(
            jobFinderPendingActions.sourceInstruction(targetId),
          ),
        sourceInstructionVerify: (instructionId) =>
          context.isPending(
            jobFinderPendingActions.sourceInstructionVerify(instructionId),
          ),
        targetDiscovery: (targetId) =>
          context.isPending(jobFinderPendingActions.discoveryTarget(targetId)),
      }}
      onApplyProfileCopilotPatchGroup={context.onApplyProfileCopilotPatchGroup}
      onAnalyzeProfileFromResume={context.onAnalyzeProfileFromResume}
      onApplyResumeTimelineRepairAction={
        context.onApplyResumeTimelineRepairAction
      }
      onGetSourceDebugRunDetails={context.onGetSourceDebugRunDetails}
      onImportResume={context.onImportResume}
      onOpenBrowserSessionForTarget={(targetId) =>
        context.onOpenBrowserSession({ targetId })
      }
      onProfileSurfaceDirtyChange={context.onProfileSurfaceDirtyChange}
      profileCopilotPendingContextKey={context.profileCopilotPendingContextKey}
      onResumeProfileSetup={context.onResumeProfileSetup}
      onRejectProfileCopilotPatchGroup={
        context.onRejectProfileCopilotPatchGroup
      }
      {...(context.onRunDiscoveryForTarget
        ? { onRunDiscoveryForTarget: context.onRunDiscoveryForTarget }
        : {})}
      onRunSourceDebug={context.onRunSourceDebug}
      onSaveAll={context.onSaveAll}
      onSaveSourceInstructionArtifact={context.onSaveSourceInstructionArtifact}
      onSendProfileCopilotMessage={context.onSendProfileCopilotMessage}
      onUndoProfileRevision={context.onUndoProfileRevision}
      onVerifySourceInstructions={context.onVerifySourceInstructions}
      latestResumeImportReviewCandidates={
        context.workspace.latestResumeImportReviewCandidates
      }
      resumeImportProgress={context.resumeImportProgress}
      latestResumeImportRun={context.workspace.latestResumeImportRun}
      profile={context.workspace.profile}
      profileCopilotMessages={context.workspace.profileCopilotMessages}
      profileRevisions={context.workspace.profileRevisions}
      profileSetupState={context.workspace.profileSetupState}
      recentSourceDebugRuns={context.workspace.recentSourceDebugRuns}
      searchPreferences={context.workspace.searchPreferences}
      sourceAccessPrompts={context.workspace.sourceAccessPrompts}
      sourceInstructionArtifacts={context.workspace.sourceInstructionArtifacts}
    />
  );
}

export function JobFinderProfileSetupRoute() {
  const context = useJobFinderPageContext();

  if (context.workspace.profileSetupState.status === "completed") {
    return <Navigate replace to="/job-finder/profile" />;
  }

  return (
    <ProfileSetupScreen
      actionState={context.actionState}
      importResumeGuardMessage={context.importResumeGuardMessage}
      isImportResumePending={context.isPending(
        jobFinderPendingActions.profileImport(),
      )}
      isProfileSetupPending={context.isPending(
        jobFinderPendingActions.profileSetup(),
      )}
      isReviewItemPending={(reviewItemId) =>
        context.isPending(
          jobFinderPendingActions.profileReviewItem(reviewItemId),
        )
      }
      profileCopilotBusy={context.profileCopilotBusy}
      latestResumeImportReviewCandidates={
        context.workspace.latestResumeImportReviewCandidates
      }
      resumeImportProgress={context.resumeImportProgress}
      onApplyProfileCopilotPatchGroup={context.onApplyProfileCopilotPatchGroup}
      onApplyProfileSetupReviewAction={context.onApplyProfileSetupReviewAction}
      onContinueToProfile={context.onOpenProfile}
      onImportResume={context.onImportResume}
      onProfileSurfaceDirtyChange={context.onProfileSurfaceDirtyChange}
      profileCopilotPendingContextKey={context.profileCopilotPendingContextKey}
      onRejectProfileCopilotPatchGroup={
        context.onRejectProfileCopilotPatchGroup
      }
      onResumeSetup={context.onResumeProfileSetup}
      onSaveSetupStep={context.onSaveSetupStep}
      onSendProfileCopilotMessage={context.onSendProfileCopilotMessage}
      onUndoProfileRevision={context.onUndoProfileRevision}
      profile={context.workspace.profile}
      profileCopilotMessages={context.workspace.profileCopilotMessages}
      profileRevisions={context.workspace.profileRevisions}
      profileSetupState={context.workspace.profileSetupState}
      searchPreferences={context.workspace.searchPreferences}
    />
  );
}

export function JobFinderDiscoveryRoute() {
  const context = useJobFinderPageContext();
  const activeCampaign = context.workspace.campaigns.find(
    (campaign) => campaign.id === context.workspace.activeCampaignId,
  );
  const campaignJobIds = new Set(activeCampaign?.jobIds ?? []);
  const jobs = context.workspace.discoveryJobs.filter((job) =>
    campaignJobIds.has(job.id),
  );
  const dismissedJobs = context.workspace.dismissedDiscoveryJobs.filter((job) =>
    campaignJobIds.has(job.id),
  );
  const selectedJob =
    jobs.find((job) => job.id === context.selectedDiscoveryJob?.id) ??
    jobs[0] ??
    null;

  return (
    <DiscoveryScreen
      actionState={context.actionState}
      activeRun={context.workspace.activeDiscoveryRun}
      browserSession={context.workspace.browserSession}
      companies={context.workspace.intelligence.companies}
      isBrowserSessionPending={context.isPending(
        jobFinderPendingActions.browserSession(),
      )}
      isBrowserSessionPendingForTarget={(targetId) =>
        context.isPending(
          jobFinderPendingActions.browserSessionTarget(targetId),
        )
      }
      isDiscoveryAllPending={context.isPending(
        jobFinderPendingActions.discoveryAll(),
      )}
      discoverySessions={context.workspace.discoverySessions}
      jobs={jobs}
      dismissedJobs={dismissedJobs}
      liveEvents={context.liveDiscoveryEvents}
      isJobPending={(jobId) =>
        context.isAnyPending([
          jobFinderPendingActions.discoveryJob(jobId),
          jobFinderPendingActions.resumeJob(jobId),
        ])
      }
      isTargetPending={(targetId) =>
        context.isAnyPending([
          jobFinderPendingActions.discoveryTarget(targetId),
          jobFinderPendingActions.sourceDebug(targetId),
          jobFinderPendingActions.sourceInstruction(targetId),
        ])
      }
      onDismissJob={context.onDismissJob}
      onRestoreDismissedJob={context.onRestoreDismissedJob}
      onOpenBrowserSession={context.onOpenBrowserSession}
      onOpenBrowserSessionForTarget={(targetId) =>
        context.onOpenBrowserSession({ targetId })
      }
      onOpenCompany={(companyId) =>
        context.onNavigateSafely(`/job-finder/companies/${companyId}`)
      }
      onQueueJob={context.onQueueJob}
      onRunAgentDiscovery={context.onRunAgentDiscovery}
      {...(context.onRunDiscoveryForTarget
        ? { onRunDiscoveryForTarget: context.onRunDiscoveryForTarget }
        : {})}
      onSelectJob={context.onSelectDiscoveryJob}
      recentRuns={context.workspace.recentDiscoveryRuns}
      searchPreferences={context.workspace.searchPreferences}
      selectedJob={selectedJob}
      sourceAccessPrompts={context.workspace.sourceAccessPrompts}
    />
  );
}

export function JobFinderRapidReviewRoute() {
  const context = useJobFinderPageContext();
  const { campaign, jobs, log } = selectRapidReviewScope(context.workspace);

  if (!campaign) {
    return <Navigate replace to="/job-finder/campaigns" />;
  }

  return (
    <RapidReviewScreen
      campaignId={campaign.id}
      campaignName={campaign.name}
      jobs={jobs}
      log={log}
      onInspectJob={(jobId) => {
        context.onSelectDiscoveryJob(jobId);
        context.onNavigateSafely("/job-finder/discovery");
      }}
      onMutate={context.onMutateRapidReview}
      pending={context.isPending(jobFinderPendingActions.rapidReview())}
    />
  );
}

export function JobFinderReviewQueueRoute() {
  const context = useJobFinderPageContext();
  const activeCampaign = context.workspace.campaigns.find(
    (campaign) => campaign.id === context.workspace.activeCampaignId,
  );
  const campaignJobIds = new Set(activeCampaign?.jobIds ?? []);
  const queue = context.workspace.reviewQueue.filter((item) =>
    campaignJobIds.has(item.jobId),
  );
  const selectedItem =
    queue.find((item) => item.jobId === context.selectedReviewItem?.jobId) ??
    queue[0] ??
    null;
  const selectedJob = selectedItem
    ? (context.workspace.discoveryJobs.find(
        (job) => job.id === selectedItem.jobId,
      ) ?? null)
    : null;
  const selectedAsset = selectedItem
    ? (context.workspace.tailoredAssets.find(
        (asset) => asset.jobId === selectedItem.jobId,
      ) ?? null)
    : null;

  return (
    <ReviewQueueScreen
      actionState={context.actionState}
      browserSession={context.workspace.browserSession}
      campaignId={activeCampaign?.id ?? ""}
      isApplyPending={context.isPending(jobFinderPendingActions.apply())}
      isJobPending={(jobId) =>
        context.isPending(jobFinderPendingActions.resumeJob(jobId))
      }
      isResumeStrategyPending={(jobId) =>
        context.isAnyPending([
          jobFinderPendingActions.resumeStrategyRecommend(jobId),
          jobFinderPendingActions.resumeStrategySelect(jobId),
        ])
      }
      onRecommendResumeStrategy={context.onRecommendResumeStrategy}
      onSelectResumeStrategy={context.onSelectResumeStrategy}
      onStartAutoApplyQueue={context.onStartAutoApplyQueue}
      onStartApplyCopilot={context.onStartApplyCopilot}
      onEditResumeWorkspace={context.onEditResumeWorkspace}
      onGenerateResume={context.onGenerateResume}
      onOpenBrowserSession={() => context.onOpenBrowserSession()}
      onOpenJobDetails={(jobId) => {
        context.onSelectDiscoveryJob(jobId);
        context.onNavigateSafely("/job-finder/discovery");
      }}
      onOpenProfile={context.onOpenProfile}
      onRemoveReviewJob={context.onRemoveReviewJob}
      onSetJobResumeApplicationMode={context.onSetJobResumeApplicationMode}
      onSelectItem={context.onSelectReviewItem}
      originalResume={context.workspace.profile.baseResume}
      queue={queue}
      resumeStrategies={context.workspace.intelligence.resumeStrategies}
      resumeStrategySelections={
        context.workspace.intelligence.resumeStrategySelections
      }
      selectedAsset={selectedAsset}
      selectedItem={selectedItem}
      selectedJob={selectedJob}
    />
  );
}

export function JobFinderResumeWorkspaceRoute() {
  const context = useJobFinderPageContext();
  const { jobId } = useParams<{ jobId: string }>();

  if (!jobId) {
    return <Navigate replace to="/job-finder/review-queue" />;
  }

  const reviewItem = context.workspace.reviewQueue.find(
    (item) => item.jobId === jobId,
  );

  if (!reviewItem) {
    return <Navigate replace to="/job-finder/review-queue" />;
  }

  return (
    <ResumeWorkspaceScreen
      actionMessage={context.actionState.message}
      assistantMessages={context.resumeAssistantMessages}
      availableResumeTemplates={context.workspace.availableResumeTemplates}
      assistantPending={context.resumeAssistantPending}
      isWorkspacePending={context.isPending(
        jobFinderPendingActions.resumeJob(jobId),
      )}
      jobId={jobId}
      onApproveResume={context.onApproveResume}
      onBack={() => context.onEditResumeWorkspace("")}
      onClearResumeApproval={context.onClearResumeApproval}
      onExportPdf={context.onExportResumePdf}
      onApplyPatch={context.onApplyResumePatch}
      onDirtyChange={context.onResumeWorkspaceDirtyChange}
      onPreviewDraft={context.onPreviewResumeDraft}
      onRefresh={() => context.onRefreshResumeWorkspace(jobId)}
      onRegenerateDraft={context.onRegenerateResumeDraft}
      onRegenerateSection={context.onRegenerateResumeSection}
      onRestoreRevision={context.onRestoreResumeDraftRevision}
      onSaveDraft={context.onSaveResumeDraft}
      onSaveDraftAndThen={context.onSaveResumeDraftAndThen}
      onSendAssistantMessage={context.onSendResumeAssistantMessage}
      onResolveAssistantProposal={context.onResolveResumeAssistantProposal}
      workspace={context.resumeWorkspace}
    />
  );
}

export function JobFinderApplicationsRoute() {
  const context = useJobFinderPageContext();
  const activeCampaign = context.workspace.campaigns.find(
    (campaign) => campaign.id === context.workspace.activeCampaignId,
  );
  const campaignJobIds = new Set(activeCampaign?.jobIds ?? []);
  const discoveryJobs = context.workspace.discoveryJobs.filter((job) =>
    campaignJobIds.has(job.id),
  );
  const applicationRecords = context.workspace.applicationRecords.filter(
    (record) => campaignJobIds.has(record.jobId),
  );
  const applicationAttempts = context.workspace.applicationAttempts.filter(
    (attempt) => campaignJobIds.has(attempt.jobId),
  );
  const applyRuns = context.workspace.applyRuns.filter((run) =>
    run.jobIds.some((jobId) => campaignJobIds.has(jobId)),
  );
  const applyRunIds = new Set(applyRuns.map((run) => run.id));
  const applyJobResults = context.workspace.applyJobResults.filter(
    (result) =>
      campaignJobIds.has(result.jobId) && applyRunIds.has(result.runId),
  );
  const selectedRecord =
    applicationRecords.find(
      (record) => record.id === context.selectedApplicationRecord?.id,
    ) ??
    applicationRecords[0] ??
    null;
  const selectedAttempt = selectedRecord
    ? (applicationAttempts.find(
        (attempt) => attempt.id === context.selectedApplicationAttempt?.id,
      ) ??
      applicationAttempts
        .filter((attempt) => attempt.jobId === selectedRecord.jobId)
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        )[0] ??
      null)
    : null;

  return (
    <ApplicationsScreen
      applicationAttempts={applicationAttempts}
      applicationRecords={applicationRecords}
      applyRuns={applyRuns}
      applyJobResults={applyJobResults}
      companies={context.workspace.intelligence.companies}
      crmSettings={
        context.workspace.settings.applicationCrm ??
        ApplicationCrmSettingsSchema.parse({})
      }
      discoveryJobs={discoveryJobs}
      isApplyPending={context.isPending(jobFinderPendingActions.apply())}
      isApplyRequestPending={(requestId) =>
        context.isPending(jobFinderPendingActions.applyRequest(requestId))
      }
      isApplyRunPending={(runId) =>
        context.isPending(jobFinderPendingActions.applyRun(runId))
      }
      onApproveApplyRun={context.onApproveApplyRun}
      onCancelApplyRun={(runId) => {
        void context.onCancelApplyRun(runId);
      }}
      onGetApplyRunDetails={context.onGetApplyRunDetails}
      onSaveApplicationAnswer={context.onSaveApplicationAnswer}
      onClearApplicationAnswer={context.onClearApplicationAnswer}
      onOpenCompany={(companyId) =>
        context.onNavigateSafely(`/job-finder/companies/${companyId}`)
      }
      onExportApplicationPacket={context.onExportApplicationPacket}
      onExportApplicationCrm={context.onExportApplicationCrm}
      onMutateApplicationCrm={context.onMutateApplicationCrm}
      onRecordOutcome={async (input) => {
        const completed = await context.onRecordOutcome(input);
        if (!completed) {
          throw new Error("The outcome could not be recorded.");
        }
      }}
      isRecordOutcomePending={(jobId) =>
        context.isPending(jobFinderPendingActions.recordOutcome(jobId))
      }
      getOutcomeResumeStrategyId={(jobId) =>
        context.workspace.intelligence.resumeStrategySelections.find(
          (selection) => selection.jobId === jobId,
        )?.strategyId ?? null
      }
      onResolveApplyConsentRequest={context.onResolveApplyConsentRequest}
      onRevokeApplyRunApproval={context.onRevokeApplyRunApproval}
      onStartAutoApplyQueue={context.onStartAutoApplyQueue}
      onStartApplyCopilot={context.onStartApplyCopilot}
      onStartAutoApply={context.onStartAutoApply}
      onSelectRecord={context.onSelectApplicationRecord}
      selectedApplyRunId={context.workspace.selectedApplyRunId}
      selectedAttempt={selectedAttempt}
      selectedRecord={selectedRecord}
      safeguardsBlockerCount={countActiveSafeguardBlockers(
        context.workspace.intelligence.safeguards,
      )}
      onOpenSafeguards={() =>
        context.onNavigateSafely("/job-finder/safeguards")
      }
    />
  );
}

export function selectJobFinderActionsScope(context: JobFinderPageContext) {
  return {
    groupedDecisions: context.workspace.intelligence.groupedDecisions,
    isGroupedApplyPending: (decisionId: string) =>
      context.isPending(
        jobFinderPendingActions.groupedManualAnswerApply(decisionId),
      ),
    isGroupedProjectPending: (groupKey: string) =>
      context.isPending(
        jobFinderPendingActions.groupedManualAnswerProject(groupKey),
      ),
    isGroupedSnoozePending: (decisionId: string) =>
      context.isPending(
        jobFinderPendingActions.groupedDecisionSnooze(decisionId),
      ),
    onApplyGroupedManualAnswer: context.onApplyGroupedManualAnswer,
    onProjectGroupedManualAnswer: context.onProjectGroupedManualAnswer,
    onSnoozeGroupedDecision: context.onSnoozeGroupedDecision,
  };
}

export function JobFinderActionsRoute() {
  const context = useJobFinderPageContext();
  const scope = selectJobFinderActionsScope(context);

  return (
    <ActionsScreen
      applicationAttempts={context.workspace.applicationAttempts}
      discoveryJobs={context.workspace.discoveryJobs}
      groupedDecisions={scope.groupedDecisions}
      isGroupedApplyPending={scope.isGroupedApplyPending}
      isGroupedProjectPending={scope.isGroupedProjectPending}
      isGroupedSnoozePending={scope.isGroupedSnoozePending}
      isPending={(requestId) =>
        context.isPending(jobFinderPendingActions.userAction(requestId))
      }
      onApplyGroupedManualAnswer={scope.onApplyGroupedManualAnswer}
      onCommand={context.onPerformUserAction}
      onNavigate={context.onNavigateSafely}
      onProjectGroupedManualAnswer={scope.onProjectGroupedManualAnswer}
      onSnoozeGroupedDecision={scope.onSnoozeGroupedDecision}
      profile={context.workspace.profile}
      requests={context.workspace.userActionRequests ?? []}
    />
  );
}

export function selectOutcomeAnalyticsScope(
  workspace: JobFinderWorkspaceSnapshot,
) {
  const intelligence = workspace.intelligence;
  return {
    activeCampaignId: workspace.activeCampaignId,
    campaigns: workspace.campaigns,
    // Defensive against older snapshots: the schema defaults these fields,
    // but the analytics screen must never crash on a partial legacy state.
    events: intelligence.outcomeEvents ?? [],
    overview: intelligence.outcomeAnalytics ?? null,
    resumeStrategies: intelligence.resumeStrategies ?? [],
  };
}

export function JobFinderAnalyticsRoute() {
  const context = useJobFinderPageContext();
  const scope = selectOutcomeAnalyticsScope(context.workspace);
  return (
    <OutcomeAnalyticsScreen
      actionMessage={context.actionState.message}
      activeCampaignId={scope.activeCampaignId}
      campaigns={scope.campaigns}
      events={scope.events}
      generatedAt={context.workspace.generatedAt}
      isSuggestionPending={(dimension, key) =>
        context.isPending(
          jobFinderPendingActions.outcomeSuggestion(dimension, key),
        )
      }
      onSetOutcomeSuggestionEnabled={context.onSetOutcomeSuggestionEnabled}
      overview={scope.overview}
      resumeStrategies={scope.resumeStrategies}
    />
  );
}

export function JobFinderSettingsRoute() {
  const context = useJobFinderPageContext();

  return (
    <SettingsScreen
      actionState={context.actionState}
      availableResumeTemplates={context.workspace.availableResumeTemplates}
      browserSession={context.workspace.browserSession}
      isSavePending={context.isPending(jobFinderPendingActions.settingsSave())}
      isWorkspaceResetPending={context.isPending(
        jobFinderPendingActions.workspaceReset(),
      )}
      onResetWorkspace={context.onResetWorkspace}
      onSaveApplicationCrmSettings={context.onSaveApplicationCrmSettings}
      onSaveSettings={(settings) => {
        void context.onSaveSettings(settings);
      }}
      saveState={context.saveState}
      settings={context.workspace.settings}
    />
  );
}

export function JobFinderSafeguardsRoute() {
  const context = useJobFinderPageContext();

  return (
    <SafeguardsScreen
      actionMessage={context.actionState.message}
      isPending={(controlId) =>
        context.isPending(
          jobFinderPendingActions.safeguardsMutation(controlId),
        )
      }
      onMutateSafeguards={context.onMutateSafeguards}
      workspace={context.workspace}
    />
  );
}

export function JobFinderResumeStrategiesRoute() {
  const context = useJobFinderPageContext();
  const intelligence = context.workspace.intelligence;
  const candidateDocumentIds = context.workspace.tailoredAssets.map(
    (asset) => asset.id,
  );

  return (
    <ResumeStrategiesScreen
      actionMessage={context.actionState.message}
      baseResumeDocumentId={context.workspace.profile.baseResume.id}
      campaigns={context.workspace.campaigns}
      candidateDocumentIds={candidateDocumentIds}
      isCampaignDefaultPending={(campaignId) =>
        context.isPending(
          jobFinderPendingActions.resumeStrategyCampaignDefault(campaignId),
        )
      }
      isDisablePending={(strategyId) =>
        context.isPending(
          jobFinderPendingActions.resumeStrategyDisable(strategyId),
        )
      }
      isLoading={false}
      isSavePending={context.isPending(
        jobFinderPendingActions.resumeStrategySave(),
      )}
      onDisableStrategy={context.onDisableResumeStrategy}
      onSaveStrategy={context.onSaveResumeStrategy}
      onSetCampaignDefault={context.onSetCampaignResumeStrategyDefault}
      strategies={intelligence.resumeStrategies}
    />
  );
}
