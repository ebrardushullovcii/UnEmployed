import type { ApplyRunDetails } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui";
import {
  formatTimestamp,
  formatStatusLabel,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";
import { getApprovalTone } from "./applications-detail-panel-helpers";

export function ApplicationsDetailPanelSubmitApprovalSection(props: {
  approvalScopeEntries: readonly { jobId: string; label: string }[];
  isApplyRunPending: (runId: string) => boolean;
  isSelectedRunPending: boolean;
  onApproveApplyRun: (runId: string) => void;
  onCancelApplyRun: (runId: string) => void;
  onRevokeApplyRunApproval: (runId: string) => void;
  selectedApplyRunDetails: ApplyRunDetails | null;
}) {
  const {
    approvalScopeEntries,
    isApplyRunPending,
    isSelectedRunPending,
    onApproveApplyRun,
    onCancelApplyRun,
    onRevokeApplyRunApproval,
    selectedApplyRunDetails,
  } = props;

  if (!selectedApplyRunDetails?.submitApproval) {
    return null;
  }

  const submitApproval = selectedApplyRunDetails.submitApproval;

  return (
    <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="label-mono-xs text-primary">
            Safe application preparation
          </h3>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            Approve preparation for this exact run and its already approved
            résumé choices. This does not authorize account creation or a final
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
        approved résumé artifacts. Changing a job or résumé requires fresh
        approval. You can revoke or cancel at any time. Final submission and
        account creation remain disabled and always require a separate,
        explicit user decision.
      </div>
      <div className="flex flex-wrap gap-2">
        {submitApproval.status === "pending" &&
        selectedApplyRunDetails.run.state === "awaiting_submit_approval" ? (
          <Button
            onClick={() => onApproveApplyRun(submitApproval.runId)}
            pending={isApplyRunPending(submitApproval.runId)}
            type="button"
            variant="secondary"
            disabled={isApplyRunPending(submitApproval.runId)}
          >
            {submitApproval.jobIds.length === 1
              ? "Approve safe preparation"
              : `Approve safe preparation for ${submitApproval.jobIds.length} jobs`}
          </Button>
        ) : null}
        {submitApproval.status === "approved" &&
        selectedApplyRunDetails.run.state !== "completed" &&
        selectedApplyRunDetails.run.state !== "cancelled" &&
        selectedApplyRunDetails.run.state !== "failed" ? (
          <Button
            onClick={() => onRevokeApplyRunApproval(submitApproval.runId)}
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
            onClick={() => onCancelApplyRun(selectedApplyRunDetails.run.id)}
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
