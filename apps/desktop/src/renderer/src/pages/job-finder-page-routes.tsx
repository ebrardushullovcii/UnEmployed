import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { jobFinderPendingActions } from "./job-finder-pending-actions";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/cn";
import { JobFinderRouteErrorBoundary } from "./job-finder-route-error-boundary";
import { getDefaultProfileRoute } from "@renderer/features/job-finder/lib/job-finder-utils";
import {
  Navigate,
  useSearchParams,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { isProfileSetupJustFinished } from "./use-job-finder-page-controller-actions";
import {
  markGuidedSetupAutoOpenSpent,
  shouldAutoOpenGuidedSetup,
} from "@renderer/features/job-finder/components/profile/setup/guided-setup-auto-open";
import type { JobFinderPageContext } from "./job-finder-page-context";
import type { JobFinderGlobalSearchEntry } from "@renderer/features/job-finder/lib/job-finder-global-search";
import type {
  ApplicationCrmSettings,
  CampaignRuleFunnelProjection,
  JobFinderWorkspaceSnapshot,
  JobSearchCampaign,
  RapidReviewDecisionLog,
  SavedJob,
  SaveCampaignRuleInput,
  SaveJobSearchCampaignInput,
  SetJobFinderActivityControlInput,
  UserActionCommandInput,
  UserActionRequestState,
} from "@unemployed/contracts";
import { ApplicationCrmSettingsSchema } from "@unemployed/contracts";
import { isListableCompanyName } from "@unemployed/contracts";
import { countActiveSafeguardBlockers } from "@renderer/features/job-finder/lib/safeguards-blocker-count";
import { ApplicationsScreen } from "@renderer/features/job-finder/screens/applications/applications-screen";
import type {
  ConfirmFinishedInBrowserStatus,
  FinishInBrowserInput,
  FinishInBrowserOutcome,
} from "@renderer/features/job-finder/screens/applications/applications-detail-panel-recovery-actions-section";
import { getJobFinderErrorDetail } from "@renderer/features/job-finder/lib/job-finder-error-message";
import { DiscoveryScreen } from "@renderer/features/job-finder/screens/discovery/discovery-screen";
import { ProfileScreen } from "@renderer/features/job-finder/screens/profile-screen";
import { ReviewQueueScreen } from "@renderer/features/job-finder/screens/review-queue/review-queue-screen";
import {
  buildJobFinderContextRoute,
  clearJobFinderContextQuery,
  JOB_FINDER_CONTEXT_QUERY_KEYS,
  JOB_FINDER_RETURN_ROUTES,
  readJobFinderNavigationContext,
  readJobFinderReturnRoute,
  selectJobFinderContext,
} from "@renderer/features/job-finder/lib/job-finder-context-navigation";
import {
  RESUME_WORKSPACE_REQUIRED_COLLECTIONS,
  resolveResumeWorkspaceRouteState,
} from "@renderer/features/job-finder/lib/resume-workspace-route-state";

// The canonical workflow surfaces (Profile, Find jobs, Shortlisted,
// Applications) are part of the initial-route bundle so their real headings
// mount on the first commit without a Suspense placeholder. Long-tail route
// surfaces stay lazy: they are independent chunks loaded only when their
// route is rendered, and this file keeps their shared loading fallback so a
// first visit is explicit and recoverable instead of rendering a blank page.
function createSharedRouteLoader<T>(load: () => Promise<T>) {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= load();
    return promise;
  };
}

const loadProfileSetupScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/components/profile/setup/profile-setup-screen")
  ).ProfileSetupScreen,
}));
const loadCampaignsScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/campaigns/campaigns-screen")
  ).CampaignsScreen,
}));
const loadCompaniesScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/companies/companies-screen")
  ).CompaniesScreen,
}));
const loadCompanyDetailScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/companies/company-detail-screen")
  ).CompanyDetailScreen,
}));
const loadJobSearchHomeScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/job-search-home/job-search-home-screen")
  ).JobSearchHomeScreen,
}));
const loadActionsScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/actions-screen")
  ).ActionsScreen,
}));
const loadOutcomeAnalyticsScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/analytics/outcome-analytics-screen")
  ).OutcomeAnalyticsScreen,
}));
const loadResumeStrategiesScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/resume-strategies/resume-strategies-screen")
  ).ResumeStrategiesScreen,
}));
const loadRapidReviewScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/rapid-review/rapid-review-screen")
  ).RapidReviewScreen,
}));
const loadResumeWorkspaceScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/review-queue/resume-workspace-screen")
  ).ResumeWorkspaceScreen,
}));
const loadSettingsScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/settings-screen")
  ).SettingsScreen,
}));
const loadDocumentsScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/settings/documents-screen")
  ).DocumentsScreen,
}));
const loadSafeguardsScreen = createSharedRouteLoader(async () => ({
  default: (
    await import("@renderer/features/job-finder/screens/safeguards/safeguards-screen")
  ).SafeguardsScreen,
}));

const ProfileSetupScreen = lazy(loadProfileSetupScreen);
const CampaignsScreen = lazy(loadCampaignsScreen);
const CompaniesScreen = lazy(loadCompaniesScreen);
const CompanyDetailScreen = lazy(loadCompanyDetailScreen);
const JobSearchHomeScreen = lazy(loadJobSearchHomeScreen);
const ActionsScreen = lazy(loadActionsScreen);
const OutcomeAnalyticsScreen = lazy(loadOutcomeAnalyticsScreen);
const ResumeStrategiesScreen = lazy(loadResumeStrategiesScreen);
const RapidReviewScreen = lazy(loadRapidReviewScreen);
const ResumeWorkspaceScreen = lazy(loadResumeWorkspaceScreen);
const SettingsScreen = lazy(loadSettingsScreen);
const DocumentsScreen = lazy(loadDocumentsScreen);
const SafeguardsScreen = lazy(loadSafeguardsScreen);

// The empty-input parse is a constant, so it belongs outside the render path
// instead of re-running a schema parse on every Applications render.
let cachedDefaultApplicationCrmSettings: ApplicationCrmSettings | null = null;

function defaultApplicationCrmSettings(): ApplicationCrmSettings {
  cachedDefaultApplicationCrmSettings ??= ApplicationCrmSettingsSchema.parse(
    {},
  );
  return cachedDefaultApplicationCrmSettings;
}

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

type CampaignJobIndex = ReadonlyArray<{
  readonly id: string;
  readonly jobIds: ReadonlySet<string>;
}>;

/**
 * One membership index per campaign, built once per scope calculation.
 * `resolveCampaignForJobs` runs once per apply run and once per application
 * record, so a linear `Array.includes` per (campaign, job) pair turned an
 * ordinary Applications render into quadratic work at the sizes this product
 * targets (5,000 discovered jobs / 1,001 application records).
 */
function indexCampaignJobIds(
  campaigns: JobFinderWorkspaceSnapshot["campaigns"],
): CampaignJobIndex {
  return campaigns.map((campaign) => ({
    id: campaign.id,
    jobIds: new Set(campaign.jobIds),
  }));
}

