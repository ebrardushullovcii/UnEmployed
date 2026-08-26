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
import { cn } from "@renderer/lib/utils";
import { EmptyState } from "../../components/empty-state";
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
  APPLICATION_FILTER_LABELS,
  APPLICATION_FILTERS,
  type ApplicationsViewFilter,
} from "./applications-filters";
import {
  getApplicationLatestActivityLabel,
  getApplicationStagePresentation,
} from "./applications-status";

interface ApplicationsRecordsPanelProps {
  activeFilter: ApplicationsViewFilter;
  applicationRecords: readonly ApplicationRecord[];
  filterCounts: Record<ApplicationsViewFilter, number>;
  hasAnyApplications: boolean;
  onFilterChange: (filter: ApplicationsViewFilter) => void;
  onSelectRecord: (recordId: string) => void;
  selectedRecord: ApplicationRecord | null;
}

export function ApplicationsRecordsPanel({
  activeFilter,
  applicationRecords,
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
  const pagedRecords = useMemo(
    () =>
      applicationRecords.slice(
        (currentPage - 1) * COLLECTION_PAGE_SIZE,
        currentPage * COLLECTION_PAGE_SIZE,
      ),
    [applicationRecords, currentPage],
  );

  return (
    <section className="surface-panel-shell @container/tracker relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-(--surface-panel-border) px-5 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="font-display text-lg font-bold uppercase tracking-(--tracking-heading) text-primary">
            Preparation
          </h2>
          <Badge variant="section">
            {recordCount} {recordCount === 1 ? "application" : "applications"}
          </Badge>
        </div>

        {hasAnyApplications ? (
          <div
            aria-labelledby={filterGroupId}
            className="-my-1 flex max-w-full min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto py-1"
            role="group"
          >
            <span className="sr-only" id={filterGroupId}>
              Application filters
            </span>
            {APPLICATION_FILTERS.map((filterOption) => (
              <Button
                aria-pressed={activeFilter === filterOption}
                className="shrink-0 whitespace-nowrap rounded-full ring-inset focus-visible:ring-inset"
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
        <div className="flex min-h-0 flex-1 items-start p-8 pt-12">
          {hasAnyApplications ? (
            <EmptyState
              title="No applications in this view"
              description="Try another filter to review the rest of your application history."
            />
          ) : (
            <div className="grid w-full gap-4">
              <EmptyState
                title="Start your first application"
                description="Prepare a shortlisted job with Job Finder to see it here."
              />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="sm" type="button" variant="primary">
                  <Link to={JOB_FINDER_ROUTE_PATHS.reviewQueue}>
                    Go to Shortlisted
                  </Link>
                </Button>
                <Button asChild size="sm" type="button" variant="ghost">
                  <Link to={JOB_FINDER_ROUTE_PATHS.discovery}>Find jobs</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <ul
          aria-label="Applications"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
          data-locked-pane-scroll-region
          ref={recordsRegionRef}
        >
          {pagedRecords.map((record) => {
            const stage = getApplicationStagePresentation(record);
            const attemptLabel = getAttemptLabel(record.lastAttemptState);
            const recordStateDescriptionId = `applications-record-${record.id}-state-description`;

            return (
              <li
                key={record.id}
                className={cn(
                  "relative border-b border-(--surface-panel-border) text-[0.85rem] tracking-normal transition-colors last:border-b-0 hover:bg-(--surface-panel-raised)",
                  selectedRecord?.id === record.id
                    ? "border-l-2 border-l-primary bg-(--surface-panel-raised)"
                    : "",
                )}
              >
                <button
                  aria-current={
                    selectedRecord?.id === record.id ? "true" : undefined
                  }
                  aria-describedby={recordStateDescriptionId}
                  aria-keyshortcuts="ArrowUp ArrowDown Home End"
                  aria-label={`View details for ${record.title} at ${record.company}`}
                  className="absolute inset-0 z-10 rounded-[inherit] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/30"
                  data-collection-item-id={record.id}
                  onClick={() => onSelectRecord(record.id)}
                  onKeyDown={(event) =>
                    handleRecordRowKeyDown(event, record.id)
                  }
                  type="button"
                />
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 px-4 py-3">
                  <div className="grid min-w-0 gap-0.5">
                    <strong className="font-display min-w-0 break-words text-[1rem] font-semibold tracking-[-0.015em] text-foreground">
                      {record.title}
                    </strong>
                    <span className="min-w-0 break-words text-[0.85rem] text-muted-foreground">
                      {record.company}
                      <span className="text-foreground-soft">
                        {" • "}
                        {getApplicationLatestActivityLabel(record)}
                      </span>
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center justify-end gap-1">
                    <span className="sr-only">Stage</span>
                    <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
                  </div>
                  <div className="col-start-2 flex min-w-0 items-center justify-end gap-1">
                    <span className="sr-only">Apply attempt</span>
                    <StatusBadge tone={getAttemptTone(record.lastAttemptState)}>
                      {attemptLabel}
                    </StatusBadge>
                  </div>
                </div>
                <span className="sr-only" id={recordStateDescriptionId}>
                  Stage {stage.label}. Preparation attempt {attemptLabel}.
                </span>
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
