import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ApplicationRecord } from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  SelectableRow,
  SelectableRowLine,
} from "@renderer/components/ui/selectable-row";
import { cn } from "@renderer/lib/utils";
import { EmptyState } from "../../components/empty-state";
import {
  jobFinderListRegionClassName,
  jobFinderListRowBadgeSlotClassName,
  jobFinderListRowClassName,
  jobFinderListRowLinesClassName,
  jobFinderListRowMetaClassName,
  jobFinderListRowStatusClassName,
  jobFinderListRowTitleClassName,
  jobFinderListRowTitleLineClassName,
} from "../../components/list-row";
import {
  CollectionPagination,
  COLLECTION_PAGE_SIZE,
} from "../../components/collection-pagination";
import {
  focusCollectionItem,
  getAdjacentCollectionItemId,
} from "../../lib/collection-keyboard-navigation";
import { StatusBadge } from "../../components/status-badge";
import { Link } from "react-router-dom";
import { JOB_FINDER_ROUTE_PATHS } from "../../lib/job-finder-route-hrefs";
import { getAttemptLabel, getAttemptTone } from "../../lib/job-finder-utils";
import {
  formatApplicationEmployerAriaLabel,
  formatApplicationEmployerLine,
} from "../../lib/job-employer-location-display";
import {
  APPLICATION_FILTER_LABELS,
  APPLICATION_FILTERS,
  formatApplicationFilterAccessibleLabel,
  type ApplicationsViewFilter,
} from "./applications-filters";
import {
  getApplicationNextStepLabel,
  getApplicationReadableNextStepLabel,
  getApplicationStagePresentation,
} from "./applications-status";

interface ApplicationsRecordsPanelProps {
  activeFilter: ApplicationsViewFilter;
  applicationRecords: readonly ApplicationRecord[];
  discoveryJobs?: ReadonlyArray<{
    id: string;
    canonicalUrl: string;
  }>;
  filterCounts: Record<ApplicationsViewFilter, number>;
  hasAnyApplications: boolean;
  onFilterChange: (filter: ApplicationsViewFilter) => void;
  onSelectRecord: (recordId: string) => void;
  selectedRecord: ApplicationRecord | null;
}

