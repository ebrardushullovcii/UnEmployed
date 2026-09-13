import type {
  ApplyRunDetails,
  JobFinderApplyRunActionInput,
  JobFinderExactApplicationTarget,
} from "@unemployed/contracts";
import { cn } from "@renderer/lib/cn";
import { APPLICATION_DETAIL_FACT_LABEL_CLASS } from "./applications-detail-fact-strip";
import { Button } from "@renderer/components/ui";
import {
  formatTimestamp,
  formatStatusLabel,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";
import { getApprovalTone } from "./applications-detail-panel-helpers";

/**
 * True while this run is still waiting for the person to approve preparation.
 *
 * The panel pins the approve control to its own footer in exactly this state,
 * so one predicate decides both that footer and whether the section below
 * repeats the button.
 */
export function isAwaitingPreparationApproval(
  details: ApplyRunDetails | null,
): boolean {
  return (
    details?.submitApproval?.status === "pending" &&
    details.run.state === "awaiting_submit_approval"
  );
}

/** The exact words on the approve control, wherever it is drawn. */
export function preparationApprovalActionLabel(jobCount: number): string {
  return jobCount === 1
    ? "Approve safe preparation"
    : `Approve safe preparation for ${jobCount} jobs`;
}

export function ApplicationsDetailPanelSubmitApprovalSection(props: {
  approvalScopeEntries: readonly { jobId: string; label: string }[];
  /**
   * False while the panel's pinned footer carries the approve control, so the
   * screen never shows the same button twice.
   */
  showApproveAction?: boolean;
  isApplyRunPending: (runId: string) => boolean;
  isSelectedRunPending: boolean;
  onApproveApplyRun: (input: JobFinderApplyRunActionInput) => void;
  onCancelApplyRun: (input: JobFinderApplyRunActionInput) => void;
  onRevokeApplyRunApproval: (input: JobFinderApplyRunActionInput) => void;
  selectedApplicationTarget: JobFinderExactApplicationTarget;
  selectedApplyRunDetails: ApplyRunDetails | null;
}) {
  const {
    approvalScopeEntries,
    isApplyRunPending,
    isSelectedRunPending,
    onApproveApplyRun,
    onCancelApplyRun,
    onRevokeApplyRunApproval,
    selectedApplicationTarget,
    selectedApplyRunDetails,
  } = props;
  const showApproveAction = props.showApproveAction ?? true;

  if (!selectedApplyRunDetails?.submitApproval) {
    return null;
  }

  const submitApproval = selectedApplyRunDetails.submitApproval;

  return (
    <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h3
            className={cn(APPLICATION_DETAIL_FACT_LABEL_CLASS, "text-primary")}
          >
            Preparation approval
          </h3>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            Approve preparation for this exact run and its already approved
            resume choices. This does not authorize account creation or a final
            application submission.
          </p>
        </div>
        <StatusBadge tone={getApprovalTone(submitApproval.status)}>
          {formatStatusLabel(submitApproval.status)}
        </StatusBadge>
      </div>
      <div className="grid gap-3 2xl:grid-cols-2">
        <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
          <p className="label-mono-xs">Scope</p>
          <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
            {submitApproval.jobIds.length} job
            {submitApproval.jobIds.length === 1 ? "" : "s"}
          </strong>
          <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
            Run mode: {formatStatusLabel(submitApproval.mode)}
          </p>
          {approvalScopeEntries.length > 0 ? (
            <ul className="mt-3 grid gap-1 text-(length:--text-small) leading-6 text-foreground-soft">
              {approvalScopeEntries.map((entry) => (
                <li key={entry.jobId}>{entry.label}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
          <p className="label-mono-xs">Recorded</p>
          <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
            {formatTimestamp(submitApproval.createdAt)}
          </strong>
          {submitApproval.approvedAt ? (
            <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
              Approved: {formatTimestamp(submitApproval.approvedAt)}
            </p>
          ) : null}
          {submitApproval.revokedAt ? (
            <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
              Revoked: {formatTimestamp(submitApproval.revokedAt)}
            </p>
          ) : null}
        </div>
      </div>
      {submitApproval.detail ? (
        <p className="text-(length:--text-small) leading-6 text-foreground-soft">
          {submitApproval.detail}
        </p>
      ) : null}
      <div className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-3 py-3 text-(length:--text-small) leading-6 text-foreground-soft">
        Preparation approval applies only to these jobs and their current
        approved resume artifacts. Changing a job or resume requires fresh
        approval. You can revoke or cancel at any time. Job Finder cannot create
        accounts or submit applications. Review and submit on each employer site
        yourself.
      </div>
      <div className="flex flex-wrap gap-2">
        {showApproveAction &&
        isAwaitingPreparationApproval(selectedApplyRunDetails) ? (
          <Button
            onClick={() =>
              onApproveApplyRun({
                ...selectedApplicationTarget,
                runId: submitApproval.runId,
              })
            }
            pending={isApplyRunPending(submitApproval.runId)}
            type="button"
            variant="secondary"
            disabled={isApplyRunPending(submitApproval.runId)}
          >
            {preparationApprovalActionLabel(submitApproval.jobIds.length)}
          </Button>
        ) : null}
        {submitApproval.status === "approved" &&
        selectedApplyRunDetails.run.state !== "completed" &&
        selectedApplyRunDetails.run.state !== "cancelled" &&
        selectedApplyRunDetails.run.state !== "failed" ? (
          <Button
            onClick={() =>
              onRevokeApplyRunApproval({
                ...selectedApplicationTarget,
                runId: submitApproval.runId,
              })
            }
            pending={isApplyRunPending(submitApproval.runId)}
            type="button"
            variant="ghost"
            disabled={isApplyRunPending(submitApproval.runId)}
          >
            Revoke approval
          </Button>
        ) : null}
        {selectedApplyRunDetails.run.state !== "completed" &&
        selectedApplyRunDetails.run.state !== "cancelled" &&
        selectedApplyRunDetails.run.state !== "failed" ? (
          <Button
            onClick={() =>
              onCancelApplyRun({
                ...selectedApplicationTarget,
                runId: selectedApplyRunDetails.run.id,
              })
            }
            pending={isSelectedRunPending}
            type="button"
            variant="ghost"
            disabled={isSelectedRunPending}
          >
            Cancel run
          </Button>
        ) : null}
      </div>
    </section>
  );
}
