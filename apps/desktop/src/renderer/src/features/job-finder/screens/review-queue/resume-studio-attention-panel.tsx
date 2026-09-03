import { useId, type ReactNode } from "react";
import { Button } from "@renderer/components/ui/button";

/**
 * Stable selector the compact header's attention chip focuses and scrolls to.
 * It is an attribute rather than an id because the studio renders one panel for
 * the desktop split view and one inside the compact Tools tab.
 */
export const RESUME_STUDIO_ATTENTION_PANEL_SELECTOR =
  "[data-resume-studio-attention-panel]";

export interface ResumeStudioAttentionPanelProps {
  approvalBlockedReason: string | null;
  /**
   * How many actionable notices the panel is carrying. It titles the panel
   * truthfully: with nothing outstanding the section still exists (it holds the
   * PDF status and any claim confirmations) but must not claim it needs
   * attention, and the header chip that opens it is not offered.
   */
  attentionItemCount: number;
  claimConfirmationPanel?: ReactNode;
  exportBlockedReason: string | null;
  focusAnnouncement: string | null;
  onDismissSetAsideProposalNote?: () => void;
  onReviewBlockingIssues: () => void;
  onReviewSetAsideProposal?: () => void;
  onReviewWorkHistoryDecisions: () => void;
  /** The blocking-validation list, rendered by the shell. */
  pdfStatusMessage: string;
  setAsideProposalNote?: string;
  validationIssueList?: ReactNode;
}

/**
 * Everything the studio used to pin above the panes: the blocked-claims
 * warning, the work-history warning, the validation blockers, the set-aside
 * notice and the focus announcement. Pinned, those four bars cost ~270px of an
 * 860px window and could never be scrolled away, permanently squeezing the
 * preview and the editor. They now live in the tools column, inside its scroll
 * region, with a compact "N items need attention" chip in the sticky header as
 * their entry point.
 */
export function ResumeStudioAttentionPanel(
  props: ResumeStudioAttentionPanelProps,
) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="grid min-w-0 shrink-0 gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-2.5"
      data-resume-studio-attention-panel
      tabIndex={-1}
    >
      {/* An eyebrow is a label, not a heading. As an `h2` it polluted the
          document outline and rendered a 19px level at 11px, above its own 16px
          `h3` children. It keeps the id so it still names this region. */}
      <p
        className="font-display text-(length:--text-eyebrow) font-semibold uppercase tracking-(--tracking-caps) text-primary"
        id={headingId}
      >
        {props.attentionItemCount > 0
          ? "Needs your attention"
          : "Resume checks"}
      </p>

      {props.setAsideProposalNote ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--info-border) bg-(--info-surface) px-3 py-2 text-(length:--text-small) leading-5 text-(--info-text)"
          data-resume-set-aside-proposal-note
          role="status"
        >
          <span className="max-w-prose">{props.setAsideProposalNote}</span>
          <span className="flex flex-wrap items-center gap-2">
            {/* The set-aside notice used to offer only "Got it", so a
                suggestion could vanish with no way to see or recover it. */}
            {props.onReviewSetAsideProposal ? (
              <Button
                data-resume-review-set-aside-proposal
                onClick={props.onReviewSetAsideProposal}
                size="compact"
                type="button"
                variant="secondary"
              >
                See the suggestion
              </Button>
            ) : null}
            {props.onDismissSetAsideProposalNote ? (
              <Button
                onClick={props.onDismissSetAsideProposalNote}
                size="compact"
                type="button"
                variant="ghost"
              >
                Got it
              </Button>
            ) : null}
          </span>
        </div>
      ) : null}

      {props.exportBlockedReason ? (
        <div
          className="flex flex-wrap items-start justify-between gap-2 rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-5 text-(--warning-text)"
          role="alert"
        >
          <span className="max-w-prose">{props.exportBlockedReason}</span>
          <Button
            onClick={props.onReviewBlockingIssues}
            size="compact"
            type="button"
            variant="secondary"
          >
            Review blocked claims
          </Button>
        </div>
      ) : null}

      {props.approvalBlockedReason ? (
        <div
          className="flex flex-wrap items-start justify-between gap-2 rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-5 text-(--warning-text)"
          role="alert"
        >
          <span className="max-w-prose">{props.approvalBlockedReason}</span>
          <Button
            onClick={props.onReviewWorkHistoryDecisions}
            size="compact"
            type="button"
            variant="secondary"
          >
            Review work-history decisions
          </Button>
        </div>
      ) : null}

      {props.validationIssueList}

      {props.focusAnnouncement ? (
        <p
          aria-live="polite"
          className="text-(length:--text-small) leading-5 text-foreground-soft"
          data-resume-validation-focus-status
          role="status"
        >
          {props.focusAnnouncement}
        </p>
      ) : null}

      {props.claimConfirmationPanel}

      <p
        className="text-(length:--text-tiny) leading-4 text-foreground-soft"
        data-resume-pdf-status
      >
        {props.pdfStatusMessage}
      </p>
    </section>
  );
}
