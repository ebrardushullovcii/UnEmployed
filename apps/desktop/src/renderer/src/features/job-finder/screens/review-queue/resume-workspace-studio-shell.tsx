import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Download,
  Save,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";
import {
  isBlockingResumeValidationIssue,
  type ResumeValidationIssue,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { getJobFinderScrollBehavior } from "../../lib/job-finder-scroll-behavior";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@renderer/components/ui/tabs";
import {
  getResumeValidationIssueTargetId,
  ResumeValidationIssueList,
} from "./resume-validation-issue-list";
import {
  RESUME_STUDIO_ATTENTION_PANEL_SELECTOR,
  ResumeStudioAttentionPanel,
} from "./resume-studio-attention-panel";
import { useDesktopStudioLayout } from "./use-desktop-studio-layout";

/**
 * The studio's compact tab surface. The Assistant is deliberately not a tab:
 * it is the same floating panel at every width, so switching tabs, opening it
 * or minimizing it never changes the studio layout.
 */
export type ResumeStudioMobileTab = "preview" | "editor";

interface ResumeWorkspaceStudioShellProps {
  approvalBlockedReason: string | null;
  approvalStateLabel: string | null;
  /**
   * Page count of the exact approved application PDF, when one exists. It
   * resolves the "creating the PDF in the background" promise into a
   * finished, inspectable fact instead of leaving present-tense work copy on
   * screen after approval.
   */
  approvedExportPageCount?: number | null;
  canApproveResume: boolean;
  canClearApproval: boolean;
  claimConfirmationPanel?: ReactNode;
  editorPanel: ReactNode;
  exportBlockedReason: string | null;
  hasUnsavedChanges: boolean;
  historyPanel: ReactNode;
  /** Native PDF export is pending without invalidating a ready workspace. */
  isExportPending?: boolean;
  isWorkspacePending: boolean;
  mobileStudioTab: ResumeStudioMobileTab;
  onApproveCurrentPdf: () => void;
  canRestoreValidationIssuePreviousText?: (
    issue: ResumeValidationIssue,
  ) => boolean;
  onAskAiFix?: (issue: ResumeValidationIssue) => void;
  onRestoreValidationIssuePreviousText?: (issue: ResumeValidationIssue) => void;
  onClearApproval: () => void;
  onDismissSetAsideProposalNote?: () => void;
  /**
   * Set when approval had to resolve a still-pending Guided edits proposal.
   * Approval freezes one exact artifact, so an unresolved proposal cannot be
   * left hanging where accepting it would silently invalidate the approval.
   */
  setAsideProposalNote?: string;
  onContinueToShortlisted: () => void;
  onExportPdf: () => void;
  onPrepareApplication?: () => void;
  onReviewBlockingIssues: () => void;
  /** Reopens the Assistant on a proposal approval set aside, so a discarded
   * suggestion stays inspectable and recoverable. */
  onReviewSetAsideProposal?: () => void;
  onSaveDraft: () => void;
  onSelectValidationIssue?: (
    issue: ResumeValidationIssue,
    targetId: string | null,
  ) => void;
  onSetMobileStudioTab: (tab: ResumeStudioMobileTab) => void;
  previewPane: ReactNode;
  selectedTemplateApprovalEligible: boolean;
  supportingDetailsPanel?: ReactNode;
  studioStatusMessage: string;
  templatePanel: ReactNode;
  validationIssues?: readonly ResumeValidationIssue[];
}

// Only the displayed status row may be a live region, otherwise assistive tech
// announces every update twice.

function describeApprovedPageCount(pageCount: number | null): string {
  if (pageCount === null || !Number.isFinite(pageCount) || pageCount < 1) {
    return "";
  }

  return ` · ${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
}

function StudioStatusRow(props: {
  approvalStateLabel: string | null;
  clearApprovalSlot: ReactNode;
  live: boolean;
  message: string;
}) {
  return (
    <div
      {...(props.live ? { "aria-live": "polite", role: "status" } : {})}
      className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3 py-1.5 text-(length:--text-small) leading-5 text-foreground-soft"
      data-resume-studio-status
    >
      <span>{props.message}</span>
      <span className="flex flex-wrap items-center gap-2">
        {props.approvalStateLabel ? (
          <Badge variant="outline">{props.approvalStateLabel}</Badge>
        ) : null}
        {props.clearApprovalSlot}
      </span>
    </div>
  );
}

function StudioHistoryDisclosure(props: { children: ReactNode }) {
  return (
    <details className="group min-w-0 shrink-0" data-resume-history-disclosure>
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-(--radius-field) border border-(--control-border) bg-background/45 px-3 py-1.5 text-(length:--text-small) font-semibold text-(--text-headline) outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-ring">
        Version history
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="pt-2">{props.children}</div>
    </details>
  );
}

function StudioToolbar(props: {
  canDownloadPdf: boolean;
  isApproved: boolean;
  isExportPending: boolean;
  isWorkspacePending: boolean;
  onDownloadPdf: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* After approval a new save re-opens approval, which the button never
          said even though the banner above it does. */}
      <Button
        pending={props.isWorkspacePending}
        onClick={props.onSaveDraft}
        size="compact"
        title={
          props.isApproved
            ? "Saving a new draft clears the current approval; you will approve again."
            : "Save the current draft"
        }
        type="button"
        variant="secondary"
      >
        <Save className="size-4" />
        {props.isApproved ? "Save draft (re-opens approval)" : "Save draft"}
      </Button>
      {/* "Refresh draft" here and "Retry with AI" in the disclosure were the
          same whole-draft rewrite under two names, neither of which said it
          discards your edits. Both now live in the Assistant. */}
      <Button
        disabled={
          !props.canDownloadPdf ||
          props.isWorkspacePending ||
          props.isExportPending
        }
        onClick={props.onDownloadPdf}
        pending={props.isExportPending}
        size="compact"
        title="Save an optional PDF copy to your computer"
        type="button"
        variant="secondary"
      >
        <Download className="size-4" />
        Download PDF
      </Button>
    </div>
  );
}

const RESUME_EDITOR_EDITABLE_CONTROL_SELECTOR = [
  'input:not([type="hidden"])',
  "textarea",
  "select",
  'button[role="checkbox"]',
  'button[role="switch"]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="combobox"]',
].join(", ");

type ResumeValidationFocusKind =
  | "exact"
  | "section"
  | "entry-fallback"
  | "section-fallback"
  | "identity-fallback"
  | "work-history";

interface ResumeValidationFocusResolution {
  kind: ResumeValidationFocusKind;
  target: HTMLElement;
}

function isDisabledEditorElement(element: HTMLElement): boolean {
  return (
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function isReadOnlyEditorElement(element: HTMLElement): boolean {
  if (element.hasAttribute("readonly")) {
    return true;
  }

  if (!("readOnly" in element)) {
    return false;
  }

  return Boolean((element as HTMLInputElement | HTMLTextAreaElement).readOnly);
}

function hasHiddenEditorAncestor(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;

  while (current) {
    if (
      current.hidden ||
      current.getAttribute("aria-hidden") === "true" ||
      (current.tagName === "DETAILS" && !(current as HTMLDetailsElement).open)
    ) {
      return true;
    }

    const computedStyle = window.getComputedStyle(current);
    if (
      computedStyle.display === "none" ||
      computedStyle.visibility === "hidden"
    ) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function isEditableEditorControl(element: HTMLElement): boolean {
  if (
    isDisabledEditorElement(element) ||
    isReadOnlyEditorElement(element) ||
    hasHiddenEditorAncestor(element)
  ) {
    return false;
  }

  return element.matches(RESUME_EDITOR_EDITABLE_CONTROL_SELECTOR);
}

function findRenderedEditorElement(
  elements: readonly HTMLElement[],
): HTMLElement | null {
  const rendered = elements.filter(
    (element) => !hasHiddenEditorAncestor(element),
  );

  return (
    rendered.find((element) => element.getClientRects().length > 0) ??
    rendered[0] ??
    null
  );
}

function findEnabledEditorControl(
  elements: readonly HTMLElement[],
): HTMLElement | null {
  const controls: HTMLElement[] = [];

  for (const element of elements) {
    if (isEditableEditorControl(element)) {
      controls.push(element);
    }

    controls.push(
      ...Array.from(
        element.querySelectorAll<HTMLElement>(
          RESUME_EDITOR_EDITABLE_CONTROL_SELECTOR,
        ),
      ).filter(isEditableEditorControl),
    );
  }

  return findRenderedEditorElement(
    controls.filter((element, index) => controls.indexOf(element) === index),
  );
}

function findRenderedEditorContainers(
  containers: readonly HTMLElement[],
  requireEditableControl: boolean,
): HTMLElement | null {
  const uniqueContainers = containers.filter(
    (container, index) => containers.indexOf(container) === index,
  );
  const renderedContainers = uniqueContainers.filter(
    (container) => !hasHiddenEditorAncestor(container),
  );
  const editableContainer = requireEditableControl
    ? renderedContainers.find((container) =>
        findEnabledEditorControl([container]),
      )
    : null;

  return editableContainer ?? findRenderedEditorElement(renderedContainers);
}

function getValidationSectionCandidates(
  issue: ResumeValidationIssue,
): HTMLElement[] {
  if (!issue.sectionId) {
    return [];
  }

  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-resume-editor-section]"),
  ).filter(
    (candidate) => candidate.dataset.resumeEditorSection === issue.sectionId,
  );
}

function getValidationEntryCandidates(
  issue: ResumeValidationIssue,
  sectionCandidates: readonly HTMLElement[],
): HTMLElement[] {
  if (!issue.entryId) {
    return [];
  }

  const entryCandidates = sectionCandidates.flatMap((section) =>
    Array.from(
      section.querySelectorAll<HTMLElement>("[data-resume-editor-entry]"),
    ).filter(
      (candidate) => candidate.dataset.resumeEditorEntry === issue.entryId,
    ),
  );

  return entryCandidates;
}

function resolveValidationFocusTarget(input: {
  issue: ResumeValidationIssue;
  targetId: string | null;
}): ResumeValidationFocusResolution | null {
  const { issue, targetId } = input;
  const exactCandidates = targetId
    ? Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-resume-editor-target="${targetId}"]`,
        ),
      )
    : [];
  const sectionCandidates = getValidationSectionCandidates(issue);
  const entryCandidates = getValidationEntryCandidates(
    issue,
    sectionCandidates,
  );
  const identityCandidates = targetId?.startsWith("identity:")
    ? Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-resume-identity-details]",
        ),
      )
    : [];

  if (issue.category === "work_history_review") {
    const decisionsTarget = findRenderedEditorElement(
      Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-resume-work-history-decisions]",
        ),
      ),
    );

    if (decisionsTarget) {
      return { kind: "work-history", target: decisionsTarget };
    }
  }

  // An issue that only names a section has no stable field locator. Land on
  // the section card so the user gets the right context without claiming a
  // field was opened.
  if (issue.sectionId && !issue.entryId && !issue.bulletId) {
    const sectionTarget = findRenderedEditorElement(sectionCandidates);
    if (sectionTarget) {
      return { kind: "section", target: sectionTarget };
    }
  }

  const exactTarget = findEnabledEditorControl(exactCandidates);
  if (exactTarget) {
    return { kind: "exact", target: exactTarget };
  }

  const exactEntryCandidates = exactCandidates
    .map((candidate) =>
      candidate.closest<HTMLElement>("[data-resume-editor-entry]"),
    )
    .filter((candidate): candidate is HTMLElement => candidate !== null);
  const entryTarget = findRenderedEditorContainers(
    [...exactEntryCandidates, ...entryCandidates],
    true,
  );
  if (entryTarget) {
    return { kind: "entry-fallback", target: entryTarget };
  }

  const sectionTarget = findRenderedEditorContainers(sectionCandidates, true);
  if (sectionTarget) {
    return { kind: "section-fallback", target: sectionTarget };
  }

  // A locked or otherwise unavailable entry may not contain any enabled
  // fields. Keep the nearest rendered section as a truthful context fallback
  // before giving up to the validation row itself.
  const unavailableSectionTarget = findRenderedEditorElement(sectionCandidates);
  if (unavailableSectionTarget) {
    return { kind: "section-fallback", target: unavailableSectionTarget };
  }

  const identityTarget = findRenderedEditorContainers(identityCandidates, true);
  if (identityTarget) {
    return { kind: "identity-fallback", target: identityTarget };
  }

  return null;
}

