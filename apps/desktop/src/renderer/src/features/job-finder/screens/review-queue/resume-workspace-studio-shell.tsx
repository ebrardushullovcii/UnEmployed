import { useRef, type ReactNode } from "react";
import {
  ArrowRight,
  FileOutput,
  RefreshCcw,
  Save,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@renderer/components/ui/tabs";

interface ResumeWorkspaceStudioShellProps {
  approvalStateLabel: string | null;
  assistantRail: ReactNode;
  canApproveCurrentPdf: boolean;
  canClearApproval: boolean;
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
}

export function ResumeWorkspaceStudioShell(
  props: ResumeWorkspaceStudioShellProps,
) {
  const mobileTemplatePanelRef = useRef<HTMLDivElement | null>(null);
  const desktopTemplatePanelRef = useRef<HTMLDivElement | null>(null);
  const templateSelectionRequired =
    !props.hasUnsavedChanges &&
    !props.canClearApproval &&
    !props.canApproveCurrentPdf &&
    !props.selectedTemplateApprovalEligible;
  const exportDisabled =
    props.isWorkspacePending ||
    !props.selectedTemplateApprovalEligible ||
    Boolean(props.exportBlockedReason);
  const primaryActionIsExport =
    !props.hasUnsavedChanges &&
    !props.canClearApproval &&
    !props.canApproveCurrentPdf &&
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

      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="surface-panel-shell flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      <section
        aria-labelledby="resume-next-step-title"
        className="grid shrink-0 gap-3 border-b border-primary/25 bg-primary/5 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
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
                  : props.canApproveCurrentPdf
                    ? "3 · Approve"
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
                : props.canApproveCurrentPdf
                  ? "Approve the exported PDF you just reviewed."
                  : props.exportBlockedReason
                    ? "Resolve the blocked claims before exporting."
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
                : props.canApproveCurrentPdf
                  ? props.onApproveCurrentPdf
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
              : props.canApproveCurrentPdf
                ? "Approve this PDF"
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

      <div className="grid gap-3 border-b border-(--surface-panel-border) px-4 py-3 xl:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
              Resume Studio
            </p>
            <h2 className="text-[var(--text-section-title)] font-semibold leading-tight text-(--text-headline)">
              Tune the live draft before export.
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Badge variant="section">Preview-led review</Badge>
            <Badge variant={props.hasUnsavedChanges ? "default" : "section"}>
              {props.hasUnsavedChanges ? "Unsaved draft" : "Saved draft"}
            </Badge>
            <Badge
              variant={
                props.selectedTemplateApprovalEligible ? "section" : "outline"
              }
            >
              {props.selectedTemplateApprovalEligible
                ? "Approval eligible"
                : "Approval blocked"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            pending={props.isWorkspacePending}
            onClick={props.onSaveDraft}
            size="compact"
            type="button"
            variant="primary"
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
          {props.canClearApproval ? (
            <Button
              pending={props.isWorkspacePending}
              onClick={props.onClearApproval}
              size="compact"
              type="button"
              variant="destructive"
            >
              <ShieldOff className="size-4" />
              Clear approval
            </Button>
          ) : null}
          {!props.canClearApproval && props.canApproveCurrentPdf ? (
            <Button
              pending={props.isWorkspacePending}
              onClick={props.onApproveCurrentPdf}
              size="compact"
              type="button"
              variant="primary"
            >
              <ShieldCheck className="size-4" />
              Approve current PDF
            </Button>
          ) : null}
        </div>

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
          {props.approvalStateLabel ? (
            <Badge variant="outline">{props.approvalStateLabel}</Badge>
          ) : null}
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
                  className="min-h-(--size-resume-workspace-panel) scroll-mt-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  data-resume-template-chooser
                  ref={mobileTemplatePanelRef}
                  tabIndex={-1}
                >
                  {props.templatePanel}
                </div>
                <div className="min-h-(--size-resume-workspace-panel)">
                  {props.editorPanel}
                </div>
                <div>{props.historyPanel}</div>
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
            className="flex h-full min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden pr-1"
            data-resume-workspace-scroll-region
          >
            <div className="grid shrink-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1.5">
                  <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
                    Resume Studio
                  </p>
                  <h2 className="text-[var(--text-section-title)] font-semibold leading-tight text-(--text-headline)">
                    Tune the live draft before export.
                  </h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5 pt-0.5">
                  <Badge variant="section">Preview-led review</Badge>
                  <Badge
                    variant={props.hasUnsavedChanges ? "default" : "section"}
                  >
                    {props.hasUnsavedChanges ? "Unsaved draft" : "Saved draft"}
                  </Badge>
                  <Badge
                    variant={
                      props.selectedTemplateApprovalEligible
                        ? "section"
                        : "outline"
                    }
                  >
                    {props.selectedTemplateApprovalEligible
                      ? "Approval eligible"
                      : "Approval blocked"}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  pending={props.isWorkspacePending}
                  onClick={props.onSaveDraft}
                  size="compact"
                  type="button"
                  variant="primary"
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
                {props.canClearApproval ? (
                  <Button
                    pending={props.isWorkspacePending}
                    onClick={props.onClearApproval}
                    size="compact"
                    type="button"
                    variant="destructive"
                  >
                    <ShieldOff className="size-4" />
                    Clear approval
                  </Button>
                ) : null}
                {!props.canClearApproval && props.canApproveCurrentPdf ? (
                  <Button
                    pending={props.isWorkspacePending}
                    onClick={props.onApproveCurrentPdf}
                    size="compact"
                    type="button"
                    variant="primary"
                  >
                    <ShieldCheck className="size-4" />
                    Approve current PDF
                  </Button>
                ) : null}
              </div>

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
                {props.approvalStateLabel ? (
                  <Badge variant="outline">{props.approvalStateLabel}</Badge>
                ) : null}
              </div>
            </div>
            <div
              aria-label="Apply-safe template choices"
              className="min-h-0 min-w-0 shrink-0 scroll-mt-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              data-resume-template-chooser
              ref={desktopTemplatePanelRef}
              tabIndex={-1}
            >
              {props.templatePanel}
            </div>
            <div className="min-h-0 min-w-0 shrink-0">{props.editorPanel}</div>
            <div className="min-h-0 min-w-0 shrink-0">{props.historyPanel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
