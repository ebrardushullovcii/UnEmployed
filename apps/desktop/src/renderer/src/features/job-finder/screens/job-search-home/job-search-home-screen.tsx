import type {
  CampaignNotification,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { PageHeader } from "../../components/page-header";
import { JobFinderActivityControl } from "../../components/job-finder-activity-control";
import { JobFinderGlobalSearch } from "../../components/job-finder-global-search";
import { CampaignNotificationCenter } from "../../components/campaign-notification-center";
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
  const globalEntries = buildJobFinderGlobalSearchEntries(props.workspace);
  const activeBrowserCount =
    (props.workspace.activeDiscoveryRun?.state === "running" ? 1 : 0) +
    (props.workspace.activeSourceDebugRun?.state === "running" ? 1 : 0);
  const activeApplicationCount = props.workspace.applyRuns.filter(
    (run) => run.state === "running",
  ).length;

  return (
    <section className="grid gap-5 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          compact
          eyebrow="Job Finder"
          title="Today"
          description="See what is moving, what needs you, and the best next step for your active campaign."
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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
        <div className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
            Recommended next
          </p>
          <h2 className="text-(length:--text-section-title) font-semibold text-(--text-headline)">
            {dashboard.recommendedNextAction.label}
          </h2>
          <p className="text-sm text-foreground-soft">
            {dashboard.recommendedNextAction.detail}
          </p>
          <Button
            className="w-fit"
            onClick={() =>
              props.onNavigate(dashboard.recommendedNextAction.route)
            }
            type="button"
          >
            Continue
          </Button>
        </div>
        <div className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
          <div>
            <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
              Active campaign
            </p>
            <label className="mt-2 grid gap-1 text-sm font-medium text-foreground">
              <span className="sr-only">Choose active campaign</span>
              <select
                aria-label="Active campaign"
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
              {activeCampaign?.mode ?? "unknown"} mode
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
              Manage campaigns
            </Button>
          </div>
        </div>
      </div>

      <JobFinderGlobalSearch
        entries={globalEntries}
        onNavigate={props.onNavigateGlobalEntry}
      />

      <section
        aria-label="Current activity"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Metric label="Found today" value={dashboard.jobsFoundToday} />
        <Metric label="Awaiting review" value={dashboard.jobsAwaitingReview} />
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
            {dashboard.sourceHealth.total} enabled sources in this campaign
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
          pendingMarkAll={
            props.campaignNotificationAllPending ?? false
          }
          pendingNotificationId={(notificationId) =>
            props.campaignNotificationPending?.(notificationId) ?? false
          }
        />
      ) : null}
    </section>
  );
}
