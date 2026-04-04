import {
  ArrowLeft,
  FileOutput,
  RefreshCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  JobFinderResumeWorkspace,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "../../components/empty-state";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { StatusBadge } from "../../components/status-badge";
import { ResumeSectionEditor } from "./resume-section-editor";
import { ResumeWorkspaceSecondaryRail } from "./resume-workspace-secondary-rail";
import {
  cloneDraft,
  formatOptionalDate,
  formatTimestamp,
  toDraftStatusTone,
} from "./resume-workspace-utils";

export function ResumeWorkspaceScreen(props: {
  actionMessage: string | null;
  busy: boolean;
  jobId: string;
  workspace: JobFinderResumeWorkspace | null;
  assistantMessages: readonly ResumeAssistantMessage[];
  assistantPending: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaveDraft: (draft: ResumeDraft) => void;
  onSaveDraftAndThen: (
    draft: ResumeDraft,
    next: () => void,
    successMessage?: string | null,
  ) => void;
  onExportPdf: (jobId: string) => void;
  onApproveResume: (jobId: string, exportId: string) => void;
  onClearResumeApproval: (jobId: string) => void;
  onRegenerateDraft: (jobId: string) => void;
  onRegenerateSection: (jobId: string, sectionId: string) => void;
  onApplyPatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void;
  onSendAssistantMessage: (jobId: string, content: string) => void;
}) {
  const [draft, setDraft] = useState<ResumeDraft | null>(
    props.workspace ? cloneDraft(props.workspace.draft) : null,
  );

  useEffect(() => {
    setDraft(props.workspace ? cloneDraft(props.workspace.draft) : null);
  }, [props.workspace]);

  const hasUnsavedChanges = useMemo(
    () =>
      draft !== null && props.workspace !== null
        ? JSON.stringify(draft) !== JSON.stringify(props.workspace.draft)
        : false,
    [draft, props.workspace],
  );

  useEffect(() => {
    props.onDirtyChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, props.onDirtyChange]);

  const approvedExport = useMemo(
    () => {
      if (!props.workspace?.draft.approvedExportId) {
        return null;
      }

      return (
        props.workspace.exports.find(
          (entry) => entry.id === props.workspace?.draft.approvedExportId,
        ) ?? null
      );
    },
    [props.workspace],
  );

  if (!props.workspace || !draft) {
    return (
      <main className="grid min-h-full place-items-center px-6 py-10">
        <EmptyState
          title="Resume workspace unavailable"
          description="The selected review item could not be loaded. Return to Review Queue and pick another job."
        />
      </main>
    );
  }

  const { job, research, validation } = props.workspace;
  const availableExportToApprove =
    props.workspace.exports.find((entry) => entry.draftId === draft.id) ?? null;

  function runWithSavedDraft(next: () => void, successMessage?: string | null) {
    if (hasUnsavedChanges) {
      const currentDraft = draft;
      if (!currentDraft) {
        return;
      }
      props.onSaveDraftAndThen(
        cloneDraft(currentDraft),
        next,
        successMessage ?? "Resume draft saved.",
      );
      return;
    }

    next();
  }

  function runWithSavedDraftAsync(
    next: () => Promise<void> | void,
    successMessage?: string | null,
  ) {
    runWithSavedDraft(() => {
      void next();
    }, successMessage);
  }

  function withDraftPatch(patch: ResumeDraftPatch): ResumeDraftPatch {
    return {
      ...patch,
      draftId: draft?.id ?? patch.draftId,
    };
  }

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="pb-(--gap-section) pt-8"
      topContent={(
        <section className="grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button onClick={props.onBack} type="button" variant="ghost">
                <ArrowLeft className="size-4" />
                Back to Review Queue
              </Button>
              <Button
                onClick={() =>
                  runWithSavedDraftAsync(
                    () => props.onRefresh(),
                    "Resume draft saved before refresh.",
                  )
                }
                type="button"
                variant="secondary"
              >
                <RefreshCcw className="size-4" />
                Refresh
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={toDraftStatusTone(draft.status)}>
                {draft.status.replaceAll("_", " ")}
              </StatusBadge>
              <Badge variant="section">{validation?.issues.length ?? 0} validation issues</Badge>
              <Badge variant="section">{research.length} research pages</Badge>
              {hasUnsavedChanges ? <StatusBadge tone="active">Unsaved edits</StatusBadge> : null}
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="grid min-w-0 gap-3">
              <div className="grid gap-2">
                <p className="text-(length:--text-tiny) uppercase tracking-[0.22em] text-muted-foreground">
                  Resume Workspace
                </p>
                <div className="grid min-w-0 gap-1">
                  <h1 className="max-w-[20ch] font-display text-[clamp(2.25rem,4vw,3.4rem)] font-semibold tracking-[-0.05em] text-(--headline-primary)">
                    {job.title}
                  </h1>
                  <p className="text-[1.05rem] leading-7 text-foreground-soft">
                    {job.company} • {job.location}
                  </p>
                </div>
              </div>
              <p className="max-w-[72ch] text-[0.98rem] leading-7 text-foreground-soft">
                Edit structured resume sections, export the PDF, and approve the final tailored artifact before Easy Apply.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Badge variant="section">Updated {formatTimestamp(draft.updatedAt)}</Badge>
              <Badge variant="section">Approved {formatTimestamp(draft.approvedAt)}</Badge>
            </div>
          </div>
        </section>
      )}
    >
      <section className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(17rem,19rem)_minmax(0,1fr)_minmax(18rem,22rem)] xl:overflow-hidden">
        <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-5 xl:h-full">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary">
              Draft Status
            </p>
            <StatusBadge tone={toDraftStatusTone(draft.status)}>
              {draft.status.replaceAll("_", " ")}
            </StatusBadge>
          </div>
          <div className="grid gap-2 text-sm text-foreground-soft">
            <p>Approved: {formatTimestamp(draft.approvedAt)}</p>
            <p>Updated: {formatTimestamp(draft.updatedAt)}</p>
            <p>Research pages: {research.length}</p>
            <p>Validation issues: {validation?.issues.length ?? 0}</p>
            {hasUnsavedChanges ? (
              <p className="text-warning">
                Unsaved edits are only local until you save or run another action.
              </p>
            ) : null}
          </div>

          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto pr-1">
            <div className="grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
              <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                Job Context
              </p>
              <div className="grid gap-2 text-sm text-foreground-soft">
                <p>
                  <strong className="text-foreground">Posted:</strong>{" "}
                  {formatOptionalDate(job.postedAt, job.postedAtText)}
                </p>
                <p>
                  <strong className="text-foreground">Work mode:</strong>{" "}
                  {job.workMode.join(", ") || "Not specified"}
                </p>
                {job.seniority ? (
                  <p>
                    <strong className="text-foreground">Seniority:</strong>{" "}
                    {job.seniority}
                  </p>
                ) : null}
                {job.employmentType ? (
                  <p>
                    <strong className="text-foreground">Employment:</strong>{" "}
                    {job.employmentType}
                  </p>
                ) : null}
                {job.department ? (
                  <p>
                    <strong className="text-foreground">Department:</strong>{" "}
                    {job.department}
                  </p>
                ) : null}
                {job.team ? (
                  <p>
                    <strong className="text-foreground">Team:</strong> {job.team}
                  </p>
                ) : null}
                {job.salaryText ? (
                  <p>
                    <strong className="text-foreground">Comp:</strong>{" "}
                    {job.salaryText}
                  </p>
                ) : null}
                {job.employerWebsiteUrl ? (
                  <p className="break-words">
                    <strong className="text-foreground">Employer site:</strong>{" "}
                    {job.employerWebsiteUrl}
                  </p>
                ) : null}
              </div>
              {job.responsibilities.length ? (
                <div className="grid gap-1 text-sm text-foreground-soft">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                    Responsibilities
                  </p>
                  {job.responsibilities.slice(0, 4).map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
              ) : null}
              {job.minimumQualifications.length ? (
                <div className="grid gap-1 text-sm text-foreground-soft">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                    Requirements
                  </p>
                  {job.minimumQualifications.slice(0, 4).map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
              ) : null}
              {job.preferredQualifications.length ? (
                <div className="grid gap-1 text-sm text-foreground-soft">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                    Preferred
                  </p>
                  {job.preferredQualifications.slice(0, 3).map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
              <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                Research Sources
              </p>
              {research.length ? (
                research.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="grid min-w-0 gap-1 text-sm text-foreground-soft"
                  >
                    <strong className="text-foreground">
                      {artifact.pageTitle ?? artifact.sourceUrl}
                    </strong>
                    <span className="break-all">{artifact.sourceUrl}</span>
                    <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                      {artifact.fetchStatus}
                    </span>
                    {artifact.domainVocabulary.length ? (
                      <div className="flex flex-wrap gap-2">
                        {artifact.domainVocabulary.slice(0, 4).map((term) => (
                          <Badge key={`${artifact.id}_${term}`} variant="section">
                            {term}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-foreground-soft">
                  No employer research captured yet.
                </p>
              )}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) xl:h-full">
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-(--surface-panel-border) p-4">
            <Button
              disabled={props.busy}
              onClick={() =>
                runWithSavedDraft(
                  () => props.onRegenerateDraft(props.jobId),
                  "Resume draft saved before regenerate.",
                )
              }
              type="button"
              variant="secondary"
            >
              <RefreshCcw className="size-4" />
              Regenerate Draft
            </Button>
            <Button
              disabled={props.busy}
              onClick={() => props.onSaveDraft(draft)}
              type="button"
              variant="primary"
            >
              Save Draft
            </Button>
            <Button
              disabled={props.busy}
              onClick={() =>
                runWithSavedDraft(
                  () => props.onExportPdf(props.jobId),
                  "Resume draft saved before export.",
                )
              }
              type="button"
              variant="secondary"
            >
              <FileOutput className="size-4" />
              Export PDF
            </Button>
            {approvedExport ? (
              <Button
                disabled={props.busy}
                onClick={() =>
                  runWithSavedDraftAsync(
                    () => props.onClearResumeApproval(props.jobId),
                    "Resume draft saved before clearing approval.",
                  )
                }
                type="button"
                variant="destructive"
              >
                Clear Approval
              </Button>
            ) : null}
            {!approvedExport && availableExportToApprove ? (
              <Button
                disabled={props.busy}
                onClick={() =>
                  runWithSavedDraft(
                    () =>
                      props.onApproveResume(
                        props.jobId,
                        availableExportToApprove.id,
                      ),
                    "Resume draft saved before approval.",
                  )
                }
                type="button"
                variant="primary"
              >
                Approve Resume
              </Button>
            ) : null}
          </div>

          <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto p-4 pr-3">
            {draft.sections.map((section) => (
              <ResumeSectionEditor
                key={section.id}
                disabled={props.busy}
                section={section}
                onChange={(nextSection) =>
                  setDraft((currentDraft) =>
                    currentDraft
                      ? {
                          ...currentDraft,
                          sections: currentDraft.sections.map((entry) =>
                            entry.id === nextSection.id ? nextSection : entry,
                          ),
                        }
                      : currentDraft,
                  )
                }
                onPatch={(patch, revisionReason) =>
                  runWithSavedDraft(
                    () =>
                      props.onApplyPatch(
                        withDraftPatch(patch),
                        revisionReason,
                      ),
                    "Resume draft saved before applying the change.",
                  )
                }
                onRegenerate={() =>
                  runWithSavedDraft(
                    () => props.onRegenerateSection(props.jobId, section.id),
                    "Resume draft saved before section regenerate.",
                  )
                }
              />
            ))}
          </div>

          <div className="border-t border-(--surface-panel-border) px-4 py-3">
            {props.actionMessage ? (
              <p className="font-mono text-[10px] uppercase tracking-(--tracking-normal) text-primary">
                {props.actionMessage}
              </p>
            ) : <div className="h-[14px]" />}
          </div>
        </section>

        <div className="min-h-0 min-w-0 xl:h-full">
          <ResumeWorkspaceSecondaryRail
            assistantMessages={props.assistantMessages}
            assistantPending={props.assistantPending}
            busy={props.busy}
            onSendAssistantMessage={(content) =>
              runWithSavedDraftAsync(
                () => props.onSendAssistantMessage(props.jobId, content),
                "Resume draft saved before assistant changes.",
              )
            }
          />
        </div>
      </section>
    </LockedScreenLayout>
  );
}
