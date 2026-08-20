import { useEffect, useMemo, useState } from "react";
import type {
  ApplicationCrmStage,
  ApplicationRecord,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { Badge } from "@renderer/components/ui/badge";
import {
  APPLICATION_CRM_PAGE_SIZE,
  CollectionPagination,
} from "../../components/collection-pagination";
import {
  CollectionColumnPicker,
  CollectionNoMatches,
  CollectionSavedViews,
  CollectionSearchToolbar,
  matchesCollectionSearch,
} from "../../components/collection-search-toolbar";
import { usePersistedCollectionView } from "../../hooks/use-persisted-collection-view";

import {
  APPLICATION_CRM_STAGE_LABELS,
  APPLICATION_CRM_STAGE_ORDER,
  applicationCrmDataForView,
  buildApplicationCrmCalendarForView,
  groupApplicationRecordsByStage,
  inferApplicationCrmStageForView,
} from "./applications-crm-model";

export const APPLICATION_CRM_VIEW_VALUES = [
  "table",
  "kanban",
  "calendar",
] as const;
export type ApplicationCrmView = (typeof APPLICATION_CRM_VIEW_VALUES)[number];

const crmSavedViewValues = [
  "all",
  "needs_follow_up",
  "interviews",
  "offers",
] as const;
type CrmSavedView = (typeof crmSavedViewValues)[number];

const crmSavedViewLabels: Record<CrmSavedView, string> = {
  all: "All applications",
  needs_follow_up: "Needs follow-up",
  interviews: "Interviews",
  offers: "Offers",
};

const columnValues = [
  "job",
  "company",
  "stage",
  "reminder",
  "interview",
  "tags",
  "updated",
] as const;
type CrmColumn = (typeof columnValues)[number];

const viewLabels: Record<ApplicationCrmView, string> = {
  table: "Table",
  kanban: "Kanban",
  calendar: "Calendar",
};

function RecordButton(props: {
  record: ApplicationRecord;
  selected: boolean;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const crm = applicationCrmDataForView(props.record);
  const pendingReminderCount = crm.reminders.filter(
    (reminder) => reminder.status === "pending",
  ).length;
  return (
    <button
      aria-current={props.selected ? "true" : undefined}
      className={cn(
        "grid w-full min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-3 text-left outline-none transition-colors hover:bg-(--surface-panel-raised) focus-visible:ring-[3px] focus-visible:ring-ring/30",
        props.selected && "border-primary/60 bg-(--surface-panel-raised)",
        props.compact && "gap-1.5 p-2.5",
      )}
      onClick={() => props.onSelect(props.record.id)}
      type="button"
    >
      <strong className="min-w-0 break-words text-sm text-foreground">
        {props.record.title}
      </strong>
      <span className="min-w-0 break-words text-xs text-muted-foreground">
        {props.record.company}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {crm.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="section">
            {tag}
          </Badge>
        ))}
        {pendingReminderCount > 0 ? (
          <Badge variant="section">
            {pendingReminderCount} reminder
            {pendingReminderCount === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </span>
    </button>
  );
}

export function ApplicationsCrmViews(props: {
  records: readonly ApplicationRecord[];
  selectedRecordId: string | null;
  view: ApplicationCrmView;
  onSelectRecord: (recordId: string) => void;
  onViewChange: (view: ApplicationCrmView) => void;
  onBulkStageChange?: (
    recordIds: readonly string[],
    stage: ApplicationCrmStage,
  ) => Promise<void>;
}) {
  const {
    applySavedView,
    deleteSavedView,
    density,
    query,
    savedViews,
    saveCurrentView,
    setDensity,
    setQuery,
  } = usePersistedCollectionView("applications-crm", "comfortable");
  const [savedView, setSavedView] = useState<CrmSavedView>(() => {
    try {
      const stored = window.localStorage.getItem(
        "unemployed.job-finder.applications-crm.saved-view.v1",
      );
      return crmSavedViewValues.includes(stored as CrmSavedView)
        ? (stored as CrmSavedView)
        : "all";
    } catch {
      return "all";
    }
  });
  const [visibleColumns, setVisibleColumns] = useState<readonly CrmColumn[]>(
    () => {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem(
            "unemployed.job-finder.applications-crm.columns.v1",
          ) ?? "null",
        ) as unknown;
        return Array.isArray(stored)
          ? columnValues.filter((column) => stored.includes(column))
          : columnValues;
      } catch {
        return columnValues;
      }
    },
  );
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "unemployed.job-finder.applications-crm.saved-view.v1",
        savedView,
      );
      window.localStorage.setItem(
        "unemployed.job-finder.applications-crm.columns.v1",
        JSON.stringify(visibleColumns),
      );
    } catch {
      // The CRM stays usable when renderer preferences cannot be persisted.
    }
  }, [savedView, visibleColumns]);

  const filteredRecords = useMemo(
    () =>
      props.records.filter((record) => {
        const crm = applicationCrmDataForView(record);
        const savedViewMatch =
          savedView === "all" ||
          (savedView === "needs_follow_up" &&
            (crm.stage === "no_response" ||
              crm.reminders.some(
                (reminder) => reminder.status === "pending",
              ))) ||
          (savedView === "interviews" &&
            crm.interviews.some(
              (interview) => interview.status === "scheduled",
            )) ||
          (savedView === "offers" && crm.stage === "offer");
        return (
          savedViewMatch &&
          matchesCollectionSearch(query, [
            record.title,
            record.company,
            crm.stage,
            crm.customStageId,
            ...crm.tags,
            ...crm.contacts.flatMap((contact) => [contact.name, contact.email]),
          ])
        );
      }),
    [props.records, query, savedView],
  );

  useEffect(() => {
    const visibleIds = new Set(filteredRecords.map((record) => record.id));
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filteredRecords]);

  useEffect(() => {
    setPage(1);
  }, [props.view, query, savedView]);

  const calendar = useMemo(
    () => buildApplicationCrmCalendarForView(filteredRecords),
    [filteredRecords],
  );
  const pageItemCount =
    props.view === "calendar" ? calendar.length : filteredRecords.length;
  const pageCount = Math.max(
    1,
    Math.ceil(pageItemCount / APPLICATION_CRM_PAGE_SIZE),
  );
  const currentPage = Math.min(page, pageCount);
  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pageCount));
  }, [pageCount]);
  const pagedRecords = useMemo(
    () =>
      filteredRecords.slice(
        (currentPage - 1) * APPLICATION_CRM_PAGE_SIZE,
        currentPage * APPLICATION_CRM_PAGE_SIZE,
      ),
    [currentPage, filteredRecords],
  );

  const grouped = useMemo(
    () => groupApplicationRecordsByStage(pagedRecords),
    [pagedRecords],
  );
  const groupedTotals = useMemo(
    () => groupApplicationRecordsByStage(filteredRecords),
    [filteredRecords],
  );
  const pagedCalendar = useMemo(
    () =>
      calendar.slice(
        (currentPage - 1) * APPLICATION_CRM_PAGE_SIZE,
        currentPage * APPLICATION_CRM_PAGE_SIZE,
      ),
    [calendar, currentPage],
  );
  const recordsById = useMemo(
    () => new Map(filteredRecords.map((record) => [record.id, record])),
    [filteredRecords],
  );
  const selectedRecordIndex = useMemo(
    () =>
      props.selectedRecordId
        ? filteredRecords.findIndex(
            (record) => record.id === props.selectedRecordId,
          )
        : -1,
    [filteredRecords, props.selectedRecordId],
  );
  const selectedCalendarIndex = useMemo(
    () =>
      props.selectedRecordId
        ? calendar.findIndex(
            (entry) => entry.applicationRecordId === props.selectedRecordId,
          )
        : -1,
    [calendar, props.selectedRecordId],
  );
  useEffect(() => {
    const selectedIndex =
      props.view === "calendar" ? selectedCalendarIndex : selectedRecordIndex;
    if (selectedIndex < 0) return;
    setPage(Math.floor(selectedIndex / APPLICATION_CRM_PAGE_SIZE) + 1);
  }, [props.view, selectedCalendarIndex, selectedRecordIndex]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const columnVisible = (column: CrmColumn) => visibleColumns.includes(column);
  const rowPadding =
    density === "compact" ? "py-2" : density === "detailed" ? "py-5" : "py-3";

  function submitBulkStageChange(stage: ApplicationCrmStage) {
    if (!props.onBulkStageChange || selectedIds.length === 0) return;
    setBulkPending(true);
    const operation = props.onBulkStageChange(selectedIds, stage);
    void operation
      .then(
        () => setSelectedIds([]),
        () => undefined,
      )
      .finally(() => setBulkPending(false));
  }

  return (
    <section className="surface-panel-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--surface-panel-border) px-5 py-3">
        <div>
          <h2
            className="font-display text-lg font-bold uppercase tracking-(--tracking-heading) text-primary"
            id="application-tracker-heading"
          >
            Application tracker
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {filteredRecords.length} of {props.records.length} applications in
            this view
          </p>
        </div>
        <div aria-label="Application view" className="flex gap-1" role="group">
          {APPLICATION_CRM_VIEW_VALUES.map((view) => (
            <Button
              aria-pressed={props.view === view}
              key={view}
              onClick={() => props.onViewChange(view)}
              size="sm"
              type="button"
              variant={props.view === view ? "secondary" : "ghost"}
            >
              {viewLabels[view]}
            </Button>
          ))}
        </div>
      </div>

      <CollectionSearchToolbar
        density={density}
        label="Search applications"
        onDensityChange={setDensity}
        onQueryChange={setQuery}
        placeholder="Search jobs, companies, contacts, stages, or tags"
        query={query}
        totalCount={props.records.length}
        viewActions={
          <div className="flex items-center gap-1">
            <CollectionSavedViews
              onApply={applySavedView}
              onDelete={deleteSavedView}
              onSave={saveCurrentView}
              views={savedViews}
            />
            {props.view === "table" ? (
              <CollectionColumnPicker
                columns={columnValues.map((column) => ({
                  id: column,
                  label: column === "reminder" ? "Next reminder" : column,
                  required: column === "job",
                  visible: visibleColumns.includes(column),
                }))}
                onChange={(columnId, visible) =>
                  setVisibleColumns((current) =>
                    visible
                      ? [...current, columnId as CrmColumn]
                      : current.filter((value) => value !== columnId),
                  )
                }
              />
            ) : null}
          </div>
        }
        visibleCount={filteredRecords.length}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--surface-panel-border) px-5 py-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          Lifecycle view
          <select
            className="h-9 rounded-(--radius-field) border border-input bg-background px-2 text-sm"
            onChange={(event) =>
              setSavedView(event.target.value as CrmSavedView)
            }
            value={savedView}
          >
            {crmSavedViewValues.map((view) => (
              <option key={view} value={view}>
                {crmSavedViewLabels[view]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {props.records.length === 0 ? (
        <div className="grid min-h-48 place-items-center px-6 text-center">
          <div>
            <h3 className="font-semibold text-foreground">
              No applications yet
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Shortlist a job or prepare an application to start tracking it
              here.
            </p>
          </div>
        </div>
      ) : filteredRecords.length === 0 && query ? (
        <CollectionNoMatches
          noun="applications"
          onClear={() => setQuery("")}
          query={query}
        />
      ) : filteredRecords.length === 0 ? (
        <div className="grid min-h-48 place-items-center px-6 text-center">
          <div>
            <h3 className="font-semibold text-foreground">
              No applications match this lifecycle view
            </h3>
            <Button
              className="mt-3"
              onClick={() => setSavedView("all")}
              size="sm"
              type="button"
              variant="ghost"
            >
              Show all applications
            </Button>
          </div>
        </div>
      ) : null}

      {props.view === "table" && filteredRecords.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table
            aria-labelledby="application-tracker-heading"
            className="w-full min-w-200 border-collapse text-left text-sm"
          >
            <thead className="sticky top-0 z-10 bg-(--surface-panel-solid)">
              <tr className="border-b border-(--surface-panel-border)">
                <th className="w-10 px-3 py-3" scope="col">
                  <input
                    aria-label="Select all matching applications"
                    checked={
                      selectedIdSet.size > 0 &&
                      selectedIdSet.size === filteredRecords.length
                    }
                    onChange={(event) =>
                      setSelectedIds(
                        event.target.checked
                          ? filteredRecords.map((record) => record.id)
                          : [],
                      )
                    }
                    type="checkbox"
                  />
                </th>
                {columnValues.filter(columnVisible).map((column) => (
                  <th
                    className="label-mono-xs px-4 py-3 capitalize"
                    key={column}
                    scope="col"
                  >
                    {column === "reminder" ? "Next reminder" : column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRecords.map((record) => {
                const crm = applicationCrmDataForView(record);
                const reminder = crm.reminders
                  .filter((entry) => entry.status === "pending")
                  .sort((left, right) =>
                    left.dueAt.localeCompare(right.dueAt),
                  )[0];
                const interview = crm.interviews
                  .filter((entry) => entry.status === "scheduled")
                  .sort((left, right) =>
                    left.startsAt.localeCompare(right.startsAt),
                  )[0];
                return (
                  <tr
                    className={cn(
                      "cursor-pointer border-b border-(--surface-panel-border) hover:bg-(--surface-panel-raised)",
                      props.selectedRecordId === record.id &&
                        "bg-(--surface-panel-raised)",
                    )}
                    key={record.id}
                    onClick={() => props.onSelectRecord(record.id)}
                  >
                    <td
                      className={cn("px-3", rowPadding)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        aria-label={`Select ${record.title} at ${record.company}`}
                        checked={selectedIdSet.has(record.id)}
                        onChange={(event) =>
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (event.target.checked) {
                              next.add(record.id);
                            } else {
                              next.delete(record.id);
                            }
                            return [...next];
                          })
                        }
                        type="checkbox"
                      />
                    </td>
                    {columnVisible("job") ? (
                      <td
                        className={cn(
                          "px-4 font-semibold text-foreground",
                          rowPadding,
                        )}
                      >
                        <button
                          className="text-left outline-none focus-visible:underline"
                          onClick={() => props.onSelectRecord(record.id)}
                          type="button"
                        >
                          {record.title}
                        </button>
                      </td>
                    ) : null}
                    {columnVisible("company") ? (
                      <td
                        className={cn("px-4 text-foreground-soft", rowPadding)}
                      >
                        {record.company}
                      </td>
                    ) : null}
                    {columnVisible("stage") ? (
                      <td className={cn("px-4", rowPadding)}>
                        {
                          APPLICATION_CRM_STAGE_LABELS[
                            inferApplicationCrmStageForView(record)
                          ]
                        }
                      </td>
                    ) : null}
                    {columnVisible("reminder") ? (
                      <td
                        className={cn("px-4 text-muted-foreground", rowPadding)}
                      >
                        {reminder
                          ? new Date(reminder.dueAt).toLocaleDateString()
                          : "—"}
                      </td>
                    ) : null}
                    {columnVisible("interview") ? (
                      <td
                        className={cn("px-4 text-muted-foreground", rowPadding)}
                      >
                        {interview
                          ? new Date(interview.startsAt).toLocaleString()
                          : "—"}
                      </td>
                    ) : null}
                    {columnVisible("tags") ? (
                      <td
                        className={cn("px-4 text-muted-foreground", rowPadding)}
                      >
                        {crm.tags.join(", ") || "—"}
                      </td>
                    ) : null}
                    {columnVisible("updated") ? (
                      <td
                        className={cn("px-4 text-muted-foreground", rowPadding)}
                      >
                        {new Date(record.lastUpdatedAt).toLocaleDateString()}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {props.view === "table" && selectedIds.length > 0 ? (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-primary/30 bg-(--surface-panel-solid) px-5 py-3 shadow-[0_-12px_28px_rgba(0,0,0,0.35)]">
          <strong className="text-sm text-foreground">
            {selectedIds.length} matching application
            {selectedIds.length === 1 ? "" : "s"} selected
          </strong>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={bulkPending || !props.onBulkStageChange}
              onClick={() => submitBulkStageChange("reviewing")}
              size="sm"
              type="button"
              variant="secondary"
            >
              Move to Reviewing
            </Button>
            <Button
              disabled={bulkPending || !props.onBulkStageChange}
              onClick={() => submitBulkStageChange("withdrawn")}
              size="sm"
              type="button"
              variant="ghost"
            >
              Mark withdrawn
            </Button>
            <Button
              disabled={bulkPending}
              onClick={() => setSelectedIds([])}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      {props.view === "kanban" && filteredRecords.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="flex min-w-max items-start gap-3">
            {APPLICATION_CRM_STAGE_ORDER.map((stage) => {
              const stageRecords = grouped.get(stage) ?? [];
              return (
                <section
                  className="grid w-72 shrink-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-3"
                  key={stage}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {APPLICATION_CRM_STAGE_LABELS[stage]}
                    </h3>
                    <Badge variant="section">
                      {groupedTotals.get(stage)?.length ?? 0}
                    </Badge>
                  </div>
                  <div className="grid gap-2">
                    {stageRecords.length > 0 ? (
                      stageRecords.map((record) => (
                        <RecordButton
                          compact
                          key={record.id}
                          onSelect={props.onSelectRecord}
                          record={record}
                          selected={props.selectedRecordId === record.id}
                        />
                      ))
                    ) : (
                      <p className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) p-3 text-xs text-muted-foreground">
                        No applications
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {props.view === "calendar" && filteredRecords.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {calendar.length > 0 ? (
            <ol className="grid gap-3">
              {pagedCalendar.map((entry) => {
                const record = recordsById.get(entry.applicationRecordId);
                return (
                  <li
                    className="grid gap-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                    key={entry.id}
                  >
                    <time
                      className="text-sm font-semibold text-foreground"
                      dateTime={entry.startsAt}
                    >
                      {new Date(entry.startsAt).toLocaleString()}
                    </time>
                    <div className="min-w-0">
                      <strong className="block break-words text-sm text-foreground">
                        {entry.title}
                      </strong>
                      <span className="label-mono-xs">
                        {entry.kind.replaceAll("_", " ")}
                      </span>
                    </div>
                    <Button
                      disabled={!record}
                      onClick={() => record && props.onSelectRecord(record.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Open
                    </Button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="grid min-h-48 place-items-center text-center">
              <div>
                <h3 className="font-semibold text-foreground">
                  Nothing scheduled
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pending reminders, interviews, and offer deadlines will appear
                  here.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {pageItemCount > 0 ? (
        <CollectionPagination
          itemLabel={
            props.view === "calendar" ? "scheduled items" : "applications"
          }
          onPageChange={setPage}
          page={currentPage}
          pageSize={APPLICATION_CRM_PAGE_SIZE}
          totalCount={pageItemCount}
        />
      ) : null}
    </section>
  );
}
