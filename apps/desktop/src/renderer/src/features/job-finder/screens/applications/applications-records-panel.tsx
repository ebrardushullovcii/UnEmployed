import { useEffect, useId, useMemo, useState } from "react";
import type { ApplicationRecord } from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { EmptyState } from "../../components/empty-state";
import {
  CollectionPagination,
  COLLECTION_PAGE_SIZE,
} from "../../components/collection-pagination";
import { StatusBadge } from "../../components/status-badge";
import { JOB_FINDER_ROUTE_HREFS } from "../../lib/job-finder-route-hrefs";
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--surface-panel-border) px-8 py-5">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="font-display text-lg font-bold uppercase tracking-(--tracking-heading) text-primary">
            Application tracker
          </h2>
          <Badge variant="section">
            {recordCount} {recordCount === 1 ? "application" : "applications"}
          </Badge>
        </div>

        <div
          aria-labelledby={filterGroupId}
          className="flex flex-wrap gap-2"
          role="group"
        >
          <span className="sr-only" id={filterGroupId}>
            Application filters
          </span>
          {APPLICATION_FILTERS.map((filterOption) => (
            <Button
              aria-pressed={activeFilter === filterOption}
              className="rounded-full"
              key={filterOption}
              onClick={() => onFilterChange(filterOption)}
              size="sm"
              type="button"
              variant={activeFilter === filterOption ? "secondary" : "ghost"}
            >
              {APPLICATION_FILTER_LABELS[filterOption]}
              <span className="label-mono-xs rounded-full border border-current/15 px-1.5 py-0.5 leading-none">
                {filterCounts[filterOption]}
              </span>
            </Button>
          ))}
        </div>
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
                description="Start preparing a shortlisted job with Apply Copilot to see it here."
              />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="sm" type="button" variant="primary">
                  <a href={JOB_FINDER_ROUTE_HREFS.reviewQueue}>
                    Go to Shortlisted
                  </a>
                </Button>
                <Button asChild size="sm" type="button" variant="ghost">
                  <a href={JOB_FINDER_ROUTE_HREFS.discovery}>Find jobs</a>
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <ul
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
          aria-label="Applications"
        >
          {pagedRecords.map((record) => {
            const stage = getApplicationStagePresentation(record);

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
                  aria-label={`View details for ${record.title} at ${record.company}`}
                  className="absolute inset-0 z-10 rounded-[inherit] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/30"
                  onClick={() => onSelectRecord(record.id)}
                  type="button"
                />
                <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 @[42rem]/tracker:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto_auto]">
                  <div className="col-span-2 grid min-w-0 gap-1 @[42rem]/tracker:col-span-1">
                    <span className="label-mono-xs text-muted-foreground">
                      Job
                    </span>
                    <strong className="font-display min-w-0 break-words text-[1rem] font-semibold tracking-[-0.015em] text-foreground">
                      {record.title}
                    </strong>
                    <span className="min-w-0 break-words text-[0.8rem] text-muted-foreground">
                      {record.company}
                    </span>
                  </div>
                  <div className="col-span-2 grid min-w-0 content-start gap-1 @[42rem]/tracker:col-span-1">
                    <span className="label-mono-xs text-muted-foreground">
                      Latest activity
                    </span>
                    <span className="min-w-0 break-words text-[0.8rem] text-foreground-soft">
                      {getApplicationLatestActivityLabel(record)}
                    </span>
                  </div>
                  <div className="grid min-w-0 content-start justify-items-start gap-1">
                    <span className="label-mono-xs text-muted-foreground">
                      Stage
                    </span>
                    <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
                  </div>
                  <div className="grid min-w-0 content-start justify-items-start gap-1">
                    <span className="label-mono-xs text-muted-foreground">
                      Apply attempt
                    </span>
                    <StatusBadge tone={getAttemptTone(record.lastAttemptState)}>
                      {getAttemptLabel(record.lastAttemptState)}
                    </StatusBadge>
                  </div>
                </div>
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
