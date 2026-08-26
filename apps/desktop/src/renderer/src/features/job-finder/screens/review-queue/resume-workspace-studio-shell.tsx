import { useRef, type ReactNode } from "react";
import {
  ArrowRight,
  ChevronDown,
  FileOutput,
  RefreshCcw,
  Save,
  ShieldOff,
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
  countBlockingResumeValidationIssues,
  getResumeValidationIssueTargetId,
  ResumeValidationIssueList,
} from "./resume-validation-issue-list";

interface ResumeWorkspaceStudioShellProps {
  approvalBlockedReason: string | null;
  approvalStateLabel: string | null;
  assistantRail: ReactNode;
  canApproveCurrentPdf: boolean;
  canClearApproval: boolean;
  claimConfirmationPanel?: ReactNode;
  editorPanel: ReactNode;
  exportBlockedReason: string | null;
  hasUnsavedChanges: boolean;
  historyPanel: ReactNode;
  isWorkspacePending: boolean;
  mobileStudioTab: "preview" | "editor" | "assistant";
  onApproveCurrentPdf: () => void;
  onClearApproval: () => void;
  onContinueToShortlisted: () => void;
  onExportPdf: () => void;
  onRegenerateDraft: () => void;
  onReviewBlockingIssues: () => void;
  onSaveDraft: () => void;
  onSetMobileStudioTab: (tab: "preview" | "editor" | "assistant") => void;
  previewPane: ReactNode;
  selectedTemplateApprovalEligible: boolean;
  studioStatusMessage: string;
  templatePanel: ReactNode;
  validationIssues?: readonly ResumeValidationIssue[];
}

function StudioHistoryDisclosure(props: { children: ReactNode }) {
  return (
    <details className="group min-w-0 shrink-0" data-resume-history-disclosure>
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3 py-1.5 text-(length:--text-small) font-semibold text-(--text-headline) outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-ring">
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
  exportBlockedReason: string | null;
  isWorkspacePending: boolean;
  onExportPdf: () => void;
  onRegenerateDraft: () => void;
  onSaveDraft: () => void;
  selectedTemplateApprovalEligible: boolean;
}) {
  const exportDisabled =
    props.isWorkspacePending ||
    !props.selectedTemplateApprovalEligible ||
    Boolean(props.exportBlockedReason);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        pending={props.isWorkspacePending}
        onClick={props.onSaveDraft}
        size="compact"
        type="button"
        variant="secondary"
      >
        <Save className="size-4" />
        Save draft
      </Button>
      <Button
        pending={props.isWorkspacePending}
        onClick={props.onRegenerateDraft}
        size="compact"
        type="button"
        variant="secondary"
      >
        <RefreshCcw className="size-4" />
        Refresh draft
      </Button>
      <Button
        disabled={exportDisabled}
        pending={props.isWorkspacePending}
        onClick={props.onExportPdf}
        size="compact"
        title={
          props.selectedTemplateApprovalEligible
            ? "Export the current resume as a PDF"
            : "Choose an apply-safe template before exporting"
        }
        type="button"
        variant="secondary"
      >
        <FileOutput className="size-4" />
        Export PDF
      </Button>
    </div>
  );
}