// Campaign order and the "exactly one campaign owns every job" rule are
// unchanged: the first match wins only while it stays the sole match.
function resolveCampaignForJobs(
  campaignIndex: CampaignJobIndex,
  jobIds: readonly string[],
): string | null {
  if (jobIds.length === 0) return null;
  let campaignId: string | null = null;
  for (const campaign of campaignIndex) {
    if (!jobIds.every((jobId) => campaign.jobIds.has(jobId))) continue;
    if (campaignId !== null) return null;
    campaignId = campaign.id;
  }
  return campaignId;
}

function onlyValue(values: ReadonlySet<string>): string | null {
  if (values.size !== 1) return null;
  for (const value of values) return value;
  return null;
}

export function selectCampaignApplicationsScope(
  workspace: JobFinderWorkspaceSnapshot,
) {
  const activeCampaign = workspace.campaigns.find(
    (campaign) => campaign.id === workspace.activeCampaignId,
  );
  if (!activeCampaign) {
    return {
      activeCampaign: null,
      applicationAttempts: [],
      applicationRecords: [],
      applyJobResults: [],
      applyRuns: [],
      discoveryJobs: [],
      selectedApplyRunId: null,
    };
  }

  const campaignIndex = indexCampaignJobIds(workspace.campaigns);
  const runCampaignById = new Map(
    workspace.applyRuns.map((run) => [
      run.id,
      run.campaignId ?? resolveCampaignForJobs(campaignIndex, run.jobIds),
    ]),
  );
  const resultsByApplicationRecordId = new Map<
    string,
    JobFinderWorkspaceSnapshot["applyJobResults"]
  >();
  for (const result of workspace.applyJobResults) {
    if (!result.applicationRecordId) continue;
    const results =
      resultsByApplicationRecordId.get(result.applicationRecordId) ?? [];
    results.push(result);
    resultsByApplicationRecordId.set(result.applicationRecordId, results);
  }
  const recordCampaignById = new Map<string, string | null>();
  for (const record of workspace.applicationRecords) {
    const linkedResults = resultsByApplicationRecordId.get(record.id) ?? [];
    const linkedCampaignIds = new Set(
      linkedResults.flatMap((result) => {
        const campaignId = runCampaignById.get(result.runId) ?? null;
        return campaignId ? [campaignId] : [];
      }),
    );
    recordCampaignById.set(
      record.id,
      linkedResults.length > 0
        ? onlyValue(linkedCampaignIds)
        : resolveCampaignForJobs(campaignIndex, [record.jobId]),
    );
  }

  const applicationRecords = workspace.applicationRecords.filter(
    (record) => recordCampaignById.get(record.id) === activeCampaign.id,
  );
  const applicationRecordIds = new Set(
    applicationRecords.map((record) => record.id),
  );
  const applyRuns = workspace.applyRuns.filter(
    (run) => runCampaignById.get(run.id) === activeCampaign.id,
  );
  const applyRunIds = new Set(applyRuns.map((run) => run.id));
  const recordsByJobId = new Map<string, string[]>();
  for (const record of applicationRecords) {
    const ids = recordsByJobId.get(record.jobId) ?? [];
    ids.push(record.id);
    recordsByJobId.set(record.jobId, ids);
  }
  const applyJobResults = workspace.applyJobResults.filter((result) => {
    if (!applyRunIds.has(result.runId)) return false;
    if (result.applicationRecordId) {
      return applicationRecordIds.has(result.applicationRecordId);
    }
    return (recordsByJobId.get(result.jobId)?.length ?? 0) === 1;
  });
  const applicationAttempts = workspace.applicationAttempts.filter(
    (attempt) => {
      if (attempt.applicationRecordId) {
        return applicationRecordIds.has(attempt.applicationRecordId);
      }
      return (recordsByJobId.get(attempt.jobId)?.length ?? 0) === 1;
    },
  );
  const campaignJobIds = new Set(activeCampaign.jobIds);

  return {
    activeCampaign,
    applicationAttempts,
    applicationRecords,
    applyJobResults,
    applyRuns,
    discoveryJobs: workspace.discoveryJobs.filter((job) =>
      campaignJobIds.has(job.id),
    ),
    selectedApplyRunId: applyRunIds.has(workspace.selectedApplyRunId ?? "")
      ? workspace.selectedApplyRunId
      : null,
  };
}

