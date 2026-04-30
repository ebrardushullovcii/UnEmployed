import type { ApplyRunDetails } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui";
import {
  formatTimestamp,
  formatStatusLabel,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";
import { getApprovalTone } from "./applications-detail-panel-helpers";

export function ApplicationsDetailPanelSubmitApprovalSection(props: {
  isApplyRunPending: (runId: string) => boolean;
  isSelectedRunPending: boolean;
  onApproveApplyRun: (runId: string) => void;
  onCancelApplyRun: (runId: string) => void;
  onRevokeApplyRunApproval: (runId: string) => void;
  selectedApplyRunDetails: ApplyRunDetails | null;
}) {
  const {
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
          <h3 className="label-mono-xs text-primary">Submit approval</h3>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            This run records explicit approval for later submit-enabled execution,
            but the current safe build still stops before any final submit click.
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
            Record submit approval
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
        selectedApplyRunDetails.run.state !== "cancelled" ? (
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