export function ResumeWorkspaceStudioShell(
  props: ResumeWorkspaceStudioShellProps,
) {
  const mobileTemplatePanelRef = useRef<HTMLDivElement | null>(null);
  const desktopTemplatePanelRef = useRef<HTMLDivElement | null>(null);
  const validationIssues = props.validationIssues ?? [];
  const firstBlockingIssue = validationIssues.find(
    isBlockingResumeValidationIssue,
  );
  const approvalBlockedByValidation = Boolean(firstBlockingIssue);
  const canApproveCurrentPdf =
    props.canApproveCurrentPdf && !approvalBlockedByValidation;
  const templateSelectionRequired =
    !props.hasUnsavedChanges &&
    !props.canClearApproval &&
    !canApproveCurrentPdf &&
    !approvalBlockedByValidation &&
    !props.selectedTemplateApprovalEligible;
  const primaryActionIsExport =
    !props.hasUnsavedChanges &&
    !props.canClearApproval &&
    !canApproveCurrentPdf &&
    !approvalBlockedByValidation &&
    props.selectedTemplateApprovalEligible;

  const blockingIssueCount =
    countBlockingResumeValidationIssues(validationIssues);
  const exportIsPreviewOnly =
    primaryActionIsExport &&
    !props.exportBlockedReason &&
    blockingIssueCount > 0;

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
    props.onSetMobileStudioTab("editor");

    const targetId = getResumeValidationIssueTargetId(issue);
    const sectionSelector = issue.sectionId
      ? `[data-resume-editor-section="${issue.sectionId}"]`
      : null;

    if (targetId?.startsWith("identity:")) {
      for (const details of document.querySelectorAll<HTMLDetailsElement>(
        "[data-resume-identity-details]",
      )) {
        details.open = true;
      }
    }

    window.requestAnimationFrame(() => {
      const controlCandidates = targetId
        ? Array.from(
            document.querySelectorAll<HTMLElement>(
              `[data-resume-editor-target="${targetId}"]`,
            ),
          )
        : [];
      const sectionCandidates = sectionSelector
        ? Array.from(document.querySelectorAll<HTMLElement>(sectionSelector))
        : [];
      const issueRow = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-resume-validation-issue]",
        ),
      ).find(
        (candidate) => candidate.dataset.resumeValidationIssue === issue.id,
      );
      const target =
        controlCandidates.find(
          (candidate) => candidate.getClientRects().length > 0,
        ) ??
        controlCandidates[0] ??
        sectionCandidates.find(
          (candidate) => candidate.getClientRects().length > 0,
        ) ??
        sectionCandidates[0] ??
        issueRow ??
        null;

      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: getJobFinderScrollBehavior(),
        block: "start",
      });
      target.focus({ preventScroll: true });
    });
  }

  const clearApprovalSlot = props.canClearApproval ? (
    <Button
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
    <div className="surface-panel-shell flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      <section
        aria-labelledby="resume-next-step-title"
        className="grid shrink-0 gap-2.5 border-b border-primary/25 bg-primary/5 px-4 py-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        data-resume-workspace-top-actions
      >
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary"
              id="resume-next-step-title"
            >
              Your next step
            </p>
            <Badge variant="outline">
              {props.hasUnsavedChanges
                ? "1 · Review"
                : props.canClearApproval
                  ? "4 · Continue"
                  : canApproveCurrentPdf
                    ? "3 · Approve"
                    : approvalBlockedByValidation
                      ? "3 · Fix"
                      : approvalBlockedByDecisions
                        ? "3 · Decide"
                        : props.selectedTemplateApprovalEligible
                          ? "2 · Export"
                          : "1 · Template"}
            </Badge>
          </div>
          <strong className="text-(length:--text-body) text-(--text-headline)">
            {props.hasUnsavedChanges
              ? "Save your edits before creating the final PDF."
              : props.canClearApproval
                ? "This exact PDF is approved and ready for application preparation."
                : canApproveCurrentPdf
                  ? "Approve the exported PDF you just reviewed."
                  : approvalBlockedByValidation
                    ? "Fix the first validation error before approval."
                    : approvalBlockedByDecisions
                      ? "Decide whether each hidden work-history role stays omitted before approving."
                      : props.exportBlockedReason
                        ? "Resolve the blocked claims before exporting."
                        : exportIsPreviewOnly
                          ? "Preview export only; fix these before approval."
                          : props.selectedTemplateApprovalEligible
                            ? "Export a PDF, review it, then approve that exact file."
                            : "Choose an apply-safe template before exporting."}
          </strong>
          <p className="text-(length:--text-small) leading-5 text-foreground-soft">
            Review → export → approve → return to Shortlisted. Final application
            submission stays disabled.
          </p>
        </div>
        <Button
          className="w-full justify-center lg:w-auto"
          disabled={
            props.isWorkspacePending ||
            (primaryActionIsExport && Boolean(props.exportBlockedReason))
          }
          onClick={
            props.hasUnsavedChanges
              ? props.onSaveDraft
              : props.canClearApproval
                ? props.onContinueToShortlisted
                : canApproveCurrentPdf
                  ? props.onApproveCurrentPdf
                  : firstBlockingIssue
                    ? () => focusValidationIssue(firstBlockingIssue)
                    : approvalBlockedByDecisions
                      ? focusWorkHistoryDecisions
                      : templateSelectionRequired
                        ? focusTemplateChooser
                        : props.onExportPdf
          }
          pending={props.isWorkspacePending}
          type="button"
          variant="primary"
        >
          {props.hasUnsavedChanges
            ? "Save changes"
            : props.canClearApproval
              ? "Continue to Shortlisted"
              : canApproveCurrentPdf
                ? "Approve this PDF"
                : approvalBlockedByValidation
                  ? "Fix approval blocker"
                  : approvalBlockedByDecisions
                    ? "Review work-history decisions"
                    : exportIsPreviewOnly
                      ? "Preview export only"
                      : props.selectedTemplateApprovalEligible
                        ? "Export review PDF"
                        : "Choose an apply-safe template"}
          <ArrowRight className="size-4" />
        </Button>
      </section>

      {props.exportBlockedReason ? (
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-sm text-(--warning-text)"
          role="alert"
        >
          <span>{props.exportBlockedReason}</span>
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

      {approvalBlockedByDecisions && !props.canClearApproval ? (
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-sm text-(--warning-text)"
          role="alert"
        >
          <span>{props.approvalBlockedReason}</span>
          <Button
            onClick={focusWorkHistoryDecisions}
            size="compact"
            type="button"
            variant="secondary"
          >
            Review work-history decisions
          </Button>
        </div>
      ) : null}

      {validationIssues.length > 0 ? (
        <ResumeValidationIssueList
          issues={validationIssues}
          onFixIssue={focusValidationIssue}
        />
      ) : null}

      {props.claimConfirmationPanel}

      <div className="grid gap-2.5 border-b border-(--surface-panel-border) px-4 py-2.5 xl:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
              Resume Studio
            </p>
            <h2 className="text-[var(--text-section-title)] font-semibold leading-tight text-(--text-headline)">
              Tune the live draft before export.
            </h2>
          </div>
        </div>

        <StudioToolbar
          exportBlockedReason={props.exportBlockedReason}
          isWorkspacePending={props.isWorkspacePending}
          onExportPdf={props.onExportPdf}
          onRegenerateDraft={props.onRegenerateDraft}
          onSaveDraft={props.onSaveDraft}
          selectedTemplateApprovalEligible={
            props.selectedTemplateApprovalEligible
          }
        />

        <div
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3 py-1.5 text-(length:--text-small) leading-5 text-foreground-soft"
          role="status"
        >
          <span>
            {props.isWorkspacePending
              ? "Working on your resume…"
              : props.studioStatusMessage}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {props.approvalStateLabel ? (
              <Badge variant="outline">{props.approvalStateLabel}</Badge>
            ) : null}
            {clearApprovalSlot}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 xl:hidden">
        <Tabs
          className="min-h-0 h-full"
          onValueChange={(value) =>
            props.onSetMobileStudioTab(
              value as "preview" | "editor" | "assistant",
            )
          }
          value={props.mobileStudioTab}
        >
          <TabsList
            className="grid w-full grid-cols-3 border-b border-(--surface-panel-border) bg-transparent"
            variant="line"
          >
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="editor">Tools</TabsTrigger>
            <TabsTrigger value="assistant">Assistant</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 p-4">
            <TabsContent className="min-h-0 h-full" value="preview">
              {props.previewPane}
            </TabsContent>
            <TabsContent className="min-h-0 h-full" value="editor">
              <div className="grid min-h-0 h-full gap-4 xl:hidden">
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
              </div>
            </TabsContent>
            <TabsContent className="min-h-0 h-full" value="assistant">
              {props.assistantRail}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <div className="hidden min-h-0 flex-1 p-2.5 xl:grid xl:h-full">
        <div className="grid h-full min-h-0 min-w-0 gap-2.5 xl:grid-cols-[minmax(0,52rem)_minmax(30rem,1fr)]">
          <div className="h-full min-h-0 min-w-0 overflow-hidden">
            {props.previewPane}
          </div>
          <div
            aria-label="Resume studio tools"
            className="flex h-full min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden pr-1"
            data-locked-pane-scroll-region
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
                  <h2 className="text-[var(--text-section-title)] font-semibold leading-tight text-(--text-headline)">
                    Tune the live draft before export.
                  </h2>
                </div>
              </div>

              <StudioToolbar
                exportBlockedReason={props.exportBlockedReason}
                isWorkspacePending={props.isWorkspacePending}
                onExportPdf={props.onExportPdf}
                onRegenerateDraft={props.onRegenerateDraft}
                onSaveDraft={props.onSaveDraft}
                selectedTemplateApprovalEligible={
                  props.selectedTemplateApprovalEligible
                }
              />

              <div
                aria-live="polite"
                className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3 py-1.5 text-(length:--text-small) leading-5 text-foreground-soft"
                role="status"
              >
                <span>
                  {props.isWorkspacePending
                    ? "Working on your resume…"
                    : props.studioStatusMessage}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {props.approvalStateLabel ? (
                    <Badge variant="outline">{props.approvalStateLabel}</Badge>
                  ) : null}
                  {clearApprovalSlot}
                </span>
              </div>
            </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
