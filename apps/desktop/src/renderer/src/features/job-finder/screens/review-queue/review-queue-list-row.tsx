import { memo, type KeyboardEvent } from "react";
import { Checkbox } from "@renderer/components/ui/checkbox";
import {
  ProgressBar,
  SelectableRow,
  SelectableRowLine,
} from "@renderer/components/ui";
import { cn } from "@renderer/lib/cn";
import {
  jobFinderListRowBadgeSlotClassName,
  jobFinderListRowClassName,
  jobFinderListRowLinesClassName,
  jobFinderListRowMetaClassName,
  jobFinderListRowStatusClassName,
  jobFinderListRowTitleClassName,
  jobFinderListRowTitleLineClassName,
} from "../../components/list-row";
import { StatusBadge } from "../../components/status-badge";
import type { BadgeTone } from "../../lib/job-finder-types";

/**
 * One Shortlisted row.
 *
 * Batch preparation is a single run that moves one job at a time, and the
 * whole list used to re-render on every one of those steps: forty rows
 * rebuilt to change one badge, with the pointer hovering a row whose subtree
 * was being replaced underneath it. The row takes only already-derived,
 * comparable values, so React's shallow prop check is enough to skip the rows
 * the step did not touch. Nothing here is recomputed from the queue.
 *
 * Every prop is a string, a boolean, or a handler the panel keeps stable
 * across renders. Adding an object or an inline function to this list
 * silently un-memoises every row, so derive it in the panel instead.
 */
export interface ReviewQueueRowProps {
  /** Rendered only while the batch-actions disclosure is open. */
  batchSelectionVisible: boolean;
  checkboxId: string;
  disabledReasonId: string;
  employerLocationLine: string | null;
  jobId: string;
  onSelect: (jobId: string) => void;
  onSelectionKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    jobId: string,
  ) => void;
  onToggleSelection: (jobId: string, checked: boolean) => void;
  resumePolicyCaption: string;
  selected: boolean;
  selectedForBatch: boolean;
  /** The whole batch is full, so an unselected row cannot join it. */
  selectionLimitReached: boolean;
  selectionDisabled: boolean;
  selectionDisabledReason: string | null;
  showProgress: boolean;
  statusLabel: string;
  statusTone: BadgeTone;
  title: string;
}

function ReviewQueueRowComponent({
  batchSelectionVisible,
  checkboxId,
  disabledReasonId,
  employerLocationLine,
  jobId,
  onSelect,
  onSelectionKeyDown,
  onToggleSelection,
  resumePolicyCaption,
  selected,
  selectedForBatch,
  selectionLimitReached,
  selectionDisabled,
  selectionDisabledReason,
  showProgress,
  statusLabel,
  statusTone,
  title,
}: ReviewQueueRowProps) {
  return (
    // Selection is a tint plus an inset accent bar owned by the shared
    // primitive. The row's padding, margin and border-width are identical in
    // both states, so selecting a row can no longer resize it or move every
    // row below it.
    <SelectableRow
      as="div"
      className={cn(jobFinderListRowClassName, "text-foreground")}
      selected={selected}
    >
      {batchSelectionVisible ? (
        <label
          htmlFor={checkboxId}
          className={cn(
            "inline-flex items-center gap-2 text-(length:--text-tiny) uppercase tracking-(--tracking-badge)",
            !selectionDisabled
              ? "text-foreground-soft"
              : "text-muted-foreground",
          )}
        >
          <Checkbox
            aria-describedby={selectionDisabled ? disabledReasonId : undefined}
            id={checkboxId}
            checked={selectedForBatch}
            disabled={selectionDisabled}
            onCheckedChange={(value) => {
              const checked = value === true;
              if (checked && !selectedForBatch && selectionLimitReached) {
                return;
              }
              onToggleSelection(jobId, checked);
            }}
          />
          Select for batch
        </label>
      ) : null}
      <button
        aria-current={selected ? "true" : undefined}
        aria-keyshortcuts="ArrowUp ArrowDown Home End"
        className={cn(
          jobFinderListRowLinesClassName,
          "w-full text-left outline-none transition-colors hover:bg-transparent focus-visible:ring-[3px] focus-visible:ring-ring/40",
        )}
        data-collection-item-id={jobId}
        onClick={() => onSelect(jobId)}
        onKeyDown={(event) => onSelectionKeyDown(event, jobId)}
        type="button"
      >
        {/* Title line, with the one badge slot trailing it - the same slot
            Find jobs and Applications use. The badge renders for every row,
            selected or not: hiding it on the selected row made that row look
            stripped of its state rather than merely selected. */}
        <div className={jobFinderListRowTitleLineClassName}>
          <strong className={jobFinderListRowTitleClassName}>{title}</strong>
          <div className={jobFinderListRowBadgeSlotClassName}>
            <SelectableRowLine className="flex justify-end">
              <StatusBadge
                className="max-w-none shrink-0 whitespace-nowrap"
                tone={statusTone}
              >
                {statusLabel}
              </StatusBadge>
            </SelectableRowLine>
          </div>
        </div>
        {employerLocationLine ? (
          <span className={jobFinderListRowMetaClassName}>
            {employerLocationLine}
          </span>
        ) : null}
        {/* The resume-state caption renders on every row too, so a selected
            row keeps the same shape as its neighbours. */}
        <SelectableRowLine
          className={cn(
            jobFinderListRowStatusClassName,
            "font-medium text-foreground-soft",
          )}
        >
          {resumePolicyCaption}
        </SelectableRowLine>
        {selectionDisabledReason ? (
          <span
            className="block w-full text-(length:--text-small) leading-5 text-muted-foreground"
            id={disabledReasonId}
          >
            {selectionDisabledReason}
          </span>
        ) : null}
        {showProgress ? (
          <div className="grid min-w-0 w-full gap-1.5">
            {/* Row-level progress had no real percentage behind it either; it
                only needs to say "this one is running". */}
            <ProgressBar
              ariaLabel="Resume preparation in progress"
              className="h-1.5 w-full overflow-hidden rounded-full bg-(--surface-progress-track)"
              indeterminate
            />
          </div>
        ) : null}
      </button>
    </SelectableRow>
  );
}

export const ReviewQueueRow = memo(ReviewQueueRowComponent);
