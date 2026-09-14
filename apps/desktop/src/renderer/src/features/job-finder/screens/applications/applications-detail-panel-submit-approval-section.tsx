import type {
  ApplyRunDetails,
  JobFinderApplyRunActionInput,
  JobFinderExactApplicationTarget,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui";

/**
 * True while this run is still waiting for the person to say go.
 *
 * The panel pins the control to its own footer in exactly this state, so one
 * predicate decides both that footer and whether the section below repeats the
 * button. Every other run state renders nothing here: a saved permission is
 * Settings' business, and an "approve/revoke" pair on an application the
 * person is trying to finish is a control with nothing behind it.
 */
export function isAwaitingPreparationApproval(
  details: ApplyRunDetails | null,
): boolean {
  return (
    details?.submitApproval?.status === "pending" &&
    details.run.state === "awaiting_submit_approval"
  );
}

/**
 * The exact words on the control, wherever it is drawn. It says what happens
 * next rather than naming an internal approval: nothing on the Applications
 * screen is labelled approve or revoke.
 */
export function preparationApprovalActionLabel(jobCount: number): string {
  return jobCount === 1
    ? "Start preparing this job"
    : `Start preparing ${jobCount} jobs`;
}

export function ApplicationsDetailPanelSubmitApprovalSection(props: {
  approvalScopeEntries: readonly { jobId: string; label: string }[];
  /**
   * False while the panel's pinned footer carries the control, so the screen
   * never shows the same button twice.
   */
  showApproveAction?: boolean;
  isApplyRunPending: (runId: string) => boolean;
  onApproveApplyRun: (input: JobFinderApplyRunActionInput) => void;
  selectedApplicationTarget: JobFinderExactApplicationTarget;
  selectedApplyRunDetails: ApplyRunDetails | null;
}) {
  const {
    isApplyRunPending,
    onApproveApplyRun,
    selectedApplicationTarget,
    selectedApplyRunDetails,
  } = props;
  const showApproveAction = props.showApproveAction ?? true;

  // Only the one state that genuinely needs a decision renders anything.
  if (
    !showApproveAction ||
    !isAwaitingPreparationApproval(selectedApplyRunDetails) ||
    !selectedApplyRunDetails?.submitApproval
  ) {
    return null;
  }

  const submitApproval = selectedApplyRunDetails.submitApproval;
  const jobCount = submitApproval.jobIds.length;

  return (
    <section
      className="surface-card-tint grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4"
      data-testid="applications-preparation-start-section"
    >
      <p className="text-(length:--text-small) leading-6 text-foreground-soft">
        {jobCount === 1
          ? "Job Finder is waiting for you before it fills this application in. It never sends an application, creates an account, or answers a security check."
          : `Job Finder is waiting for you before it fills in these ${jobCount} applications. It never sends an application, creates an account, or answers a security check.`}
      </p>
      <Button
        className="w-fit max-w-full"
        disabled={isApplyRunPending(submitApproval.runId)}
        onClick={() =>
          onApproveApplyRun({
            ...selectedApplicationTarget,
            runId: submitApproval.runId,
          })
        }
        pending={isApplyRunPending(submitApproval.runId)}
        type="button"
        variant="primary"
      >
        {preparationApprovalActionLabel(jobCount)}
      </Button>
    </section>
  );
}
