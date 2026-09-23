import { useState } from "react";
import { Pause, Play } from "lucide-react";
import type {
  ApplicationAutomationMode,
  CampaignNotification,
  DiscoveryActivityEvent,
  JobFinderSearchRequest,
  JobFinderWorkspaceSnapshot,
  ProfileSetupStep,
  ResumeImportProgressEvent,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/cn";
import { PageHeaderStack } from "../../components/page-header";
import { CampaignNotificationCenter } from "../../components/campaign-notification-center";
import { buildJobFinderTaskCenterModel } from "../../components/task-center/job-finder-task-center-model";
import { JOB_FINDER_ROUTE_PATHS } from "../../lib/job-finder-route-hrefs";
import { listApplicationsAwaitingUser } from "../../lib/needs-you-count";
import { DiscoveryRunFeedbackCallout } from "../discovery/discovery-run-feedback-callout";
import type { DiscoveryRunFeedback } from "../discovery/discovery-run-feedback";
import type { TailoredDraftPreparationViewState } from "../review-queue/review-queue-status";
import {
  buildJobSearchHomeModel,
  type HomeAction,
  type HomeButton,
} from "./job-search-home-model";

export { buildInterruptedSearchRetryRequest } from "./job-search-home-model";

export interface JobSearchHomeScreenProps {
  workspace: JobFinderWorkspaceSnapshot;
  activityPending: boolean;
  applicationAutomationMode?: ApplicationAutomationMode;
  browserSessionPending?: boolean;
  campaignNotificationAllPending?: boolean;
  campaignNotificationError?: string | null;
  campaignNotificationPending?: (notificationId: string) => boolean;
  campaignNotifications?: readonly CampaignNotification[];
  discoveryRunFeedback?: DiscoveryRunFeedback | null;
  discoveryRunPending?: boolean;
  isDiscoveryPending?: boolean;
  isResumeImportPending?: boolean;
  liveDiscoveryEvents?: readonly DiscoveryActivityEvent[];
  resumeImportProgress?: ResumeImportProgressEvent | null;
  tailoredDraftPreparation?: TailoredDraftPreparationViewState | null;
  onApplyToJobs?: (jobIds: readonly string[]) => Promise<unknown> | void;
  onCreateResumes?: () => void;
  onMarkAllCampaignNotificationsRead?: () => void;
  onMarkCampaignNotificationRead?: (notificationId: string) => void;
  onNavigate: (path: string) => void;
  onOpenBrowserSession?: () => void;
  onPauseActivity: () => void;
  onResumeActivity: () => void;
  onRunDiscovery?: (request?: JobFinderSearchRequest) => void;
  onResumeSetup?: (step: ProfileSetupStep) => void;
  onSelectCampaign: (campaignId: string) => void;
  onStopApply?: (runId: string) => void;
  onStopResumes?: () => void;
  onStopSearch?: (runId: string) => void;
}

const PANEL_CLASS =
  "surface-panel-shell grid min-w-0 gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5";

export function JobSearchHomeScreen(props: JobSearchHomeScreenProps) {
  const [applyPending, setApplyPending] = useState(false);
  const tasks = buildJobFinderTaskCenterModel({
    workspace: props.workspace,
    isDiscoveryPending: props.isDiscoveryPending ?? false,
    isResumeImportPending: props.isResumeImportPending ?? false,
    liveDiscoveryEvents: props.liveDiscoveryEvents,
    resumeImportProgress: props.resumeImportProgress,
    tailoredDraftPreparation: props.tailoredDraftPreparation,
  });
  // A search outcome the person has to do something about (a browser that
  // would not open, a source that needs sign-in) keeps its own callout with
  // its own corrective action. A finished search is a status fact and reads
  // as the line under the title instead.
  const model = buildJobSearchHomeModel({
    workspace: props.workspace,
    tasks,
    discoveryRunPending: props.discoveryRunPending ?? false,
    canRunDiscovery: Boolean(props.onRunDiscovery),
    applicationAutomationMode:
      props.applicationAutomationMode ?? "prepare_only",
  });
  const missingStartingPageCoveredBySourceFix =
    model.problems.some((problem) => problem.id === "failing-sources") &&
    /Starting page returned HTTP (404|410)/iu.test(
      props.discoveryRunFeedback?.detail ?? "",
    );
  const unresolvedFeedback =
    props.discoveryRunFeedback &&
    props.discoveryRunFeedback.targetLabel === null &&
    props.discoveryRunFeedback.status !== "succeeded" &&
    props.discoveryRunFeedback.status !== "started" &&
    !missingStartingPageCoveredBySourceFix
      ? props.discoveryRunFeedback
      : null;
  const applicationsAwaitingUser = new Set(
    listApplicationsAwaitingUser({
      applicationRecords: props.workspace.applicationRecords,
      applyJobResults: props.workspace.applyJobResults,
      requests: props.workspace.userActionRequests,
    }).map((record) => record.id),
  );
  const activeActionRecordIds = new Set(
    props.workspace.userActionRequests
      .filter(
        (request) =>
          ![
            "resolved",
            "skipped",
            "cancelled",
            "expired",
            "superseded",
          ].includes(request.state),
      )
      .flatMap((request) =>
        request.scope?.type === "application" &&
        request.scope.applicationRecordId
          ? [request.scope.applicationRecordId]
          : [],
      ),
  );
  const applicationRecoveryRecords = props.workspace.applicationRecords
    .filter(
      (record) =>
        !applicationsAwaitingUser.has(record.id) &&
        !activeActionRecordIds.has(record.id),
    )
    .map((record) => ({ jobId: record.jobId, applicationRecordId: record.id }));

  const run = (action: HomeAction) => {
    switch (action.kind) {
      case "navigate":
        props.onNavigate(action.route);
        return;
      case "run_search":
        if (props.onRunDiscovery) {
          props.onRunDiscovery(action.request);
        } else {
          props.onNavigate(JOB_FINDER_ROUTE_PATHS.discovery);
        }
        return;
      case "create_resumes":
        if (props.onCreateResumes) {
          props.onCreateResumes();
        } else {
          props.onNavigate(JOB_FINDER_ROUTE_PATHS.reviewQueue);
        }
        return;
      case "resume_setup":
        if (props.onResumeSetup) {
          props.onResumeSetup(action.step);
        } else {
          props.onNavigate("/job-finder/profile/setup");
        }
        return;
      case "apply_all":
        if (props.onApplyToJobs) {
          setApplyPending(true);
          void Promise.resolve(props.onApplyToJobs(action.jobIds)).finally(() =>
            setApplyPending(false),
          );
        } else {
          props.onNavigate(JOB_FINDER_ROUTE_PATHS.reviewQueue);
        }
        return;
      case "stop_search":
        props.onStopSearch?.(action.runId);
        return;
      case "stop_apply":
        props.onStopApply?.(action.runId);
        return;
      case "stop_resumes":
        props.onStopResumes?.();
        return;
      case "pause_activity":
        props.onPauseActivity();
        return;
      case "resume_activity":
        props.onResumeActivity();
        return;
    }
  };

  const isButtonPending = (button: HomeButton): boolean =>
    (button.action.kind === "run_search" &&
      Boolean(props.discoveryRunPending)) ||
    (button.action.kind === "apply_all" && applyPending) ||
    ((button.action.kind === "pause_activity" ||
      button.action.kind === "resume_activity") &&
      props.activityPending);

  const unreadNotifications = (props.campaignNotifications ?? []).filter(
    (notification) => notification.unread,
  );
  const showNotifications =
    unreadNotifications.length > 0 &&
    Boolean(
      props.onMarkCampaignNotificationRead ||
      props.onMarkAllCampaignNotificationsRead,
    );

  return (
    <section className="grid min-w-0 gap-5 pb-8">
      <PageHeaderStack
        actions={
          model.paused ? (
            <Button
              onClick={() => run({ kind: "resume_activity" })}
              pending={props.activityPending}
              size="sm"
              type="button"
            >
              <Play aria-hidden="true" className="size-4" />
              Resume
            </Button>
          ) : model.showPlanSelector ? (
            <label className="flex min-w-0 items-center gap-2 text-xs text-foreground-muted">
              <span>Search plan</span>
              <select
                aria-label="Active search plan"
                className="h-9 min-w-0 max-w-56 rounded-(--radius-field) border border-(--field-border) bg-(--field) px-2 text-sm outline-none focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]"
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
          ) : undefined
        }
        description={model.statusLine}
        title="Home"
      />

      {model.now.length > 0 ? (
        <section
          aria-label="Happening now"
          className={PANEL_CLASS}
          data-testid="home-now"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h2 className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-muted-foreground">
              Happening now
            </h2>
            {!model.paused ? (
              <Button
                onClick={() => run({ kind: "pause_activity" })}
                pending={props.activityPending}
                size="xs"
                type="button"
                variant="ghost"
              >
                <Pause aria-hidden="true" className="size-3" />
                Pause new work
              </Button>
            ) : null}
          </div>
          <ul className="grid min-w-0 gap-2">
            {model.now.map((item) => (
              <li
                className="flex min-w-0 flex-wrap items-center justify-between gap-3"
                key={item.id}
              >
                <div className="min-w-0">
                  <p className="min-w-0 break-words text-sm font-medium text-(--text-headline)">
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-block size-2 animate-pulse rounded-full bg-primary align-middle"
                    />
                    {item.title}
                  </p>
                  {item.detail ? (
                    <p className="min-w-0 break-words text-xs text-foreground-muted">
                      {item.detail}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.open ? (
                    <Button
                      onClick={() => item.open && run(item.open.action)}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      {item.open.label}
                    </Button>
                  ) : null}
                  {item.stop ? (
                    <Button
                      onClick={() => item.stop && run(item.stop.action)}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      {item.stop.label}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unresolvedFeedback ? (
        <div
          className="grid min-w-0 gap-2"
          data-testid="home-discovery-run-feedback"
        >
          <DiscoveryRunFeedbackCallout
            feedback={unresolvedFeedback}
            {...(props.browserSessionPending !== undefined
              ? { isRecoveryPending: props.browserSessionPending }
              : {})}
            {...(props.onOpenBrowserSession
              ? { onOpenBrowserSession: props.onOpenBrowserSession }
              : {})}
          />
        </div>
      ) : null}

      {model.problems.map((problem) => (
        <div
          className={cn(
            "flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-(--radius-panel) border px-4 py-3 text-sm leading-6",
            problem.tone === "critical"
              ? "border-critical/40 bg-critical/10 text-foreground"
              : "border-warning/40 bg-(--warning-surface) text-(--warning-text)",
          )}
          data-testid={`home-problem-${problem.id}`}
          key={problem.id}
          role="status"
        >
          <p className="min-w-0 flex-1 break-words">{problem.text}</p>
          {problem.button ? (
            <Button
              onClick={() => problem.button && run(problem.button.action)}
              size="sm"
              type="button"
              variant="outline"
            >
              {problem.button.label}
            </Button>
          ) : null}
        </div>
      ))}

      <section
        aria-labelledby="home-next-step-title"
        className="surface-panel-shell grid min-w-0 gap-3 rounded-(--radius-panel) border border-primary/40 bg-primary/10 p-5"
        data-home-next-step={model.next.id}
        data-testid="home-next-step"
      >
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-muted-foreground">
          Next step
        </p>
        <h2
          className="min-w-0 break-words font-semibold text-(--text-headline)"
          id="home-next-step-title"
        >
          {model.next.title}
        </h2>
        <p className="min-w-0 max-w-[68ch] break-words text-sm text-foreground-soft">
          {model.next.detail}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            className="h-11 w-fit px-5"
            onClick={() => run(model.next.primary.action)}
            pending={isButtonPending(model.next.primary)}
            type="button"
          >
            {model.next.primary.label}
          </Button>
          {model.next.secondary.map((button) => (
            <Button
              className="h-11 w-fit px-4"
              key={button.label}
              onClick={() => run(button.action)}
              pending={isButtonPending(button)}
              size="sm"
              type="button"
              variant="outline"
            >
              {button.label}
            </Button>
          ))}
        </div>
      </section>

      {model.stages ? (
        <nav
          aria-label="Where you are"
          className="grid min-w-0 gap-2 sm:grid-cols-3"
          data-testid="home-pipeline"
        >
          {model.stages.map((stage) => (
            <button
              className="surface-panel-shell grid min-w-0 content-start gap-0.5 rounded-(--radius-panel) border border-(--surface-panel-border) px-4 py-3 text-left outline-none transition-colors hover:border-(--control-border-hover) hover:bg-secondary/35 focus-visible:ring-2 focus-visible:ring-ring"
              data-home-stage={stage.id}
              key={stage.id}
              onClick={() => props.onNavigate(stage.route)}
              type="button"
            >
              <span className="text-(length:--text-small) text-foreground-soft">
                {stage.label}
              </span>
              <span className="text-(length:--text-heading-2) font-semibold tabular-nums leading-tight text-(--text-headline)">
                {stage.count}
              </span>
              {stage.detail ? (
                <span className="min-w-0 break-words text-xs text-foreground-muted">
                  {stage.detail}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      ) : null}

      {showNotifications ? (
        <CampaignNotificationCenter
          applicationRecoveryRecords={applicationRecoveryRecords}
          errorMessage={props.campaignNotificationError ?? null}
          loading={false}
          notifications={unreadNotifications}
          onNavigate={props.onNavigate}
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