export function WorkspaceStateScreen(props: {
  action?: { label: string; onClick: () => void };
  fillAvailableViewport?: boolean;
  kicker: string;
  message: string;
  title: string;
  tone?: "default" | "error";
}) {
  return (
    <main
      // A route-level state is not a crash: dead-centring a small card in a
      // full empty viewport read like one. Only the viewport-filling startup
      // screens stay centred; in-route states sit near the top of the content.
      className={
        props.fillAvailableViewport
          ? "grid min-h-[calc(100dvh-7.25rem)] flex-1 place-items-center bg-canvas px-6 py-10 text-center min-[1440px]:min-h-[calc(100dvh-3.5rem)]"
          : "grid min-h-full flex-1 content-start justify-items-center bg-canvas px-6 pb-10 pt-12 text-center"
      }
      data-workspace-state-viewport-fill={
        props.fillAvailableViewport ? "true" : undefined
      }
    >
      <div
        aria-atomic="true"
        aria-live={props.tone === "error" ? "assertive" : "polite"}
        className={cn(
          "grid w-full max-w-(--workspace-state-card-max-width) justify-items-center gap-3 rounded-(--workspace-state-card-radius) p-8 shadow-(--workspace-state-card-shadow)",
          props.tone === "error"
            ? "border border-critical/35 bg-(--workspace-state-card-bg-error)"
            : "border border-border-subtle bg-(--workspace-state-card-bg-default)",
          // An in-route card at the shared 34rem cap wrapped its own heading
          // mid-phrase; the startup screens keep the narrower measure.
          props.fillAvailableViewport ? null : "sm:max-w-[42rem]",
        )}
        data-workspace-state-screen
        role={props.tone === "error" ? "alert" : "status"}
      >
        <p className="text-(length:--text-tiny) uppercase tracking-[0.24em] text-foreground-muted">
          {props.kicker}
        </p>
        <h1 className="text-balance" data-workspace-state-title>
          {props.title}
        </h1>
        <p data-workspace-state-message>{props.message}</p>
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

type JobFinderDeferredCollection =
  JobFinderWorkspaceSnapshot["hydration"]["deferredCollections"][number];

export function isJobFinderHydratingCollections(
  workspace: JobFinderWorkspaceSnapshot,
  collections: readonly JobFinderDeferredCollection[],
): boolean {
  return (
    workspace.hydration.phase === "bootstrap" &&
    collections.some((collection) =>
      workspace.hydration.deferredCollections.includes(collection),
    )
  );
}

/**
 * Bootstrap snapshots intentionally leave large collections empty. Routes
 * that depend on those collections must not render an empty result state or
 * offer actions that the workspace hook will reject while hydration runs.
 */
export function JobFinderHydrationGate(props: {
  children: ReactNode;
  collections: readonly JobFinderDeferredCollection[];
  workspace: JobFinderWorkspaceSnapshot;
}) {
  const isHydrating = isJobFinderHydratingCollections(
    props.workspace,
    props.collections,
  );

  if (!isHydrating) {
    return props.children;
  }

  return (
    <WorkspaceStateScreen
      kicker="Job Finder"
      message="We’re loading your saved workspace data from disk. This page will appear here as soon as it is ready."
      title="Loading your workspace"
    />
  );
}

export { JobFinderRouteErrorBoundary };

export function JobFinderCompaniesRoute() {
  const context = useJobFinderPageContext();

  return (
    <JobFinderHydrationGate
      collections={["discovery_jobs", "applications", "intelligence"]}
      workspace={context.workspace}
    >
      <CompaniesScreen
        actionMessage={context.actionState.message}
        companies={context.workspace.intelligence.companies}
        discoveryJobs={context.workspace.companyJobs}
        isMergePending={(companyId) =>
          context.isPending(
            jobFinderPendingActions.companyMergeReview(companyId),
          )
        }
        isMutationPending={(companyId) =>
          context.isPending(
            jobFinderPendingActions.companyIntelligenceMutation(companyId),
          )
        }
        isPreferencePending={(companyId) =>
          context.isPending(
            jobFinderPendingActions.companyPreference(companyId),
          )
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
    </JobFinderHydrationGate>
  );
}

export function JobFinderCompanyDetailRoute() {
  const context = useJobFinderPageContext();
  const { companyId } = useParams<{ companyId: string }>();

  const company =
    context.workspace.intelligence.companies.find(
      (entry) =>
        entry.id === companyId && isListableCompanyName(entry.canonicalName),
    ) ?? null;

  return (
    <JobFinderHydrationGate
      collections={["discovery_jobs", "applications", "intelligence"]}
      workspace={context.workspace}
    >
      {!companyId ? (
        <Navigate replace to="/job-finder/companies" />
      ) : !company ? (
        <WorkspaceStateScreen
          action={{
            label: "View companies",
            onClick: () => context.onNavigateSafely("/job-finder/companies"),
          }}
          kicker="Companies"
          message="This company is no longer in your workspace. No other company was selected."
          title="Company not found"
        />
      ) : (
        <CompanyDetailScreen
          actionMessage={context.actionState.message}
          applicationRecords={context.workspace.applicationRecords}
          companies={context.workspace.intelligence.companies}
          company={company}
          companyId={companyId}
          discoveryJobs={context.workspace.companyJobs}
          isMergePending={(targetCompanyId) =>
            context.isPending(
              jobFinderPendingActions.companyMergeReview(targetCompanyId),
            )
          }
          isMutationPending={(targetCompanyId) =>
            context.isPending(
              jobFinderPendingActions.companyIntelligenceMutation(
                targetCompanyId,
              ),
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
      )}
    </JobFinderHydrationGate>
  );
}

export function JobFinderHomeRoute() {
  const context = useJobFinderPageContext();
  const [activityPending, setActivityPending] = useState(false);
  // A workspace that has not started setup opens guided setup directly; Home
  // is one screen of hallway before it. The redirect is spent immediately so
  // the sidebar's Home destination still works.
  const autoOpenGuidedSetup = shouldAutoOpenGuidedSetup(
    context.workspace.profileSetupState,
  );

  if (autoOpenGuidedSetup) {
    markGuidedSetupAutoOpenSpent();
    return <Navigate replace to="/job-finder/profile/setup" />;
  }

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
      discoveryRunFeedback={context.discoveryRunFeedback}
      discoveryRunPending={context.isPending(
        jobFinderPendingActions.discoveryAll(),
      )}
      browserSessionPending={context.isPending(
        jobFinderPendingActions.browserSession(),
      )}
      onMarkAllCampaignNotificationsRead={
        context.onMarkAllCampaignNotificationsRead
      }
      onMarkCampaignNotificationRead={context.onMarkCampaignNotificationRead}
      onNavigate={context.onNavigateSafely}
      onNavigateGlobalEntry={handleNavigateGlobalEntry}
      onPauseActivity={() =>
        handleActivityControl({ paused: true, reason: "Paused by you." })
      }
      onOpenBrowserSession={() => {
        void context.onOpenBrowserSession();
      }}
      {...(context.onRunAgentDiscovery
        ? { onRunDiscovery: context.onRunAgentDiscovery }
        : {})}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [pending, setPending] = useState(false);
  const [rulePending, setRulePending] = useState(false);
  const [funnelProjection, setFunnelProjection] =
    useState<CampaignRuleFunnelProjection | null>(null);
  const requestedCampaignId = searchParams.get("campaignId");

  useEffect(() => {
    if (!requestedCampaignId) return;
    if (
      !context.workspace.campaigns.some(
        (campaign) => campaign.id === requestedCampaignId,
      )
    ) {
      return;
    }

    const clearRequestedCampaign = () => {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete("campaignId");
      setSearchParams(nextSearchParams, { replace: true });
    };
    if (requestedCampaignId === context.workspace.activeCampaignId) {
      clearRequestedCampaign();
      return;
    }

    setPending(true);
    void context
      .onSelectCampaign(requestedCampaignId)
      .then((selected) => {
        if (selected) clearRequestedCampaign();
      })
      .finally(() => {
        setPending(false);
      });
  }, [
    context.onSelectCampaign,
    context.workspace.activeCampaignId,
    context.workspace.campaigns,
    requestedCampaignId,
    searchParams,
    setSearchParams,
  ]);

  const handleSaveCampaign = (
    campaign: SaveJobSearchCampaignInput,
  ): Promise<boolean> => {
    setPending(true);
    return context.onSaveCampaign(campaign).finally(() => {
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
        })
        .catch(() => {
          setFunnelProjection(null);
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
    void context
      .onToggleCampaignRule(campaignId, ruleId, enabled)
      .then((saved) => {
        if (saved) {
          refreshCampaignRuleFunnel(campaignId);
        }
      });
  };

  const handleRunCampaignNow = (campaignId: string) => {
    void context.onRunCampaignNow(campaignId);
  };

  return (
    <JobFinderHydrationGate
      collections={["discovery_jobs"]}
      workspace={context.workspace}
    >
      <CampaignsScreen
        activeCampaignId={context.workspace.activeCampaignId}
        campaignRuleFunnel={funnelProjection}
        campaignRulePending={rulePending}
        campaigns={context.workspace.campaigns}
        onDeleteCampaign={context.onDeleteCampaign}
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
    </JobFinderHydrationGate>
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
      discoveryRunFeedback={context.discoveryRunFeedback}
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
      onOpenBrowserSessionForTarget={(targetId) => {
        void context.onOpenBrowserSession({ targetId });
      }}
      onProfileSurfaceDirtyChange={context.onProfileSurfaceDirtyChange}
      onProfileSurfaceDraftEdited={context.onProfileSurfaceDraftEdited}
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
      activeDiscoveryRun={context.workspace.activeDiscoveryRun}
      discoveryRuns={context.workspace.recentDiscoveryRuns}
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
    // A setup finished in this session hands off to Find jobs; a completed
    // setup revisited later goes back to the full Profile editor.
    return (
      <Navigate
        replace
        to={
          isProfileSetupJustFinished()
            ? "/job-finder/discovery"
            : "/job-finder/profile"
        }
      />
    );
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
      profileMutationPending={context.isPending(
        jobFinderPendingActions.profileMutation(),
      )}
      latestResumeImportReviewCandidates={
        context.workspace.latestResumeImportReviewCandidates
      }
      latestResumeImportRun={context.workspace.latestResumeImportRun}
      resumeImportProgress={context.resumeImportProgress}
      onApplyProfileCopilotPatchGroup={context.onApplyProfileCopilotPatchGroup}
      onApplyProfileSetupReviewAction={context.onApplyProfileSetupReviewAction}
      onContinueToProfile={context.onOpenProfile}
      onImportResume={context.onImportResume}
      onCancelImportResume={context.onCancelImportResume}
      onProfileSurfaceDirtyChange={context.onProfileSurfaceDirtyChange}
      onProfileSurfaceDraftEdited={context.onProfileSurfaceDraftEdited}
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
      {...(context.workspace.settings.resumeApplicationMode
        ? {
            resumeApplicationMode:
              context.workspace.settings.resumeApplicationMode,
          }
        : {})}
      searchPreferences={context.workspace.searchPreferences}
    />
  );
}

export function JobFinderDiscoveryRoute() {
  const context = useJobFinderPageContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationContext = readJobFinderNavigationContext(searchParams);
  const rapidReviewReturnRoute = readJobFinderReturnRoute(searchParams);
  const [activityPausePending, setActivityPausePending] = useState(false);

  const handleResumeActivity = () => {
    setActivityPausePending(true);
    void context.onSetActivityControl({ paused: false }).finally(() => {
      setActivityPausePending(false);
    });
  };

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
  const requestedJob = navigationContext.jobId
    ? (jobs.find((job) => job.id === navigationContext.jobId) ?? null)
    : null;
  const requestedTarget = navigationContext.targetId
    ? (context.workspace.searchPreferences.discovery.targets.find(
        (target) => target.id === navigationContext.targetId,
      ) ?? null)
    : null;
  const isHydrating = isJobFinderHydratingCollections(context.workspace, [
    "discovery_jobs",
  ]);

  useEffect(() => {
    if (requestedJob && requestedJob.id !== context.selectedDiscoveryJob?.id) {
      context.onSelectDiscoveryJob(requestedJob.id);
    }
  }, [
    context.onSelectDiscoveryJob,
    context.selectedDiscoveryJob?.id,
    requestedJob,
  ]);

  const handleSelectJob = useCallback(
    (jobId: string) => {
      context.onSelectDiscoveryJob(jobId);
      if (navigationContext.jobId) {
        setSearchParams(
          (current) =>
            clearJobFinderContextQuery(
              current,
              JOB_FINDER_CONTEXT_QUERY_KEYS.jobId,
            ),
          { replace: true },
        );
      }
    },
    [context.onSelectDiscoveryJob, navigationContext.jobId, setSearchParams],
  );

  if (isHydrating) {
    return (
      <JobFinderHydrationGate
        collections={["discovery_jobs"]}
        workspace={context.workspace}
      >
        {null}
      </JobFinderHydrationGate>
    );
  }

  if (navigationContext.jobId && !requestedJob) {
    return (
      <WorkspaceStateScreen
        action={{
          label: "Show all jobs",
          onClick: () => context.onNavigateSafely("/job-finder/discovery"),
        }}
        kicker="Find jobs"
        message="The requested job is no longer available in the active search plan, so no other job was selected."
        title="Job unavailable"
      />
    );
  }

  if (navigationContext.targetId && !requestedTarget) {
    return (
      <WorkspaceStateScreen
        action={{
          label: "Show all jobs",
          onClick: () => context.onNavigateSafely("/job-finder/discovery"),
        }}
        kicker="Find jobs"
        message="The requested job source is no longer configured, so no other source was selected."
        title="Job source unavailable"
      />
    );
  }

  const selectedJob = selectJobFinderContext(
    jobs,
    navigationContext.jobId,
    context.selectedDiscoveryJob?.id,
    (job) => job.id,
  );

  return (
    <JobFinderHydrationGate
      collections={["discovery_jobs"]}
      workspace={context.workspace}
    >
      <DiscoveryScreen
        actionState={context.actionState}
        activityPaused={context.workspace.activityControl?.paused ?? false}
        activeRun={context.workspace.activeDiscoveryRun}
        browserSession={context.workspace.browserSession}
        companies={context.workspace.intelligence.companies}
        discoveryRunFeedback={context.discoveryRunFeedback}
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
        isActivityPausePending={activityPausePending}
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
        onPreviewEmployerExclusion={context.onPreviewEmployerExclusion}
        onRemoveEmployerExclusion={context.onRemoveEmployerExclusion}
        onRestoreDismissedJob={context.onRestoreDismissedJob}
        {...(rapidReviewReturnRoute
          ? {
              onBackToRapidReview: () =>
                context.onNavigateSafely(JOB_FINDER_RETURN_ROUTES.rapidReview),
            }
          : {})}
        onOpenBrowserSession={() => {
          void context.onOpenBrowserSession();
        }}
        onResumeActivity={handleResumeActivity}
        onOpenBrowserSessionForTarget={(targetId) => {
          void context.onOpenBrowserSession({ targetId });
        }}
        onOpenCompany={(companyId) =>
          context.onNavigateSafely(`/job-finder/companies/${companyId}`)
        }
        onQueueJob={context.onQueueJob}
        onRunAgentDiscovery={context.onRunAgentDiscovery}
        {...(context.onCancelDiscovery
          ? { onCancelDiscovery: context.onCancelDiscovery }
          : {})}
        {...(context.onRunDiscoveryForTarget
          ? { onRunDiscoveryForTarget: context.onRunDiscoveryForTarget }
          : {})}
        onSelectJob={handleSelectJob}
        preserveSelectedJob={Boolean(navigationContext.jobId)}
        recentRuns={context.workspace.recentDiscoveryRuns}
        searchPreferences={context.workspace.searchPreferences}
        selectedSourceTargetId={requestedTarget?.id ?? null}
        selectedJob={selectedJob}
        sourceAccessPrompts={context.workspace.sourceAccessPrompts}
      />
    </JobFinderHydrationGate>
  );
}

export function JobFinderRapidReviewRoute() {
  const context = useJobFinderPageContext();
  const { campaign, jobs, log } = useMemo(
    () => selectRapidReviewScope(context.workspace),
    [context.workspace],
  );

  if (!campaign) {
    return <Navigate replace to="/job-finder/campaigns" />;
  }

  return (
    <JobFinderHydrationGate
      collections={["discovery_jobs", "intelligence"]}
      workspace={context.workspace}
    >
      <RapidReviewScreen
        campaignId={campaign.id}
        campaignName={campaign.name}
        jobs={jobs}
        log={log}
        onInspectJob={(jobId) => {
          context.onSelectDiscoveryJob(jobId);
          context.onNavigateSafely(
            buildJobFinderContextRoute("/job-finder/discovery", {
              jobId,
              returnTo: JOB_FINDER_RETURN_ROUTES.rapidReview,
            }),
          );
        }}
        onMutate={context.onMutateRapidReview}
        pending={context.isPending(jobFinderPendingActions.rapidReview())}
      />
    </JobFinderHydrationGate>
  );
}

export function JobFinderReviewQueueRoute() {
  // The shortlist mounts its real heading on the first commit: no deferred
  // surface timer, no placeholder, and no Suspense throttle in front of the
  // canonical screen.
  return <JobFinderReviewQueueRouteContent />;
}

function JobFinderReviewQueueRouteContent() {
  const context = useJobFinderPageContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationContext = readJobFinderNavigationContext(searchParams);
  const activeCampaign = context.workspace.campaigns.find(
    (campaign) => campaign.id === context.workspace.activeCampaignId,
  );
  const campaignJobIds = new Set(activeCampaign?.jobIds ?? []);
  const queue = context.workspace.reviewQueue.filter((item) =>
    campaignJobIds.has(item.jobId),
  );
  const requestedItem = navigationContext.jobId
    ? (queue.find((item) => item.jobId === navigationContext.jobId) ?? null)
    : null;
  const isHydrating = isJobFinderHydratingCollections(context.workspace, [
    "discovery_jobs",
    "review_queue",
    "documents",
  ]);

  useEffect(() => {
    if (
      requestedItem &&
      requestedItem.jobId !== context.selectedReviewItem?.jobId
    ) {
      context.onSelectReviewItem(requestedItem.jobId);
    }
  }, [
    context.onSelectReviewItem,
    context.selectedReviewItem?.jobId,
    requestedItem,
  ]);

  const handleSelectItem = useCallback(
    (jobId: string) => {
      context.onSelectReviewItem(jobId);
      if (navigationContext.jobId) {
        setSearchParams(
          (current) =>
            clearJobFinderContextQuery(
              current,
              JOB_FINDER_CONTEXT_QUERY_KEYS.jobId,
            ),
          { replace: true },
        );
      }
    },
    [context.onSelectReviewItem, navigationContext.jobId, setSearchParams],
  );

  if (isHydrating) {
    return (
      <JobFinderHydrationGate
        collections={["discovery_jobs", "review_queue", "documents"]}
        workspace={context.workspace}
      >
        {null}
      </JobFinderHydrationGate>
    );
  }

  if (navigationContext.jobId && !requestedItem) {
    return (
      <WorkspaceStateScreen
        action={{
          label: "Show all shortlisted jobs",
          onClick: () => context.onNavigateSafely("/job-finder/review-queue"),
        }}
        kicker="Shortlisted"
        message="The requested job is no longer in Shortlisted, so no other job was selected."
        title="Shortlisted job unavailable"
      />
    );
  }

  const selectedItem = selectJobFinderContext(
    queue,
    navigationContext.jobId,
    context.selectedReviewItem?.jobId,
    (item) => item.jobId,
  );
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
    <JobFinderHydrationGate
      collections={["discovery_jobs", "review_queue", "documents"]}
      workspace={context.workspace}
    >
      <ReviewQueueScreen
        actionState={context.actionState}
        applicationRecords={context.workspace.applicationRecords}
        browserSession={context.workspace.browserSession}
        campaignId={activeCampaign?.id ?? ""}
        campaignDefaultResumeStrategyId={
          activeCampaign?.applicationPolicy.defaultResumeStrategyId ?? null
        }
        draftPreparation={context.tailoredDraftPreparation}
        globalDailyApplicationPreparationCapacity={
          context.workspace.dashboard
            ?.globalDailyApplicationPreparationCapacity ?? null
        }
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
        onPrepareTailoredDrafts={context.onPrepareTailoredDrafts}
        onStopTailoredDraftPreparation={context.onStopTailoredDraftPreparation}
        onRecommendResumeStrategy={context.onRecommendResumeStrategy}
        onSelectResumeStrategy={context.onSelectResumeStrategy}
        onSetCampaignResumeStrategyDefault={
          context.onSetCampaignResumeStrategyDefault
        }
        onStartAutoApplyQueue={context.onStartAutoApplyQueue}
        onStartApplyCopilot={context.onStartApplyCopilot}
        onEditResumeWorkspace={context.onEditResumeWorkspace}
        onGenerateResume={context.onGenerateResume}
        onOpenBrowserSession={() => {
          void context.onOpenBrowserSession();
        }}
        onOpenJobDetails={(jobId) => {
          context.onSelectDiscoveryJob(jobId);
          context.onNavigateSafely("/job-finder/discovery");
        }}
        onOpenProfile={context.onOpenProfile}
        onRemoveReviewJob={context.onRemoveReviewJob}
        onSetJobResumeApplicationMode={context.onSetJobResumeApplicationMode}
        onSelectItem={handleSelectItem}
        originalResume={context.workspace.profile.baseResume}
        queue={queue}
        resumeStrategies={context.workspace.intelligence.resumeStrategies}
        resumeStrategySelections={
          context.workspace.intelligence.resumeStrategySelections
        }
        selectedAsset={selectedAsset}
        selectedItem={selectedItem}
        selectedJob={selectedJob}
        tailoredAssets={context.workspace.tailoredAssets}
      />
    </JobFinderHydrationGate>
  );
}

export function JobFinderResumeWorkspaceRoute() {
  const context = useJobFinderPageContext();
  const { jobId } = useParams<{ jobId: string }>();

  if (!jobId) {
    return <Navigate replace to="/job-finder/review-queue" />;
  }

  const routeState = resolveResumeWorkspaceRouteState({
    hydration: context.workspace.hydration,
    jobId,
    reviewQueue: context.workspace.reviewQueue,
  });

  if (routeState.kind === "hydrating") {
    return (
      <JobFinderHydrationGate
        collections={RESUME_WORKSPACE_REQUIRED_COLLECTIONS}
        workspace={context.workspace}
      >
        {null}
      </JobFinderHydrationGate>
    );
  }

  if (routeState.kind === "unavailable") {
    // The job genuinely left the hydrated shortlist. Do not silently bounce
    // the URL: keep the route and explain why, so a background refresh that
    // recomputes the queue (or a stale deep link) never yanks the operator.
    return (
      <WorkspaceStateScreen
        action={{
          label: "View Shortlisted",
          onClick: () => context.onNavigateSafely("/job-finder/review-queue"),
        }}
        kicker="Resume workspace"
        message="This resume is no longer available because the job is no longer in Shortlisted. Choose another shortlisted job to keep preparing."
        title="Resume no longer available"
      />
    );
  }

  return (
    <JobFinderHydrationGate
      collections={RESUME_WORKSPACE_REQUIRED_COLLECTIONS}
      workspace={context.workspace}
    >
      <ResumeWorkspaceScreen
        actionMessage={context.actionState.message}
        assistantMessages={context.resumeAssistantMessages}
        availableResumeTemplates={context.workspace.availableResumeTemplates}
        assistantPending={context.resumeAssistantPending}
        isExportPending={context.isPending(
          jobFinderPendingActions.resumeExport(jobId),
        )}
        isWorkspacePending={context.isPending(
          jobFinderPendingActions.resumeJob(jobId),
        )}
        jobId={jobId}
        onApproveCurrentResume={context.onApproveCurrentResume}
        onApproveResume={context.onApproveResume}
        onBack={() => context.onEditResumeWorkspace("")}
        onPrepareApplication={() => context.onStartApplyCopilot({ jobId })}
        onClearResumeApproval={context.onClearResumeApproval}
        onSetWorkHistoryReviewAcknowledgment={
          context.onSetWorkHistoryReviewAcknowledgment
        }
        onSetResumeClaimConfirmation={context.onSetResumeClaimConfirmation}
        onExportPdf={context.onExportResumePdf}
        onApplyPatch={context.onApplyResumePatch}
        onDirtyChange={context.onResumeWorkspaceDirtyChange}
        onDraftEdited={context.onResumeWorkspaceDraftEdited}
        onPreviewDraft={context.onPreviewResumeDraft}
        onRefresh={() => context.onRefreshResumeWorkspace(jobId)}
        onRegenerateDraft={context.onRegenerateResumeDraft}
        onRestoreRevision={context.onRestoreResumeDraftRevision}
        onSaveDraft={context.onSaveResumeDraft}
        onSaveDraftAndThen={context.onSaveResumeDraftAndThen}
        onSendAssistantMessage={context.onSendResumeAssistantMessage}
        onResolveAssistantProposal={context.onResolveResumeAssistantProposal}
        workspace={context.resumeWorkspace}
      />
    </JobFinderHydrationGate>
  );
}

/**
 * The stage tracker is a separate destination on the same route, so opening it
 * is a link with a URL instead of a peer tab that renders a full CRM beside a
 * single application. The pathname is unchanged, so shell navigation keeps
 * Applications highlighted and the deep link survives a reload.
 */
const APPLICATIONS_VIEW_QUERY_KEY = "view";

/**
 * Used when a browser hand-off fails without a readable cause reaching this
 * layer: either it rejected without a message, or the action runner already
 * consumed the error into its own route message and reported only `false`.
 * The status still has to be truthful about the failure, so it reports the
 * failure without inventing a cause.
 */
const HANDOFF_FAILED_FALLBACK_REASON = "";

/**
 * The five states main refuses to transition. `assertTransitionable` throws for
 * every one of them, so a request in any of these is finished as far as this
 * page is concerned — treating only `resolved` as finished would let a
 * superseded row stand in for a live one.
 */
const TERMINAL_USER_ACTION_STATES: ReadonlySet<UserActionRequestState> =
  new Set(["resolved", "skipped", "cancelled", "expired", "superseded"]);

/**
 * Runs the Applications browser hand-off and reports what it actually did.
 *
 * The exact pending request for this paused run gets the same Needs-you
 * "open browser step" command, under the same browser-only credentials policy
 * and no-submit authority. Without such a request there is no recorded
 * destination to reopen, so all that can be done is open the window itself —
 * which Applications used to describe as "Opened in the Job Finder browser.
 * Switch to that window to finish the step", sending the user to a window
 * that never showed the step. Each branch returns its own outcome so the
 * status beside the control can say the same thing the app did.
 *
 * Both hands are asynchronous, and the outcome is decided only once the one
 * that ran has settled. An earlier revision wrapped a call whose promise was
 * discarded by its own context wrapper in `try`/`catch`: nothing could ever
 * throw synchronously, so the `failed` branch was unreachable and a failing
 * IPC still rendered "Opened in the Job Finder browser" beside a route banner
 * carrying the error. A resolved `false` — the action runner's own report that
 * the command failed — is a failure here too, not a silent success.
 *
 * Nothing here submits or authorizes a submission: the command carries
 * `submitAuthorized: false` and `accountCreationAuthorized: false`, and the
 * window is opened for the person to finish the step themselves.
 */
export async function runJobFinderApplicationBrowserHandoff(input: {
  onOpenBrowserSession: () => void | Promise<boolean>;
  onPerformUserAction: (
    command: UserActionCommandInput,
  ) => void | Promise<boolean>;
  requests: JobFinderWorkspaceSnapshot["userActionRequests"];
  target: FinishInBrowserInput;
}): Promise<FinishInBrowserOutcome> {
  const request = (input.requests ?? []).find(
    (candidate) =>
      // A superseded, cancelled, expired or skipped request is one main
      // refuses to transition, so aiming the open at it could only ever fail.
      !TERMINAL_USER_ACTION_STATES.has(candidate.state) &&
      candidate.scope.type === "application" &&
      candidate.scope.runId === input.target.runId &&
      candidate.scope.jobId === input.target.jobId,
  );

  if (request) {
    try {
      const opened = await input.onPerformUserAction({
        requestId: request.id,
        commandId: `user_action_open_page_${globalThis.crypto.randomUUID()}`,
        expectedRevision: request.revision,
        action: "open_page",
        credentialsPolicy: "browser_only",
        submitAuthorized: false,
        accountCreationAuthorized: false,
      });

      if (opened === false) {
        return { kind: "failed", reason: HANDOFF_FAILED_FALLBACK_REASON };
      }
    } catch (error) {
      return {
        kind: "failed",
        reason:
          getJobFinderErrorDetail(error) ?? HANDOFF_FAILED_FALLBACK_REASON,
      };
    }

    return { kind: "opened_application_page" };
  }

  try {
    const opened = await input.onOpenBrowserSession();

    if (opened === false) {
      return { kind: "failed", reason: HANDOFF_FAILED_FALLBACK_REASON };
    }
  } catch (error) {
    return {
      kind: "failed",
      reason: getJobFinderErrorDetail(error) ?? HANDOFF_FAILED_FALLBACK_REASON,
    };
  }

  return { kind: "opened_browser_only" };
}

/**
 * The one request "Check whether this step is done" can actually act on for the
 * selected application. It gates the control, supplies the in-place status, and
 * is the request the command is sent for, so it has to be both actionable and
 * the selected record's own.
 *
 * Actionable: a request that has been superseded, cancelled, expired, or
 * skipped cannot be transitioned. A second run of the same job supersedes the
 * first run's request with the newer request's timestamp, and requests arrive
 * sorted by `updatedAt` descending then id ascending, so on that tie the older
 * superseded row can sort ahead of the live one — matching on
 * `state !== "resolved"` would aim the command at a request main throws on.
 *
 * The selected record's own: requests carry their own `applicationRecordId`,
 * and a job shared by two campaigns has two records with two separate blockers.
 * The record match is preferred so a click here can never confirm — and retry —
 * another record's application; a request that records no id at all still falls
 * back to the job match, which is all such rows can be matched on.
 */
function findPendingBrowserStepRequest(
  requests: JobFinderWorkspaceSnapshot["userActionRequests"],
  selectedRecord: { id: string; jobId: string } | null,
) {
  if (!selectedRecord) {
    return null;
  }

  const candidates = requests ?? [];

  return (
    candidates.find(
      (candidate) =>
        !TERMINAL_USER_ACTION_STATES.has(candidate.state) &&
        candidate.scope.type === "application" &&
        candidate.scope.jobId === selectedRecord.jobId &&
        candidate.scope.applicationRecordId === selectedRecord.id,
    ) ??
    candidates.find(
      (candidate) =>
        !TERMINAL_USER_ACTION_STATES.has(candidate.state) &&
        candidate.scope.type === "application" &&
        candidate.scope.jobId === selectedRecord.jobId &&
        (candidate.scope.applicationRecordId ?? null) === null,
    ) ??
    null
  );
}

export function JobFinderApplicationsRoute() {
  const context = useJobFinderPageContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const trackerView =
    searchParams.get(APPLICATIONS_VIEW_QUERY_KEY) === "tracker"
      ? ("crm" as const)
      : ("workflow" as const);
  const navigationContext = readJobFinderNavigationContext(searchParams);
  const {
    activeCampaign,
    applicationAttempts,
    applicationRecords,
    applyJobResults,
    applyRuns,
    discoveryJobs,
    selectedApplyRunId,
  } = useMemo(
    () => selectCampaignApplicationsScope(context.workspace),
    [context.workspace],
  );
  const requestedApplicationRecord = (() => {
    if (navigationContext.applicationRecordId) {
      const record = applicationRecords.find(
        (candidate) =>
          candidate.id === navigationContext.applicationRecordId &&
          (!navigationContext.jobId ||
            candidate.jobId === navigationContext.jobId),
      );
      return record ?? null;
    }

    if (navigationContext.jobId) {
      const matchingRecords = applicationRecords.filter(
        (record) => record.jobId === navigationContext.jobId,
      );
      return matchingRecords.length === 1 ? (matchingRecords[0] ?? null) : null;
    }

    return null;
  })();
  const hasRequestedApplicationContext = Boolean(
    navigationContext.applicationRecordId || navigationContext.jobId,
  );
  const isHydrating = isJobFinderHydratingCollections(context.workspace, [
    "discovery_jobs",
    "applications",
    "intelligence",
  ]);

  useEffect(() => {
    if (
      requestedApplicationRecord &&
      requestedApplicationRecord.id !== context.selectedApplicationRecord?.id
    ) {
      context.onSelectApplicationRecord(requestedApplicationRecord.id);
    }
  }, [
    context.onSelectApplicationRecord,
    context.selectedApplicationRecord?.id,
    requestedApplicationRecord,
  ]);

  const handleSelectRecord = useCallback(
    (recordId: string) => {
      context.onSelectApplicationRecord(recordId);
      if (hasRequestedApplicationContext) {
        setSearchParams(
          (current) => {
            const next = clearJobFinderContextQuery(
              current,
              JOB_FINDER_CONTEXT_QUERY_KEYS.applicationRecordId,
            );
            return clearJobFinderContextQuery(
              next,
              JOB_FINDER_CONTEXT_QUERY_KEYS.jobId,
            );
          },
          { replace: true },
        );
      }
    },
    [
      context.onSelectApplicationRecord,
      hasRequestedApplicationContext,
      setSearchParams,
    ],
  );

  if (isHydrating) {
    return (
      <JobFinderHydrationGate
        collections={["discovery_jobs", "applications", "intelligence"]}
        workspace={context.workspace}
      >
        {null}
      </JobFinderHydrationGate>
    );
  }

  if (hasRequestedApplicationContext && !requestedApplicationRecord) {
    return (
      <WorkspaceStateScreen
        action={{
          label: "Show all applications",
          onClick: () => context.onNavigateSafely("/job-finder/applications"),
        }}
        kicker="Applications"
        message="The requested application is no longer available or is not unique, so no other application was selected."
        title="Application unavailable"
      />
    );
  }

  const selectedRecord =
    requestedApplicationRecord ??
    selectJobFinderContext(
      applicationRecords,
      null,
      context.selectedApplicationRecord?.id,
      (record) => record.id,
    );
  const selectedAttempt = selectedRecord
    ? (applicationAttempts.find(
        (attempt) =>
          attempt.id === context.selectedApplicationAttempt?.id &&
          attempt.applicationRecordId === selectedRecord.id,
      ) ??
      applicationAttempts
        .filter((attempt) => attempt.applicationRecordId === selectedRecord.id)
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        )[0] ??
      null)
    : null;
  // "I finished this step" starts a background verification. Its resolution
  // lives on the request itself — `verifying` while the check runs and
  // `still_blocked` when the page still shows the step — so Applications reads
  // that request instead of only reporting that the command was sent.
  const pendingBrowserStepRequest = findPendingBrowserStepRequest(
    context.workspace.userActionRequests ?? [],
    selectedRecord,
  );
  const isBrowserStepCheckPending =
    pendingBrowserStepRequest !== null &&
    (context.isPending(
      jobFinderPendingActions.userAction(pendingBrowserStepRequest.id),
    ) ||
      pendingBrowserStepRequest.state === "verifying");
  const confirmFinishedInBrowserStatus: ConfirmFinishedInBrowserStatus =
    isBrowserStepCheckPending
      ? "checking"
      : pendingBrowserStepRequest?.state === "still_blocked"
        ? "still_blocked"
        : "idle";
  const confirmFinishedInBrowserBlockerText =
    confirmFinishedInBrowserStatus === "still_blocked"
      ? (pendingBrowserStepRequest?.summary ?? null)
      : null;

  return (
    <JobFinderHydrationGate
      collections={["discovery_jobs", "applications", "intelligence"]}
      workspace={context.workspace}
    >
      <ApplicationsScreen
        actionMessage={context.actionState.message}
        applicationAttempts={applicationAttempts}
        applicationRecords={applicationRecords}
        applyRuns={applyRuns}
        applyJobResults={applyJobResults}
        companies={context.workspace.intelligence.companies}
        dailyPreparationCapacity={
          context.workspace.dashboard
            ?.globalDailyApplicationPreparationCapacity ?? null
        }
        crmSettings={
          context.workspace.settings.applicationCrm ??
          defaultApplicationCrmSettings()
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
        onResolveSubmissionOutcome={context.onResolveSubmissionOutcome}
        onExportApplicationCrm={context.onExportApplicationCrm}
        onMutateApplicationCrm={context.onMutateApplicationCrm}
        onMutateApplicationCrmBulkStage={
          context.onMutateApplicationCrmBulkStage
        }
        onRecordOutcome={async (input) => {
          const completed = await context.onRecordOutcome(input);
          if (!completed) {
            throw new Error("The outcome could not be recorded.");
          }
        }}
        isRecordOutcomePending={(jobId) =>
          context.isPending(jobFinderPendingActions.recordOutcome(jobId))
        }
        outcomeCampaignId={activeCampaign?.id ?? null}
        getOutcomeResumeStrategyId={(jobId) =>
          context.workspace.intelligence.resumeStrategySelections.find(
            (selection) => selection.jobId === jobId,
          )?.strategyId ?? null
        }
        onResolveApplyConsentRequest={context.onResolveApplyConsentRequest}
        onRevokeApplyRunApproval={context.onRevokeApplyRunApproval}
        onStartAutoApplyQueue={(jobIds) => {
          void context.onStartAutoApplyQueue(jobIds);
        }}
        onStartApplyCopilot={context.onStartApplyCopilot}
        onStartAutoApply={context.onStartAutoApply}
        onSelectRecord={handleSelectRecord}
        selectedApplyRunId={selectedApplyRunId}
        selectedAttempt={selectedAttempt}
        selectedRecord={selectedRecord}
        safeguardsBlockerCount={countActiveSafeguardBlockers(
          context.workspace.intelligence.safeguards,
        )}
        onOpenSafeguards={() =>
          context.onNavigateSafely("/job-finder/safeguards")
        }
        onFinishInBrowser={(input) =>
          runJobFinderApplicationBrowserHandoff({
            // `rethrowError` is passed HERE and nowhere else. Every other
            // caller of these two actions fires and forgets, and keeps the
            // action runner's own behaviour: report the failure once as a route
            // message and resolve `false`. This one reports the failure in
            // place, so it needs the cause the boolean cannot carry —
            // without it the status read "The Job Finder browser did not open"
            // with nothing where the reason belongs.
            onOpenBrowserSession: () =>
              context.onOpenBrowserSession(undefined, { rethrowError: true }),
            onPerformUserAction: (command) =>
              context.onPerformUserAction(command, { rethrowError: true }),
            requests: context.workspace.userActionRequests,
            target: input,
          })
        }
        canConfirmFinishedInBrowser={pendingBrowserStepRequest !== null}
        confirmFinishedInBrowserStatus={confirmFinishedInBrowserStatus}
        confirmFinishedInBrowserBlockerText={
          confirmFinishedInBrowserBlockerText
        }
        onConfirmFinishedInBrowser={() => {
          // The exact "Step is complete" command Needs you sends, for the one
          // request this control is enabled by. The control used to be gated
          // on that request while the command ran a second, run-scoped lookup
          // and returned silently when it matched nothing, so a request left
          // over from an earlier run rendered an enabled control whose click
          // did nothing. Gate, in-place status, and command now read the same
          // request, and that request is chosen to be one main can act on —
          // non-terminal and belonging to the selected record — so an enabled
          // control has a live step to send. The page that sent the user to
          // the browser is the page that verifies the return, under the same
          // browser-only credentials policy and no-submit authority; main
          // still re-checks the exact lineage through the request id and
          // revision below.
          const request = pendingBrowserStepRequest;

          if (!request) {
            return;
          }

          void context.onPerformUserAction({
            requestId: request.id,
            commandId: `user_action_confirm_done_${globalThis.crypto.randomUUID()}`,
            expectedRevision: request.revision,
            action: "confirm_done",
            credentialsPolicy: "browser_only",
            submitAuthorized: false,
            accountCreationAuthorized: false,
          });
        }}
        {...(trackerView ? { workspaceView: trackerView } : {})}
        onWorkspaceViewChange={(view) =>
          setSearchParams(
            (current) => {
              const next = new URLSearchParams(current);
              if (view === "crm") {
                next.set(APPLICATIONS_VIEW_QUERY_KEY, "tracker");
              } else {
                next.delete(APPLICATIONS_VIEW_QUERY_KEY);
              }
              return next;
            },
            { replace: true },
          )
        }
      />
    </JobFinderHydrationGate>
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
  const scope = useMemo(
    () => selectJobFinderActionsScope(context),
    // Only the fields selectJobFinderActionsScope reads: the outlet context
    // object identity changes on every parent render, so depending on it
    // would defeat the memo.
    [
      context.workspace.intelligence.groupedDecisions,
      context.isPending,
      context.onApplyGroupedManualAnswer,
      context.onProjectGroupedManualAnswer,
      context.onSnoozeGroupedDecision,
    ],
  );

  return (
    <JobFinderHydrationGate
      collections={["discovery_jobs", "applications", "intelligence"]}
      workspace={context.workspace}
    >
      <ActionsScreen
        applicationAttempts={context.workspace.applicationAttempts}
        applicationRecords={context.workspace.applicationRecords}
        discoveryJobs={context.workspace.discoveryJobs}
        groupedDecisions={scope.groupedDecisions}
        isGroupedApplyPending={scope.isGroupedApplyPending}
        isGroupedProjectPending={scope.isGroupedProjectPending}
        isGroupedSnoozePending={scope.isGroupedSnoozePending}
        isPending={(requestId) =>
          context.isPending(jobFinderPendingActions.userAction(requestId))
        }
        onApplyGroupedManualAnswer={scope.onApplyGroupedManualAnswer}
        onCommand={(command) => {
          void context.onPerformUserAction(command);
        }}
        onNavigate={context.onNavigateSafely}
        onProjectGroupedManualAnswer={scope.onProjectGroupedManualAnswer}
        onSnoozeGroupedDecision={scope.onSnoozeGroupedDecision}
        profile={context.workspace.profile}
        requests={context.workspace.userActionRequests ?? []}
      />
    </JobFinderHydrationGate>
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
  const scope = useMemo(
    () => selectOutcomeAnalyticsScope(context.workspace),
    [context.workspace],
  );
  return (
    <JobFinderHydrationGate
      collections={["applications", "intelligence"]}
      workspace={context.workspace}
    >
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
    </JobFinderHydrationGate>
  );
}

export function JobFinderSettingsRoute() {
  const context = useJobFinderPageContext();

  return (
    <SettingsScreen
      availableResumeTemplates={context.workspace.availableResumeTemplates}
      browserSession={context.workspace.browserSession}
      isWorkspaceResetPending={context.isPending(
        jobFinderPendingActions.workspaceReset(),
      )}
      onResetWorkspace={context.onResetWorkspace}
      onSettingsDraftEdited={context.onSettingsDraftEdited}
      // Pass-through on purpose: these handlers resolve false when a save
      // did not commit, and each section needs the real promise so its
      // pending state lasts for the IPC call and false can surface as a
      // failure instead of a local saved message.
      onUpdateAppearanceTheme={context.onUpdateAppearanceTheme}
      onUpdateApplicationDefaults={context.onUpdateApplicationDefaults}
      onUpdateTrackerCrm={context.onUpdateTrackerCrm}
      onUpdateWorkspaceBehavior={context.onUpdateWorkspaceBehavior}
      settings={context.workspace.settings}
    />
  );
}

export function JobFinderDocumentsRoute() {
  return <DocumentsScreen />;
}

export function JobFinderSafeguardsRoute() {
  const context = useJobFinderPageContext();

  return (
    <JobFinderHydrationGate
      collections={["applications", "intelligence"]}
      workspace={context.workspace}
    >
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
    </JobFinderHydrationGate>
  );
}

export function JobFinderResumeStrategiesRoute() {
  const context = useJobFinderPageContext();
  const intelligence = context.workspace.intelligence;
  const candidateDocumentIds = context.workspace.tailoredAssets.map(
    (asset) => asset.id,
  );

  return (
    <JobFinderHydrationGate
      collections={["documents", "intelligence"]}
      workspace={context.workspace}
    >
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
    </JobFinderHydrationGate>
  );
}
