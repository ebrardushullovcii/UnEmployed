import type {
  CampaignNotification,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { BriefcaseBusiness } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { JobFinderActivityControl } from "../../components/job-finder-activity-control";
import { JobFinderGlobalSearch } from "../../components/job-finder-global-search";
import { CampaignNotificationCenter } from "../../components/campaign-notification-center";
import { StatusBadge } from "../../components/status-badge";
import { buildJobFinderGlobalSearchEntries } from "../../lib/build-job-finder-global-search-entries";
import type { JobFinderGlobalSearchEntry } from "../../lib/job-finder-global-search";

function Metric(props: { label: string; value: number | string }) {
  return (
    <div className="grid gap-1 rounded-(--radius-field) border border-border-subtle bg-(--surface-panel-raised) p-4">
      <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
        {props.label}
      </span>
      <strong className="text-2xl text-(--text-headline)">{props.value}</strong>
    </div>
  );
}

export function JobSearchHomeScreen(props: {
  activityPending: boolean;
  campaignNotificationError?: string | null;
  campaignNotificationPending?: (notificationId: string) => boolean;
  campaignNotificationAllPending?: boolean;
  campaignNotifications?: readonly CampaignNotification[];
  onMarkAllCampaignNotificationsRead?: () => void;
  onMarkCampaignNotificationRead?: (notificationId: string) => void;
  onNavigate: (path: string) => void;
  onNavigateGlobalEntry: (entry: JobFinderGlobalSearchEntry) => void;
  onPauseActivity: () => void;
  onResumeActivity: () => void;
  onSelectCampaign: (campaignId: string) => void;
  workspace: JobFinderWorkspaceSnapshot;
}) {
  const { dashboard } = props.workspace;
  const activeCampaign = props.workspace.campaigns.find(
    (campaign) => campaign.id === props.workspace.activeCampaignId,
  );
  const activeSearchPlanVolume = activeCampaign
    ? activeCampaign.mode === "scale"
      ? "Scale volume"
      : "Precision volume"
    : "Unknown volume";
  const globalEntries = buildJobFinderGlobalSearchEntries(props.workspace);
  const activeBrowserCount =
    (props.workspace.activeDiscoveryRun?.state === "running" ? 1 : 0) +
    (props.workspace.activeSourceDebugRun?.state === "running" ? 1 : 0);
  const activeApplicationCount = props.workspace.applyRuns.filter(
    (run) => run.state === "running",
  ).length;
  const profileSetupState = props.workspace.profileSetupState;
  const hasIncompleteProfileSetup = profileSetupState?.status !== "completed";
  const profileSetupStepLabel =
    {
      import: "resume import",
      essentials: "your basics",
      background: "your work history",
      targeting: "your job targets",
      narrative: "your professional story",
      answers: "your application answers",
      ready_check: "your readiness review",
    }[profileSetupState?.currentStep ?? "import"] ?? "your profile setup";

  const isZeroMetrics =
    dashboard.jobsFoundToday === 0 &&
    dashboard.jobsAwaitingReview === 0 &&
    dashboard.applicationsReadyForApproval === 0 &&
    dashboard.needsYouCount === 0 &&
    dashboard.applicationsAppliedToday === 0 &&
    dashboard.applicationsAppliedThisWeek === 0 &&
    dashboard.upcomingInterviews === 0 &&
    dashboard.upcomingFollowUps === 0;

  const hasNoSources = dashboard.sourceHealth.total === 0;
  const hasSourceHealthAttention = dashboard.sourceHealth.needsAttention > 0;
  const hasSearchHistory =
    (activeCampaign?.history?.some((entry) => entry.kind === "discovery_run") ??
      false) ||
    (props.workspace.recentDiscoveryRuns?.length ?? 0) > 0;
  const sourcesReadyButNoMetrics =
    !hasNoSources && isZeroMetrics && !hasSearchHistory;
  const showZeroGuidance =
    isZeroMetrics && (hasNoSources || sourcesReadyButNoMetrics);

  const profileJobSourcesRoute =
    "/job-finder/profile?section=sources&focus=job-sources#profile-job-sources";
  const profileSetupRoute = "/job-finder/profile/setup";

  const effectiveRecommendedNext = hasIncompleteProfileSetup
    ? {
        label: "Finish your profile",
        detail: `Continue with ${profileSetupStepLabel}. Finish your profile first so Job Finder can use your job targets, sources, and resume tailoring when you search.`,
        route: profileSetupRoute,
      }
    : hasNoSources
      ? {
          label: "Set up job sources",
          detail:
            "Add at least one enabled job source in Profile to start discovering relevant openings. You can enable a public board like Greenhouse or Lever in seconds.",
          route: profileJobSourcesRoute,
        }
      : showZeroGuidance
        ? {
            label: "Run your first search",
            detail:
              "Your job sources are ready. Run the active search plan to collect your first openings and see metrics here.",
            route: "/job-finder/discovery",
          }
        : dashboard.recommendedNextAction;

  const sourceHealthBadgeTone = hasNoSources
    ? "critical"
    : hasSourceHealthAttention
      ? "critical"
      : dashboard.sourceHealth.healthy > 0
        ? "positive"
        : "muted";

  const sourceHealthBadgeLabel = hasNoSources
    ? "No job sources configured"
    : `${dashboard.sourceHealth.healthy} healthy · ${dashboard.sourceHealth.needsAttention} need attention · ${dashboard.sourceHealth.running} running`;

  return (
    <section className="grid gap-5 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          compact
          eyebrow="Job Finder"
          title="Today"
          description="See what is moving, what needs you, and the best next step for your active search plan."
        />
        <JobFinderActivityControl
          onPause={props.onPauseActivity}
          onResume={props.onResumeActivity}
          state={{
            activeApplicationCount,
            activeBrowserCount,
            paused: props.workspace.activityControl.paused,
            pausedAt: props.workspace.activityControl.pausedAt,
            pending: props.activityPending,
          }}
        />
      </div>

      <div
        aria-label="Source health"
        className="flex flex-wrap items-center gap-2"
        data-testid="source-health-badge-top"
      >
        <StatusBadge tone={sourceHealthBadgeTone}>
          {sourceHealthBadgeLabel}
        </StatusBadge>
        <span className="text-xs text-foreground-muted">
          {dashboard.sourceHealth.total} enabled source
          {dashboard.sourceHealth.total === 1 ? "" : "s"} in this search plan
          {hasNoSources
            ? hasIncompleteProfileSetup
              ? " • Finish your profile first"
              : " • Add a source in Profile"
            : ""}
        </span>
        {hasNoSources && !hasIncompleteProfileSetup ? (
          <Button
            onClick={() => props.onNavigate(profileJobSourcesRoute)}
            size="sm"
            type="button"
            variant="outline"
          >
            Set up job sources
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
        <div className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
            Recommended next
          </p>
          <h2 className="text-(length:--text-section-title) font-semibold text-(--text-headline)">
            {effectiveRecommendedNext.label}
          </h2>
          <p className="text-sm text-foreground-soft">
            {effectiveRecommendedNext.detail}
          </p>
          <Button
            className="w-fit"
            onClick={() => props.onNavigate(effectiveRecommendedNext.route)}
            type="button"
          >
            {hasIncompleteProfileSetup
              ? "Finish your profile"
              : hasNoSources
                ? "Set up job sources"
                : "Continue"}
          </Button>
          {hasIncompleteProfileSetup ? (
            <p className="text-xs text-foreground-muted">
              Opens guided Profile setup and resumes at {profileSetupStepLabel}.
            </p>
          ) : hasNoSources ? (
            <p className="text-xs text-foreground-muted">
              Opens Profile — enable a public board to start.
            </p>
          ) : null}
        </div>
        <div className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
          <div>
            <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
              Active search plan
            </p>
            <label className="mt-2 grid gap-1 text-sm font-medium text-foreground">
              <span className="sr-only">Choose active search plan</span>
              <select
                aria-label="Active search plan"
                className="h-10 rounded-(--radius-field) border border-input bg-background px-3 text-sm"
                onChange={(event) => props.onSelectCampaign(event.target.value)}
                value={props.workspace.activeCampaignId}
              >
                {props.workspace.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm capitalize text-foreground-soft">
              {activeSearchPlanVolume}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="w-fit"
              onClick={() => props.onNavigate("/job-finder/rapid-review")}
              type="button"
            >
              Rapid review
            </Button>
            <Button
              className="w-fit"
              onClick={() => props.onNavigate("/job-finder/campaigns")}
              type="button"
              variant="outline"
            >
              Manage search plans
            </Button>
          </div>
        </div>
      </div>

      <JobFinderGlobalSearch
        entries={globalEntries}
        onNavigate={props.onNavigateGlobalEntry}
      />

      {hasIncompleteProfileSetup ? null : showZeroGuidance ? (
        <section
          aria-label="Getting started"
          className="grid gap-3"
          data-testid="home-zero-guidance"
        >
          <div className="grid min-h-(--empty-state-min-height) place-items-center overflow-hidden rounded-(--radius-panel) border border-dashed border-border/70 bg-[linear-gradient(180deg,var(--surface-overlay-subtle),var(--surface-fill-subtle))] px-6 py-8 text-center shadow-[inset_0_1px_0_var(--surface-inset-highlight)]">
            <div className="grid max-w-136 gap-4">
              <div
                aria-hidden="true"
                className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary/10 text-primary"
                data-testid="empty-state-illustration"
              >
                <BriefcaseBusiness aria-hidden="true" className="size-8" />
              </div>
              <h2 className="font-display text-(length:--text-section-title) font-semibold tracking-(--tracking-page-title-compact) text-(--text-headline) break-words [overflow-wrap:anywhere]">
                {hasIncompleteProfileSetup
                  ? "Finish your profile before searching"
                  : hasNoSources
                    ? "Set up your job sources to get started"
                    : "Run your first search"}
              </h2>
              <p className="text-(length:--text-description) leading-6 text-foreground-soft break-words [overflow-wrap:anywhere]">
                {hasIncompleteProfileSetup
                  ? `Continue with ${profileSetupStepLabel} so your job targets, sources, and resume tailoring are ready before you search.`
                  : hasNoSources
                    ? "Add an enabled job source in Profile to start finding relevant openings."
                    : "Your job sources are ready. Run your active search plan to find relevant openings and see metrics here."}
              </p>
              <p className="text-xs text-foreground-muted">
                {hasIncompleteProfileSetup
                  ? `Profile setup is the next step and resumes at ${profileSetupStepLabel}.`
                  : hasNoSources
                    ? "Enable a public board in Profile to start."
                    : "The active search plan will check each enabled source."}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section
          aria-label="Current activity"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Metric label="Found today" value={dashboard.jobsFoundToday} />
          <Metric
            label="Awaiting review"
            value={dashboard.jobsAwaitingReview}
          />
          <Metric
            label="Ready for approval"
            value={dashboard.applicationsReadyForApproval}
          />
          <Metric label="Needs you" value={dashboard.needsYouCount} />
          <Metric
            label="Applied today"
            value={dashboard.applicationsAppliedToday}
          />
          <Metric
            label="Applied this week"
            value={dashboard.applicationsAppliedThisWeek}
          />
          <Metric
            label="Upcoming interviews"
            value={dashboard.upcomingInterviews}
          />
          <Metric label="Follow-ups due" value={dashboard.upcomingFollowUps} />
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
          <h2 className="font-semibold text-(--text-headline)">
            Results so far
          </h2>
          <p className="text-sm text-foreground-soft">
            Response rate:{" "}
            {dashboard.responseRate
              ? `${dashboard.responseRate.percent}% (${dashboard.responseRate.numerator} of ${dashboard.responseRate.denominator})`
              : "Not enough data yet"}
          </p>
          <p className="text-sm text-foreground-soft">
            Interview rate:{" "}
            {dashboard.interviewRate
              ? `${dashboard.interviewRate.percent}% (${dashboard.interviewRate.numerator} of ${dashboard.interviewRate.denominator})`
              : "Not enough data yet"}
          </p>
        </section>
        <section className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
          <h2 className="font-semibold text-(--text-headline)">
            Source health
          </h2>
          <p className="text-sm text-foreground-soft">
            {dashboard.sourceHealth.healthy} healthy ·{" "}
            {dashboard.sourceHealth.needsAttention} need attention ·{" "}
            {dashboard.sourceHealth.running} running
          </p>
          <p className="text-xs text-foreground-muted">
            {dashboard.sourceHealth.total} enabled sources in this search plan
          </p>
        </section>
        <section className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
          <h2 className="font-semibold text-(--text-headline)">
            Background work
          </h2>
          <p className="text-sm text-foreground-soft">
            {dashboard.backgroundOperationCount === 0
              ? "Nothing is running right now."
              : `${dashboard.backgroundOperationCount} ${dashboard.backgroundOperationCount === 1 ? "operation is" : "operations are"} running.`}
          </p>
          {props.workspace.activityControl.reason ? (
            <p className="text-xs text-foreground-muted">
              Pause reason: {props.workspace.activityControl.reason}
            </p>
          ) : null}
        </section>
      </div>

      {props.onMarkCampaignNotificationRead ||
      props.onMarkAllCampaignNotificationsRead ? (
        <CampaignNotificationCenter
          errorMessage={props.campaignNotificationError ?? null}
          loading={false}
          notifications={props.campaignNotifications ?? []}
          onMarkAllRead={() => props.onMarkAllCampaignNotificationsRead?.()}
          onMarkRead={(notificationId) =>
            props.onMarkCampaignNotificationRead?.(notificationId)
          }
          pendingMarkAll={props.campaignNotificationAllPending ?? false}
          pendingNotificationId={(notificationId) =>
            props.campaignNotificationPending?.(notificationId) ?? false
          }
        />
      ) : null}
    </section>
  );
}
