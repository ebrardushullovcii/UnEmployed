import { useState } from "react";
import type { BrowserSessionState, SavedJob } from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "@renderer/features/job-finder/components/empty-state";
import { StatusBadge } from "@renderer/features/job-finder/components/status-badge";
import { JOB_FINDER_ROUTE_HREFS } from "@renderer/features/job-finder/lib/job-finder-route-hrefs";
import { cn } from "@renderer/lib/cn";
import {
  formatOptionalDateOnly,
  formatStatusLabel,
  getApplicationTone,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { fitRecommendationCopy } from "@renderer/features/job-finder/lib/match-assessment-presentation";
import {
  DISCOVERY_DETAIL_REGION_ID,
  focusDiscoveryDetailAfterKeyboardSelection,
} from "./discovery-accessibility";

interface DiscoveryResultsPanelProps {
  browserSession: BrowserSessionState;
  emptyClassName?: string;
  hasCompletedSearch?: boolean;
  hiddenJobCount?: number;
  isSearchInProgress?: boolean;
  jobs: readonly SavedJob[];
  onRecoveryAction?: (() => void) | null;
  onSearchAgain?: (() => void) | null;
  onShowHiddenJobs?: (() => void) | null;
  onSelectJob: (jobId: string) => void;
  recoveryActionLabel?: string | null;
  recoveryActionNextStep?: string | null;
  recoveryActionPending?: boolean;
  searchAgainDisabled?: boolean;
  searchAgainPending?: boolean;
  searchSetupBlocker?: {
    title: string;
    description: string;
    actionLabel?: string | null;
    actionHref?: string | null;
    nextStep?: string | null;
  } | null;
  selectedJob: SavedJob | null;
}

export const DISCOVERY_RESULTS_PAGE_SIZE = 50;

export function getDiscoveryResultsPage(
  jobs: readonly SavedJob[],
  page: number,
): readonly SavedJob[] {
  const pageCount = Math.max(
    1,
    Math.ceil(jobs.length / DISCOVERY_RESULTS_PAGE_SIZE),
  );
  const boundedPage = Math.min(Math.max(0, page), pageCount - 1);
  const startIndex = boundedPage * DISCOVERY_RESULTS_PAGE_SIZE;

  return jobs.slice(startIndex, startIndex + DISCOVERY_RESULTS_PAGE_SIZE);
}

function getSelectedJobPage(
  jobs: readonly SavedJob[],
  selectedJobId: string | null,
): number {
  if (!selectedJobId) {
    return 0;
  }

  const selectedIndex = jobs.findIndex((job) => job.id === selectedJobId);
  return selectedIndex < 0
    ? 0
    : Math.floor(selectedIndex / DISCOVERY_RESULTS_PAGE_SIZE);
}

function RecoveryCallout(props: {
  description: string;
  onRecoveryAction?: (() => void) | null;
  recoveryActionLabel?: string | null;
  recoveryActionNextStep?: string | null;
  recoveryActionPending?: boolean;
}) {
  const recoveryActionProps = props.onRecoveryAction
    ? { onClick: props.onRecoveryAction }
    : {};
  const recoveryPendingProps = props.recoveryActionPending
    ? { pending: true }
    : {};

  return (
    <div
      aria-atomic="true"
      className="rounded-(--radius-panel) border border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--warning-text)"
      role="alert"
    >
      <p>{props.description}</p>
      {props.recoveryActionLabel ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            type="button"
            variant="primary"
            {...recoveryActionProps}
            {...recoveryPendingProps}
          >
            {props.recoveryActionLabel}
          </Button>
          <span className="text-(length:--text-small) opacity-80">
            {props.recoveryActionNextStep ?? "Then search again."}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function ResultsEmptyState(props: {
  actionHref?: string | null;
  className?: string;
  description: string;
  onRecoveryAction?: (() => void) | null;
  recoveryActionLabel?: string | null;
  recoveryActionNextStep?: string | null;
  recoveryActionPending?: boolean;
  title: string;
}) {
  const emptyStateProps = props.className ? { className: props.className } : {};
  const recoveryActionProps = props.onRecoveryAction
    ? { onClick: props.onRecoveryAction }
    : {};
  const recoveryPendingProps = props.recoveryActionPending
    ? { pending: true }
    : {};
  const actionButton = props.recoveryActionLabel ? (
    props.actionHref ? (
      <Button asChild size="sm" type="button" variant="primary">
        <a href={props.actionHref}>{props.recoveryActionLabel}</a>
      </Button>
    ) : (
      <Button
        size="sm"
        type="button"
        variant="primary"
        {...recoveryActionProps}
        {...recoveryPendingProps}
      >
        {props.recoveryActionLabel}
      </Button>
    )
  ) : null;

  return (
    <div className="grid gap-4">
      <EmptyState
        description={props.description}
        title={props.title}
        {...emptyStateProps}
      />
      {props.recoveryActionLabel ? (
        <div className="surface-card-tint grid gap-3 rounded-(--radius-panel) border border-(--warning-border) bg-(--warning-surface) px-4 py-4 text-left text-(length:--text-description) text-(--warning-text)">
          <div className="grid gap-1">
            <p className="font-medium">Next step</p>
            <p className="leading-6">
              {props.recoveryActionNextStep ??
                "Open the browser, then search again."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">{actionButton}</div>
        </div>
      ) : null}
    </div>
  );
}

function getApplyPathLabel(applyPath: SavedJob["applyPath"]): string {
  switch (applyPath) {
    case "easy_apply":
      return "Easy Apply";
    case "external_redirect":
      return "Apply on company site";
    default:
      return "Manual application";
  }
}

export function DiscoveryResultsPanel({
  browserSession,
  emptyClassName,
  hasCompletedSearch = false,
  hiddenJobCount = 0,
  isSearchInProgress = false,
  jobs,
  onRecoveryAction,
  onSearchAgain,
  onShowHiddenJobs,
  onSelectJob,
  recoveryActionLabel,
  recoveryActionNextStep,
  recoveryActionPending = false,
  searchAgainDisabled = false,
  searchAgainPending = false,
  searchSetupBlocker = null,
  selectedJob,
}: DiscoveryResultsPanelProps) {
  const jobCount = jobs.length;
  const pageCount = Math.max(
    1,
    Math.ceil(jobCount / DISCOVERY_RESULTS_PAGE_SIZE),
  );
  const selectedJobId = selectedJob?.id ?? null;
  const [pagination, setPagination] = useState(() => ({
    page: getSelectedJobPage(jobs, selectedJobId),
    selectedJobId,
  }));

  if (pagination.selectedJobId !== selectedJobId) {
    setPagination({
      page: getSelectedJobPage(jobs, selectedJobId),
      selectedJobId,
    });
  }

  const currentPage = Math.min(Math.max(0, pagination.page), pageCount - 1);
  const visibleJobs = getDiscoveryResultsPage(jobs, currentPage);
  const firstVisibleJobNumber =
    jobCount === 0 ? 0 : currentPage * DISCOVERY_RESULTS_PAGE_SIZE + 1;
  const lastVisibleJobNumber = Math.min(
    jobCount,
    firstVisibleJobNumber + visibleJobs.length - 1,
  );

  const sessionNeedsAttention =
    browserSession.status === "login_required" ||
    browserSession.status === "blocked";
  const sessionWaitingOnRuntime =
    browserSession.status === "unknown" &&
    browserSession.driver !== "catalog_seed" &&
    recoveryActionPending;
  const allResultsHidden = jobs.length === 0 && hiddenJobCount > 0;
  const baseButtonClasses =
    "grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

  return (
    <section
      aria-labelledby="discovery-job-results-heading"
      className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
        <h2
          className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted"
          id="discovery-job-results-heading"
        >
          Job results
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(jobCount > 0 || hiddenJobCount > 0) && onSearchAgain ? (
            <Button
              className="xl:hidden"
              disabled={searchAgainDisabled}
              onClick={onSearchAgain}
              pending={searchAgainPending}
              size="sm"
              type="button"
              variant="secondary"
            >
              {searchAgainPending ? "Searching" : "Search again"}
            </Button>
          ) : null}
          <Badge variant="section">
            {hiddenJobCount > 0
              ? `${jobCount} shown · ${hiddenJobCount} hidden`
              : `${jobCount} ${jobCount === 1 ? "job" : "jobs"}`}
          </Badge>
        </div>
      </header>

      {allResultsHidden ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-72"}
            description={`The ${hiddenJobCount === 1 ? "result has" : `${hiddenJobCount} results have`} a clear conflict with your saved role, location, or other requirements. Nothing was deleted.`}
            {...(onShowHiddenJobs !== undefined
              ? { onRecoveryAction: onShowHiddenJobs }
              : {})}
            recoveryActionLabel={`Show ${hiddenJobCount === 1 ? "mismatch" : "mismatches"}`}
            recoveryActionNextStep="Review the conflict evidence, then hide the mismatches again when you are done."
            title="All results are hidden"
          />
        </div>
      ) : null}

      {!allResultsHidden && searchSetupBlocker && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            actionHref={
              searchSetupBlocker.actionHref ?? JOB_FINDER_ROUTE_HREFS.profile
            }
            className={emptyClassName ?? "min-h-72"}
            description={searchSetupBlocker.description}
            recoveryActionLabel={
              searchSetupBlocker.actionLabel ?? "Edit search in Profile"
            }
            recoveryActionNextStep={
              searchSetupBlocker.nextStep ?? "Then search again."
            }
            title={searchSetupBlocker.title}
          />
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      isSearchInProgress &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-72"}
            description="Results will appear here as each saved source finishes. You can follow the live run in Search history."
            title="Searching your sources"
          />
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !isSearchInProgress &&
      sessionNeedsAttention &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-72"}
            description="Open the browser, sign in or fix the issue, then search again."
            title="Search blocked by browser"
            {...(onRecoveryAction !== undefined ? { onRecoveryAction } : {})}
            {...(recoveryActionLabel !== undefined
              ? { recoveryActionLabel }
              : {})}
            {...(recoveryActionNextStep !== undefined
              ? { recoveryActionNextStep }
              : {})}
            {...(recoveryActionPending ? { recoveryActionPending: true } : {})}
          />
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !isSearchInProgress &&
      sessionWaitingOnRuntime &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-72"}
            description="New results will appear here after browser-based sources are ready."
            title="Browser is starting"
          />
        </div>
      ) : null}

      {sessionNeedsAttention && jobs.length > 0 ? (
        <div className="px-5 pt-4">
          <RecoveryCallout
            description="You're viewing results from the last completed search. Open the browser when you're ready to run a new one."
            {...(onRecoveryAction !== undefined ? { onRecoveryAction } : {})}
            {...(recoveryActionLabel !== undefined
              ? { recoveryActionLabel }
              : {})}
            {...(recoveryActionNextStep !== undefined
              ? { recoveryActionNextStep }
              : {})}
            {...(recoveryActionPending ? { recoveryActionPending: true } : {})}
          />
        </div>
      ) : null}

      {sessionWaitingOnRuntime && jobs.length > 0 ? (
        <div className="px-5 pt-4">
          <div
            aria-atomic="true"
            aria-live="polite"
            className="rounded-(--radius-panel) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
            role="status"
          >
            You're viewing results from the last completed search while the
            browser gets ready.
          </div>
        </div>
      ) : null}

      {isSearchInProgress && jobs.length > 0 ? (
        <div className="px-5 pt-4">
          <div
            aria-atomic="true"
            aria-live="polite"
            className="rounded-(--radius-panel) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
            role="status"
          >
            <strong>
              {jobCount} {jobCount === 1 ? "match" : "matches"} ready to review.
            </strong>{" "}
            Search is still checking the remaining sources; stronger matches may
            move to the top.
          </div>
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !isSearchInProgress &&
      !sessionNeedsAttention &&
      !sessionWaitingOnRuntime &&
      !hasCompletedSearch &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-72"}
            description="Your search setup is ready. Select Search jobs to check every enabled source."
            title="Ready for your first search"
          />
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !isSearchInProgress &&
      !sessionNeedsAttention &&
      !sessionWaitingOnRuntime &&
      hasCompletedSearch &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            actionHref={JOB_FINDER_ROUTE_HREFS.profileTargetRoles}
            className={emptyClassName ?? "min-h-72"}
            description="No saved source returned a role that met this search. Broaden a role or location, enable another source, then run it again."
            recoveryActionLabel="Broaden search"
            recoveryActionNextStep="Review roles, locations, and enabled sources, then return here and search again."
            title="No matches from this search"
          />
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <ul
            aria-label="Results"
            className="m-0 grid min-h-full list-none content-start gap-3 p-0"
          >
            {visibleJobs.map((job) => {
              const isSelected = selectedJob?.id === job.id;
              const recommendation =
                fitRecommendationCopy[
                  job.matchAssessment.recommendation ?? "review_before_applying"
                ];

              return (
                <li key={job.id} className="min-w-0">
                  <button
                    aria-controls={DISCOVERY_DETAIL_REGION_ID}
                    aria-current={isSelected ? "true" : undefined}
                    data-job-result-id={job.id}
                    className={cn(
                      baseButtonClasses,
                      "w-full",
                      isSelected
                        ? "surface-card-tint"
                        : "bg-transparent hover:bg-(--surface-panel-raised)",
                    )}
                    onClick={(event) => {
                      onSelectJob(job.id);
                      if (event.detail === 0) {
                        focusDiscoveryDetailAfterKeyboardSelection();
                      }
                    }}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <strong className="text-(length:--text-section-title) text-(--text-headline)">
                          {job.title}
                        </strong>
                        <span className="text-(length:--text-description) text-foreground-muted">
                          {job.company} • {job.location}
                        </span>
                      </div>
                      <span
                        aria-label={`Overall fit: ${job.matchAssessment.score} percent`}
                        className="text-(length:--text-body) font-semibold text-(--text-headline)"
                      >
                        {job.matchAssessment.score}% fit
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={recommendation.tone}>
                        {recommendation.label}
                      </StatusBadge>
                      {job.status === "shortlisted" ||
                      job.status === "submitted" ? (
                        <StatusBadge tone={getApplicationTone(job.status)}>
                          {formatStatusLabel(job.status)}
                        </StatusBadge>
                      ) : null}
                      <Badge variant="outline">
                        {getApplyPathLabel(job.applyPath)}
                      </Badge>
                      {job.salaryText ? (
                        <Badge variant="outline">{job.salaryText}</Badge>
                      ) : null}
                      {job.workMode.length > 0 ? (
                        <Badge variant="outline">
                          {job.workMode.join(", ")}
                        </Badge>
                      ) : null}
                      {job.postedAt || job.postedAtText ? (
                        <Badge variant="outline">
                          Posted{" "}
                          {formatOptionalDateOnly(
                            job.postedAt,
                            job.postedAtText,
                          )}
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {pageCount > 1 ? (
            <nav
              aria-label="Job result pages"
              className="sticky bottom-0 mt-3 flex items-center justify-between gap-3 border-t border-(--surface-panel-border) bg-(--surface-panel) py-3"
            >
              <Button
                disabled={currentPage === 0}
                onClick={() =>
                  setPagination((current) => ({
                    ...current,
                    page: Math.max(0, currentPage - 1),
                  }))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Previous
              </Button>
              <span
                aria-live="polite"
                className="text-center text-(length:--text-small) text-foreground-muted"
              >
                {firstVisibleJobNumber}–{lastVisibleJobNumber} of {jobCount}
              </span>
              <Button
                disabled={currentPage >= pageCount - 1}
                onClick={() =>
                  setPagination((current) => ({
                    ...current,
                    page: Math.min(pageCount - 1, currentPage + 1),
                  }))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Next
              </Button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