function getValidationFocusAnnouncement(kind: ResumeValidationFocusKind) {
  switch (kind) {
    case "exact":
      return "Opened the matching editor field for this issue.";
    case "section":
      return "Opened the matching section in the editor.";
    case "entry-fallback":
      return "Opened the nearest editable entry in the editor; the exact field was not available.";
    case "section-fallback":
      return "Opened the matching section in the editor; the exact field was not available.";
    case "identity-fallback":
      return "Opened the resume identity editor; the exact field was not available.";
    case "work-history":
      return "Opened the work-history decisions panel in the editor.";
  }
}

function scrollAndFocusValidationTarget(
  target: HTMLElement,
  kind: ResumeValidationFocusKind,
) {
  target.scrollIntoView({
    behavior: getJobFinderScrollBehavior(),
    block: kind === "exact" ? "center" : "start",
  });

  const scrollRegion =
    target.closest<HTMLElement>("[data-resume-workspace-scroll-region]") ??
    target.closest<HTMLElement>("[data-resume-editor-scroll-region]");
  if (scrollRegion && scrollRegion.clientHeight > 0) {
    const regionRect = scrollRegion.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = targetRect.top - regionRect.top;
    const targetBottom = targetRect.bottom - regionRect.top;

    if (kind === "exact") {
      const targetCenter = (targetTop + targetBottom) / 2;
      const desiredCenter = scrollRegion.clientHeight / 2;
      scrollRegion.scrollTop += targetCenter - desiredCenter;
    } else {
      const inset = Math.min(24, scrollRegion.clientHeight / 4);
      if (targetTop < inset) {
        scrollRegion.scrollTop += targetTop - inset;
      } else if (targetBottom > scrollRegion.clientHeight - inset) {
        scrollRegion.scrollTop +=
          targetBottom - (scrollRegion.clientHeight - inset);
      }
    }
  }

  target.focus({ preventScroll: true });
}