export function ApplicationsRecordsPanel({
  activeFilter,
  applicationRecords,
  discoveryJobs = [],
  filterCounts,
  hasAnyApplications,
  onFilterChange,
  onSelectRecord,
  selectedRecord,
}: ApplicationsRecordsPanelProps) {
  const recordCount = applicationRecords.length;
  const filterGroupId = useId();
  const [page, setPage] = useState(1);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const recordsRegionRef = useRef<HTMLUListElement | null>(null);
  const pageCount = Math.max(1, Math.ceil(recordCount / COLLECTION_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const relatedJobsById = useMemo(
    () => new Map(discoveryJobs.map((job) => [job.id, job] as const)),
    [discoveryJobs],
  );
  const selectedRecordId = selectedRecord?.id ?? null;
  const selectedRecordIndex = useMemo(
    () =>
      selectedRecordId
        ? applicationRecords.findIndex(
            (record) => record.id === selectedRecordId,
          )
        : -1,
    [applicationRecords, selectedRecordId],
  );
  useEffect(() => {
    setPage(1);
  }, [activeFilter]);
  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pageCount));
  }, [pageCount]);
  useEffect(() => {
    if (selectedRecordIndex < 0) return;
    setPage(Math.floor(selectedRecordIndex / COLLECTION_PAGE_SIZE) + 1);
  }, [selectedRecordIndex]);
  useEffect(() => {
    if (!pendingFocusId) return;
    // Scoped to this panel's list region so the deferred frame can never
    // land focus in another surface's rows.
    focusCollectionItem(pendingFocusId, { region: recordsRegionRef.current });
    setPendingFocusId(null);
  }, [currentPage, pendingFocusId]);
  const handleRecordRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, recordId: string) => {
      const nextRecordId = getAdjacentCollectionItemId(
        applicationRecords.map((record) => record.id),
        recordId,
        event.key,
      );
      if (!nextRecordId) return;
      event.preventDefault();
      const nextIndex = applicationRecords.findIndex(
        (record) => record.id === nextRecordId,
      );
      setPage(Math.floor(nextIndex / COLLECTION_PAGE_SIZE) + 1);
      onSelectRecord(nextRecordId);
      setPendingFocusId(nextRecordId);
    },
    [applicationRecords, onSelectRecord],
  );
  // A single record used to wrap five chips onto two rows in a narrow list
  // column. "All" and "Waiting on you" always stay (they are the two views a
  // user switches between), plus any view that actually holds something and
  // the active view so the current selection can never disappear.
  const visibleFilters = useMemo(
    () =>
      APPLICATION_FILTERS.filter(
        (filterOption) =>
          filterOption === "all" ||
          filterOption === "needs_action" ||
          filterOption === activeFilter ||
          filterCounts[filterOption] > 0,
      ),
    [activeFilter, filterCounts],
  );
  const pagedRecords = useMemo(
    () =>
      applicationRecords.slice(
        (currentPage - 1) * COLLECTION_PAGE_SIZE,
        currentPage * COLLECTION_PAGE_SIZE,
      ),
    [applicationRecords, currentPage],
  );

  return (
    // `xl:h-full` left a short list as a tall empty bordered rectangle beside
    // a scrolling detail pane. Capping instead of filling lets the panel end
    // where its content ends while a long list still scrolls inside it, and
    // `sticky`/`self-start` keep it pinned to the top of its column instead of
    // riding away with any surrounding scroll and leaving a dead half-screen.
    // The column is sized by its content and capped by the viewport, not
    // stretched to it: a 470x780 panel holding one 100px card left ~670px of
    // empty space beside a detail pane that needed the room.
    <section className="surface-panel-shell @container/tracker relative flex min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:sticky xl:top-0 xl:max-h-full xl:min-h-0 xl:self-start">
      <div className="grid gap-3 border-b border-(--surface-panel-border) px-5 py-3">
        <div className="flex flex-wrap items-center gap-4">
          {/* A panel title, not an eyebrow: the base heading scale already
              gives it 19px/600, and the previous bold uppercase primary
              treatment made it heavier than the page's own H1. */}
          <h2 className="min-w-0">Preparation</h2>
          <Badge variant="section">
            {recordCount} {recordCount === 1 ? "application" : "applications"}
          </Badge>
        </div>

        {hasAnyApplications ? (
          <div
            aria-labelledby={filterGroupId}
            className="flex w-full min-w-0 flex-wrap items-center gap-1.5"
            role="group"
          >
            <span className="sr-only" id={filterGroupId}>
              Application filters
            </span>
            {visibleFilters.map((filterOption) => (
              <Button
                aria-label={formatApplicationFilterAccessibleLabel(
                  filterOption,
                  filterCounts[filterOption],
                )}
                aria-pressed={activeFilter === filterOption}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full ring-inset focus-visible:ring-inset",
                  activeFilter === filterOption
                    ? null
                    : "border-(--border-strong)",
                )}
                key={filterOption}
                onClick={() => onFilterChange(filterOption)}
                size="sm"
                type="button"
                variant={activeFilter === filterOption ? "secondary" : "ghost"}
              >
                {APPLICATION_FILTER_LABELS[filterOption]}
                <span className="rounded-full border border-current/15 px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase leading-none tracking-(--tracking-badge)">
                  {filterCounts[filterOption]}
                </span>
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {applicationRecords.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-start p-6">
          {hasAnyApplications ? (
            <EmptyState
              title="No applications in this view"
              description="Try another filter to review the rest of your application history."
            />
          ) : (
            // The two ways out belong inside the empty state, not stranded
            // under it: a dashed box with nothing in it read as the end of the
            // panel, and its actions read as unrelated page furniture.
            <EmptyState
              title="No application started yet"
              description="Shortlisting a job or tailoring its resume does not create an application record. Open Shortlisted, select a job, and choose Prepare application to start the prepare-only flow."
            >
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="sm" type="button" variant="primary">
                  <Link to={JOB_FINDER_ROUTE_PATHS.reviewQueue}>
                    Open Shortlisted
                  </Link>
                </Button>
                <Button
                  asChild
                  className="border-(--border-strong)"
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Link to={JOB_FINDER_ROUTE_PATHS.discovery}>Find jobs</Link>
                </Button>
              </div>
            </EmptyState>
          )}
        </div>
      ) : (
        <ul
          aria-label="Applications"
          className={cn(
            jobFinderListRegionClassName,
            "min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
          )}
          data-locked-pane-scroll-region
          ref={recordsRegionRef}
        >
          {pagedRecords.map((record) => {
            const stage = getApplicationStagePresentation(record);
            const attemptLabel = getAttemptLabel(record.lastAttemptState);
            // The stage badge already says the record is stuck; a second
            // badge restating how ("Needs follow-up", "Attempt failed") was
            // badge noise. The attempt detail stays in the panel.
            const showAttemptBadge = !(
              (stage.label === "Needs you" &&
                attemptLabel === "Needs follow-up") ||
              (stage.label === "Needs recovery" &&
                attemptLabel === "Attempt failed")
            );
            const nextStepLabel =
              getApplicationReadableNextStepLabel(
                getApplicationNextStepLabel(record),
              ) ?? getApplicationNextStepLabel(record);
            const recordStateDescriptionId = `applications-record-${record.id}-state-description`;
            const relatedJob = relatedJobsById.get(record.jobId);
            const employerLine = formatApplicationEmployerLine({
              company: record.company,
              ...(relatedJob?.canonicalUrl
                ? { canonicalUrl: relatedJob.canonicalUrl }
                : {}),
            });
            const employerAriaLabel = formatApplicationEmployerAriaLabel({
              title: record.title,
              company: record.company,
              ...(relatedJob?.canonicalUrl
                ? { canonicalUrl: relatedJob.canonicalUrl }
                : {}),
            });

            return (
              <li key={record.id} className="min-w-0">
                {/* Shared selectable-row primitive: identical box metrics in
                    both states, selection carried by a tint plus an inset
                    accent bar, and every content line always occupying its
                    slot. Selecting row 1 then row 2 used to move every row
                    below by tens of pixels. */}
                <SelectableRow
                  aria-describedby={recordStateDescriptionId}
                  className={jobFinderListRowClassName}
                  aria-keyshortcuts="ArrowUp ArrowDown Home End"
                  aria-label={`View details for ${employerAriaLabel}`}
                  data-collection-item-id={record.id}
                  onClick={() => onSelectRecord(record.id)}
                  onKeyDown={(event) =>
                    handleRecordRowKeyDown(event, record.id)
                  }
                  selected={selectedRecord?.id === record.id}
                >
                  <div className={jobFinderListRowLinesClassName}>
                    {/* Title line, with the one badge slot trailing it - the
                        same slot Find jobs and Shortlisted use. The row's own
                        description below already reads "Stage <label>", so no
                        second "Stage" label is announced beside the badge. */}
                    <div className={jobFinderListRowTitleLineClassName}>
                      <strong className={jobFinderListRowTitleClassName}>
                        {record.title}
                      </strong>
                      <div className={jobFinderListRowBadgeSlotClassName}>
                        <StatusBadge tone={stage.tone}>
                          {stage.label}
                        </StatusBadge>
                        <SelectableRowLine
                          className="flex items-center justify-end"
                          reserve={false}
                        >
                          {showAttemptBadge ? (
                            <StatusBadge
                              tone={getAttemptTone(record.lastAttemptState)}
                            >
                              {attemptLabel}
                            </StatusBadge>
                          ) : null}
                        </SelectableRowLine>
                      </div>
                    </div>
                    <SelectableRowLine
                      className={jobFinderListRowMetaClassName}
                    >
                      {employerLine}
                    </SelectableRowLine>
                    {/* One status line only: the stage badge already names the
                        state, so the latest-activity sentence (which often
                        repeated this exact next step) is not shown twice. */}
                    <SelectableRowLine
                      className={cn(
                        jobFinderListRowStatusClassName,
                        "font-medium text-primary",
                      )}
                    >
                      {nextStepLabel ? `Next: ${nextStepLabel}` : null}
                    </SelectableRowLine>
                  </div>
                  <span className="sr-only" id={recordStateDescriptionId}>
                    {/* The visible badge is deduplicated; the description
                        still names a failed attempt for assistive tech, since
                        "Needs recovery" alone does not say why. */}
                    {attemptLabel &&
                    !(
                      stage.label === "Needs you" &&
                      attemptLabel === "Needs follow-up"
                    )
                      ? `Stage ${stage.label}. Preparation attempt ${attemptLabel}.`
                      : `Stage ${stage.label}.`}
                  </span>
                </SelectableRow>
              </li>
            );
          })}
        </ul>
      )}
      {recordCount > 0 ? (
        <CollectionPagination
          itemLabel="applications"
          onPageChange={setPage}
          page={currentPage}
          pageSize={COLLECTION_PAGE_SIZE}
          totalCount={recordCount}
        />
      ) : null}
    </section>
  );
}