export function ResumeWorkspaceStudioShell(
  props: ResumeWorkspaceStudioShellProps,
) {
  const mobileTemplatePanelRef = useRef<HTMLDivElement | null>(null);
  const desktopTemplatePanelRef = useRef<HTMLDivElement | null>(null);
  const [validationFocusRequest, setValidationFocusRequest] = useState<{
    issue: ResumeValidationIssue;
    targetId: string | null;
  } | null>(null);
  const [validationFocusAnnouncement, setValidationFocusAnnouncement] =
    useState<string | null>(null);
  const validationIssues = props.validationIssues ?? [];
  const isExportPending = props.isExportPending ?? false;
  const firstBlockingIssue = validationIssues.find(
    isBlockingResumeValidationIssue,
  );
  const approvalBlockedByValidation = Boolean(firstBlockingIssue);
  const canApproveResume =
    props.canApproveResume && !approvalBlockedByValidation;
  const canDownloadPdf =
    !props.hasUnsavedChanges &&
    !approvalBlockedByValidation &&
    !props.approvalBlockedReason &&
    !props.exportBlockedReason &&
    props.selectedTemplateApprovalEligible;

  function focusTemplateChooser() {
    props.onSetMobileStudioTab("editor");

    window.requestAnimationFrame(() => {
      const visibleTarget = [
        desktopTemplatePanelRef.current,
        mobileTemplatePanelRef.current,
      ].find((candidate) => candidate && candidate.getClientRects().length > 0);
      const target =
        visibleTarget ??
        mobileTemplatePanelRef.current ??
        desktopTemplatePanelRef.current;

      target?.scrollIntoView({
        behavior: getJobFinderScrollBehavior(),
        block: "start",
      });
      target?.focus({ preventScroll: true });
    });
  }

  const approvalBlockedByDecisions = Boolean(props.approvalBlockedReason);
  const isDesktopStudio = useDesktopStudioLayout();

  function focusWorkHistoryDecisions() {
    props.onSetMobileStudioTab("editor");

    window.requestAnimationFrame(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-resume-work-history-decisions]",
        ),
      );
      const target =
        candidates.find((candidate) => candidate.getClientRects().length > 0) ??
        candidates[0] ??
        null;

      target?.scrollIntoView({
        behavior: getJobFinderScrollBehavior(),
        block: "start",
      });
      target?.focus({ preventScroll: true });
    });
  }

  function focusValidationIssue(issue: ResumeValidationIssue) {
    const targetId = getResumeValidationIssueTargetId(issue);
    props.onSetMobileStudioTab("editor");
    props.onSelectValidationIssue?.(issue, targetId);
    setValidationFocusAnnouncement(null);
    setValidationFocusRequest({ issue, targetId });

    for (const details of document.querySelectorAll<HTMLDetailsElement>(
      "[data-resume-validation-notes]",
    )) {
      details.open = false;
    }

    if (targetId?.startsWith("identity:")) {
      for (const details of document.querySelectorAll<HTMLDetailsElement>(
        "[data-resume-identity-details]",
      )) {
        details.open = true;
      }
    }
  }

  useEffect(() => {
    const request = validationFocusRequest;
    if (!request) {
      return undefined;
    }

    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    const maxAttempts = 12;

    const focusTarget = () => {
      if (cancelled) {
        return;
      }

      const resolution = resolveValidationFocusTarget(request);
      if (resolution) {
        scrollAndFocusValidationTarget(resolution.target, resolution.kind);
        if (
          resolution.kind !== "exact" &&
          resolution.kind !== "section" &&
          request.targetId
        ) {
          props.onSelectValidationIssue?.(request.issue, null);
        }
        setValidationFocusAnnouncement(
          getValidationFocusAnnouncement(resolution.kind),
        );
        setValidationFocusRequest(null);
        return;
      }

      if (attempts >= maxAttempts) {
        const issueRow = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-resume-validation-issue]",
          ),
        ).find(
          (candidate) =>
            candidate.dataset.resumeValidationIssue === request.issue.id,
        );

        issueRow?.focus({ preventScroll: true });
        setValidationFocusAnnouncement(
          "No matching editor field is available for this issue. Review the validation note and live preview.",
        );
        setValidationFocusRequest(null);
        return;
      }

      attempts += 1;
      frame = window.requestAnimationFrame(focusTarget);
    };

    frame = window.requestAnimationFrame(focusTarget);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [validationFocusRequest, props.mobileStudioTab]);

  const studioStatusText = isExportPending
    ? "Exporting PDF…"
    : props.isWorkspacePending
      ? "Working on your resume…"
      : props.studioStatusMessage;
  const blockingIssueCount = validationIssues.filter(
    isBlockingResumeValidationIssue,
  ).length;
  const showsWorkHistoryWarning =
    approvalBlockedByDecisions && !props.canClearApproval;
  // Every notice the attention panel can actually show, so the chip that opens
  // it appears exactly when the panel has something to act on — a set-aside
  // proposal used to be silently unreachable from the header.
  const attentionItemCount =
    blockingIssueCount +
    (props.exportBlockedReason ? 1 : 0) +
    (showsWorkHistoryWarning ? 1 : 0) +
    (props.setAsideProposalNote ? 1 : 0);
  const showApprovedBackAction = !(
    !props.hasUnsavedChanges && Boolean(props.onPrepareApplication)
  );

  function openAttentionPanel() {
    // On compact widths the notices live in the Tools tab, so the chip has to
    // switch tabs before the panel exists to scroll to.
    props.onSetMobileStudioTab("editor");

    window.requestAnimationFrame(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          RESUME_STUDIO_ATTENTION_PANEL_SELECTOR,
        ),
      );
      const target =
        candidates.find((candidate) => candidate.getClientRects().length > 0) ??
        candidates[0] ??
        null;

      target?.scrollIntoView({
        behavior: getJobFinderScrollBehavior(),
        block: "start",
      });
      target?.focus({ preventScroll: true });
    });
  }

  const attentionPanel = (
    <ResumeStudioAttentionPanel
      approvalBlockedReason={
        showsWorkHistoryWarning ? props.approvalBlockedReason : null
      }
      attentionItemCount={attentionItemCount}
      {...(props.claimConfirmationPanel
        ? { claimConfirmationPanel: props.claimConfirmationPanel }
        : {})}
      exportBlockedReason={props.exportBlockedReason}
      focusAnnouncement={validationFocusAnnouncement}
      {...(props.onDismissSetAsideProposalNote
        ? {
            onDismissSetAsideProposalNote: props.onDismissSetAsideProposalNote,
          }
        : {})}
      onReviewBlockingIssues={props.onReviewBlockingIssues}
      {...(props.onReviewSetAsideProposal
        ? { onReviewSetAsideProposal: props.onReviewSetAsideProposal }
        : {})}
      onReviewWorkHistoryDecisions={focusWorkHistoryDecisions}
      pdfStatusMessage={
        props.canClearApproval
          ? `Application PDF ready${describeApprovedPageCount(
              props.approvedExportPageCount ?? null,
            )}. Job Finder created and verified it. Downloading a copy is optional. Final submission stays disabled.`
          : "Job Finder creates and verifies the application PDF in the background. Downloading a copy is optional. Final submission stays disabled."
      }
      {...(props.setAsideProposalNote
        ? { setAsideProposalNote: props.setAsideProposalNote }
        : {})}
      validationIssueList={
        validationIssues.length > 0 ? (
          <ResumeValidationIssueList
            issues={validationIssues}
            {...(props.canRestoreValidationIssuePreviousText
              ? {
                  canRestorePreviousText:
                    props.canRestoreValidationIssuePreviousText,
                }
              : {})}
            {...(props.onAskAiFix ? { onAskAiFix: props.onAskAiFix } : {})}
            onFixIssue={focusValidationIssue}
            {...(props.onRestoreValidationIssuePreviousText
              ? {
                  onRestorePreviousText:
                    props.onRestoreValidationIssuePreviousText,
                }
              : {})}
          />
        ) : null
      }
    />
  );

  const clearApprovalSlot = props.canClearApproval ? (
    <Button
      className="border border-(--control-border)"
      pending={props.isWorkspacePending}
      onClick={props.onClearApproval}
      size="compact"
      type="button"
      variant="ghost"
    >
      <ShieldOff className="size-4" />
      Clear approval
    </Button>
  ) : null;

  return (
    <div className="surface-panel-shell flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      {/* One compact sticky row. The pinned stack that used to sit here — the
          next-step banner, the blocked-claims warning, the work-history
          warning and the validation list — cost ~270px of an 860px window and
          could not be scrolled away, so the preview and the editor were
          permanently squeezed. The notices moved into the tools column, inside
          its own scroll region, and this row keeps only the state, the one
          primary action, and a chip that opens them. */}
      <section
        aria-labelledby="resume-next-step-title"
        className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-primary/40 bg-primary/10 px-5 py-1.5"
        data-resume-studio-compact-header
        data-resume-workspace-top-actions
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline">
            {props.canClearApproval
              ? "Approved"
              : approvalBlockedByValidation
                ? "Needs fixes"
                : approvalBlockedByDecisions
                  ? "Needs decisions"
                  : canApproveResume
                    ? props.hasUnsavedChanges
                      ? "Unsaved changes"
                      : "Ready to approve"
                    : "Choose template"}
          </Badge>
          <strong
            className="min-w-0 text-(length:--text-body) leading-5 text-(--text-headline)"
            id="resume-next-step-title"
          >
            {props.canClearApproval
              ? "Resume approved. Continue when you’re ready."
              : canApproveResume
                ? props.hasUnsavedChanges
                  ? "Approve when ready — your edits will be saved first."
                  : "Approve the resume shown in the preview."
                : approvalBlockedByValidation
                  ? "Fix the first validation error before approval."
                  : approvalBlockedByDecisions
                    ? "Decide whether each hidden work-history role stays omitted before approving."
                    : props.exportBlockedReason
                      ? "Resolve the blocked claims before approval."
                      : "Choose an apply-safe template before approval."}
          </strong>
          {/* Compact widths used to carry a second, contiguous approval band
              directly under this row — 53px of state plus 63px repeating the
              same fact and owning `Clear approval`. This row is the single
              owner there now, so the one thing the second band said that this
              one did not says it here. */}
          {!isDesktopStudio && props.canClearApproval ? (
            <span
              className="min-w-0 text-(length:--text-small) leading-5 text-foreground-soft"
              data-resume-studio-compact-approval-note
            >
              {props.hasUnsavedChanges
                ? studioStatusText
                : "Any new edit needs approval again."}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {attentionItemCount > 0 ? (
            <Button
              data-resume-studio-attention-chip
              onClick={openAttentionPanel}
              size="compact"
              type="button"
              variant="secondary"
            >
              <TriangleAlert className="size-4" />
              {attentionItemCount === 1
                ? "1 item needs attention"
                : `${attentionItemCount} items need attention`}
            </Button>
          ) : null}
          {props.canClearApproval &&
          !props.hasUnsavedChanges &&
          props.onPrepareApplication ? (
            <Button
              disabled={props.isWorkspacePending || isExportPending}
              onClick={props.onPrepareApplication}
              pending={props.isWorkspacePending || isExportPending}
              type="button"
              variant="primary"
            >
              Prepare application
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
          {/* One route back. `← Back to Shortlisted` already sits ~100px away
              in the workspace header, so a second `Continue to Shortlisted →`
              beside `Prepare application →` read as forward progress to a
              different place. It only appears when there is no Prepare action
              to offer, and then it points back. */}
          {props.canClearApproval ? (
            showApprovedBackAction ? (
              <Button
                disabled={props.isWorkspacePending || isExportPending}
                onClick={props.onContinueToShortlisted}
                type="button"
                variant="secondary"
              >
                <ArrowLeft className="size-4" />
                Back to Shortlisted
              </Button>
            ) : null
          ) : null}
          {/* Below xl this row owns approval outright, so it owns the way out
              of it too. On desktop the tools column's status row still owns
              `Clear approval`, and exactly one copy renders either way. */}
          {isDesktopStudio ? null : clearApprovalSlot}
          {props.canClearApproval ? null : (
            <Button
              disabled={
                props.isWorkspacePending ||
                isExportPending ||
                (canApproveResume && Boolean(props.exportBlockedReason))
              }
              onClick={
                canApproveResume
                  ? props.onApproveCurrentPdf
                  : firstBlockingIssue
                    ? () => focusValidationIssue(firstBlockingIssue)
                    : approvalBlockedByDecisions
                      ? focusWorkHistoryDecisions
                      : focusTemplateChooser
              }
              pending={props.isWorkspacePending || isExportPending}
              type="button"
              variant="primary"
            >
              {isExportPending
                ? "Exporting PDF…"
                : canApproveResume
                  ? "Approve resume"
                  : approvalBlockedByValidation
                    ? "Fix approval blocker"
                    : approvalBlockedByDecisions
                      ? "Review work-history decisions"
                      : "Choose an apply-safe template"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </section>

      {/* Compact chrome is one status line. The "Resume Studio / Review and
          refine your resume." block and the Save/Download toolbar used to sit
          here as a second permanent band, costing ~75px of a 640px window that
          the tab content needed; desktop already keeps them inside the tools
          column's own scroll region, so the Tools tab now does the same. */}
      {/* After approval this band was a second contiguous approval row under
          the sticky one — 116px of chrome for one fact. The sticky row above
          owns the approved state, its warning and `Clear approval` at compact
          widths, so this band only renders while there is a different status
          to report. */}
      {props.canClearApproval ? null : (
        <div className="grid shrink-0 gap-2.5 border-b border-(--surface-panel-border) px-4 py-2 xl:hidden">
          <StudioStatusRow
            approvalStateLabel={props.approvalStateLabel}
            clearApprovalSlot={null}
            live={!isDesktopStudio}
            message={studioStatusText}
          />
        </div>
      )}

      {/* Below xl the studio is a bounded tab surface, not a growing page. The
          Assistant is not one of these tabs: it is the same floating panel the
          desktop layout uses, so switching tabs never swaps it for a different
          layout and exactly one transcript is mounted at any width. */}
      <div className="min-h-0 min-w-0 flex-1 xl:hidden">
        <Tabs
          className="h-full min-h-0"
          onValueChange={(value) =>
            props.onSetMobileStudioTab(value as ResumeStudioMobileTab)
          }
          value={props.mobileStudioTab}
        >
          <TabsList
            className="grid w-full grid-cols-2 border-b border-(--surface-panel-border) bg-transparent"
            variant="line"
          >
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="editor">Tools</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-hidden p-4">
            <TabsContent
              className="min-h-0 h-full overflow-hidden"
              value="preview"
            >
              {props.previewPane}
            </TabsContent>
            {/* Compact widths sit below the locked-pane breakpoint, so this is
                an ordinary scroll region rather than a wheel-chain owner. */}
            <TabsContent
              className="min-h-0 h-full overflow-y-auto overflow-x-hidden"
              value="editor"
            >
              {/* The floating Assistant launcher rests in the bottom-right
                  corner at every width, so this column ends above its band
                  instead of letting the last control slide under the pill. The
                  reservation is constant: opening the panel hides the pill but
                  never moves anything here. */}
              <div className="grid min-h-0 gap-4 pb-14 xl:hidden">
                <div className="grid gap-2.5">
                  <div className="grid min-w-0 gap-1">
                    <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
                      Resume Studio
                    </p>
                    <h2 className="leading-tight text-(--text-headline)">
                      Review and refine your resume.
                    </h2>
                  </div>
                  <StudioToolbar
                    canDownloadPdf={canDownloadPdf}
                    isApproved={props.canClearApproval}
                    isExportPending={isExportPending}
                    isWorkspacePending={props.isWorkspacePending}
                    onDownloadPdf={props.onExportPdf}
                    onSaveDraft={props.onSaveDraft}
                  />
                </div>
                {isDesktopStudio ? null : attentionPanel}
                <div
                  aria-label="Apply-safe template choices"
                  className="min-h-(--size-resume-workspace-panel) scroll-mt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-resume-template-chooser
                  ref={mobileTemplatePanelRef}
                  tabIndex={-1}
                >
                  {props.templatePanel}
                </div>
                <div className="min-h-(--size-resume-workspace-panel)">
                  {props.editorPanel}
                </div>
                <StudioHistoryDisclosure>
                  {props.historyPanel}
                </StudioHistoryDisclosure>
                {props.supportingDetailsPanel}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Two columns, always. The Assistant used to become a real third grid
          track while open, so opening it re-flowed the preview and tools panes
          and moved every control the user was looking at. It is a floating
          panel now, resting over this grid: the column template, the tools
          pane's height reservation, and every class here are identical whether
          the Assistant is open, minimized, or closed. */}
      <div
        className="hidden min-h-[20rem] min-w-0 flex-1 p-2.5 xl:grid xl:h-full xl:min-h-0"
        data-resume-studio-desktop-grid
      >
        <div
          className="grid h-full min-h-[20rem] min-w-0 gap-2.5 xl:min-h-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(26rem,0.85fr)]"
          data-resume-studio-grid-columns="preview-tools"
        >
          <div
            className="h-full min-h-[18rem] min-w-0 overflow-hidden xl:min-h-0"
            data-resume-studio-preview-pane="true"
          >
            {props.previewPane}
          </div>
          <div
            aria-label="Resume studio tools"
            /* The floating Assistant launcher is fixed to the viewport's
               bottom-right corner and rests over this column. Bottom *padding*
               only cleared the pill at the end of the scroll: mid-scroll the
               transcript, the template card and the amber fallback disclosure
               all passed underneath it. The column itself ends above the pill's
               band (48px pill + 16px inset + 8px gap, minus the studio's own
               12px bottom gutter), so nothing can slide under the launcher at
               any scroll position. The reservation is constant — expanding the
               panel hides the pill but must not move this column. */
            className="flex h-full min-h-[18rem] min-w-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden pr-1 xl:h-[calc(100%-3.5rem)] xl:min-h-0"
            data-locked-pane-scroll-region
            data-resume-studio-tools-pane="true"
            data-resume-workspace-scroll-region
            role="region"
            tabIndex={0}
          >
            <div className="grid shrink-0 gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
                    Resume Studio
                  </p>
                  <h2 className="leading-tight text-(--text-headline)">
                    Review and refine your resume.
                  </h2>
                </div>
              </div>

              <StudioToolbar
                canDownloadPdf={canDownloadPdf}
                isApproved={props.canClearApproval}
                isExportPending={isExportPending}
                isWorkspacePending={props.isWorkspacePending}
                onDownloadPdf={props.onExportPdf}
                onSaveDraft={props.onSaveDraft}
              />

              <StudioStatusRow
                approvalStateLabel={props.approvalStateLabel}
                clearApprovalSlot={isDesktopStudio ? clearApprovalSlot : null}
                live={isDesktopStudio}
                message={studioStatusText}
              />
            </div>
            {isDesktopStudio ? attentionPanel : null}
            <div
              aria-label="Apply-safe template choices"
              className="min-h-0 min-w-0 shrink-0 scroll-mt-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-resume-template-chooser
              ref={desktopTemplatePanelRef}
              tabIndex={-1}
            >
              {props.templatePanel}
            </div>
            <div className="min-h-0 min-w-0 shrink-0">{props.editorPanel}</div>
            <StudioHistoryDisclosure>
              {props.historyPanel}
            </StudioHistoryDisclosure>
            {props.supportingDetailsPanel}
          </div>
        </div>
      </div>
    </div>
  );
}
