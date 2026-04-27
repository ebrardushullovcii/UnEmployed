import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  JobFinderResumePreview,
  JobFinderResumeWorkspace,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeTemplateDefinition,
} from "@unemployed/contracts";
import {
  getResumeTemplateDeliveryLane,
  isResumeTemplateApprovalEligible,
} from '@unemployed/contracts'
import { FileOutput, RefreshCcw, Save, ShieldCheck, ShieldOff } from 'lucide-react'
import { EmptyState } from "../../components/empty-state";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { ResumeWorkspaceEditorPanel } from "./resume-workspace-editor-panel";
import type { ResumeThemePickerRecommendationContext } from '../../components/resume-theme-picker'
import { ResumeWorkspaceHeader } from "./resume-workspace-header";
import { ResumeWorkspaceSecondaryRail } from "./resume-workspace-secondary-rail";
import { ResumeWorkspaceSidebar } from "./resume-workspace-sidebar";
import { ResumeStudioPreviewPane } from './resume-studio-preview-pane'
import {
  cloneDraft,
} from "./resume-workspace-utils";

function getNewestExport(
  exports: JobFinderResumeWorkspace["exports"],
  draftId: string,
) {
  return exports
    .filter((entry) => entry.draftId === draftId)
    .sort(
      (left, right) =>
        new Date(right.exportedAt).getTime() - new Date(left.exportedAt).getTime(),
    )[0] ?? null;
}

function getPreviewErrorMessage(error: unknown): string {
  const fallbackMessage = 'The current draft could not be previewed.'

  if (error instanceof Error) {
    const remoteMethodMatch = /^Error invoking remote method '[^']+': (?:(?:[A-Za-z]*Error): )?(.*)$/s.exec(
      error.message,
    )

    return remoteMethodMatch?.[1]?.trim() || error.message
  }

  if (typeof error !== 'object' || error === null) {
    return fallbackMessage
  }

  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') {
    return fallbackMessage
  }

  const remoteMethodMatch = /^Error invoking remote method '[^']+': (?:(?:[A-Za-z]*Error): )?(.*)$/s.exec(
    message,
  )

  return remoteMethodMatch?.[1]?.trim() || message
}

export function ResumeWorkspaceScreen(props: {
  actionMessage: string | null;
  jobId: string;
  isWorkspacePending: boolean;
  workspace: JobFinderResumeWorkspace | null;
  availableResumeTemplates: readonly ResumeTemplateDefinition[];
  assistantMessages: readonly ResumeAssistantMessage[];
  assistantPending: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onPreviewDraft: (draft: ResumeDraft) => Promise<JobFinderResumePreview>;
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
  const [preview, setPreview] = useState<JobFinderResumePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [mobileStudioTab, setMobileStudioTab] = useState<'preview' | 'editor' | 'assistant'>('preview')
  const previewRequestRef = useRef(0)

  const workspaceDraftRevisionKey = props.workspace
    ? `${props.workspace.draft.id}:${props.workspace.draft.updatedAt}`
    : null;

  useEffect(() => {
    if (!props.workspace) {
      setDraft(null);
      setPreview(null)
      setPreviewError(null)
      setPreviewStatus('idle')
      return;
    }

    setDraft((currentDraft) => {
      const persistedDraft = props.workspace?.draft;

      if (!persistedDraft) {
        return null;
      }

      if (
        currentDraft &&
        currentDraft.id === persistedDraft.id &&
        currentDraft.updatedAt === persistedDraft.updatedAt
      ) {
        return currentDraft;
      }

      return cloneDraft(persistedDraft);
    });
  }, [workspaceDraftRevisionKey, props.workspace?.draft]);

  useEffect(() => {
    if (!draft) {
      return
    }

    setSelectedSectionId((current) => {
      if (current && draft.sections.some((section) => section.id === current)) {
        return current
      }

      return draft.sections[0]?.id ?? null
    })
  }, [draft])

  useEffect(() => {
    if (!draft) {
      return
    }

    if (!selectedSectionId) {
      setSelectedEntryId(null)
      return
    }

    const selectedSection = draft.sections.find((section) => section.id === selectedSectionId) ?? null

    if (!selectedSection) {
      setSelectedEntryId(null)
      return
    }

    setSelectedEntryId((current) => {
      if (current && selectedSection.entries.some((entry) => entry.id === current)) {
        return current
      }

      return null
    })
  }, [draft, selectedSectionId])

  const serializedDraft = useMemo(
    () => (draft ? JSON.stringify(draft) : null),
    [draft],
  );
  const serializedWorkspaceDraft = useMemo(
    () => (props.workspace ? JSON.stringify(props.workspace.draft) : null),
    [props.workspace],
  );

  const hasUnsavedChanges =
    serializedDraft !== null && serializedWorkspaceDraft !== null
      ? serializedDraft !== serializedWorkspaceDraft
      : false;
  const lastDirtyValueRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (lastDirtyValueRef.current === hasUnsavedChanges) {
      return;
    }

    lastDirtyValueRef.current = hasUnsavedChanges;
    props.onDirtyChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, props.onDirtyChange]);

  const availableExportToApprove = (() => {
    if (hasUnsavedChanges) {
      return null;
    }

    if (!props.workspace) {
      return null;
    }

    const newestExport = getNewestExport(props.workspace.exports, props.workspace.draft.id);

    if (!newestExport) {
      return null;
    }

    return new Date(newestExport.exportedAt).getTime() >=
      new Date(props.workspace.draft.updatedAt).getTime()
      ? newestExport
      : null;
  })();

  const runWithSavedDraft = useCallback((next: () => void, successMessage?: string | null) => {
    if (hasUnsavedChanges) {
      const currentDraft = draft;
      if (!currentDraft) {
        return;
      }
      props.onSaveDraftAndThen(
        cloneDraft(currentDraft),
        next,
        successMessage ?? "Changes saved.",
      );
      return;
    }

    next();
  }, [draft, hasUnsavedChanges, props.onSaveDraftAndThen]);

  const runWithSavedDraftAsync = useCallback((
    next: () => Promise<void> | void,
    successMessage?: string | null,
  ) => {
    runWithSavedDraft(() => {
      void next();
    }, successMessage);
  }, [runWithSavedDraft]);

  const withDraftPatch = useCallback((patch: ResumeDraftPatch): ResumeDraftPatch => {
    return {
      ...patch,
      draftId: draft?.id ?? patch.draftId,
    };
  }, [draft]);

  const refreshPreview = useCallback((targetDraft: ResumeDraft) => {
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setPreviewStatus('loading')
    setPreviewError(null)

    void props.onPreviewDraft(cloneDraft(targetDraft))
      .then((nextPreview) => {
        if (previewRequestRef.current !== requestId) {
          return
        }

        setPreview(nextPreview)
        setPreviewStatus('ready')
      })
      .catch((error) => {
        if (previewRequestRef.current !== requestId) {
          return
        }

        setPreviewStatus('error')
        setPreviewError(getPreviewErrorMessage(error))
      })
  }, [props])

  useEffect(() => {
    if (!draft) {
      return
    }

    const timeout = window.setTimeout(() => {
      refreshPreview(draft)
    }, hasUnsavedChanges ? 250 : 100)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [draft, hasUnsavedChanges, refreshPreview])

  const handlePreviewTargetSelect = useCallback((selection: {
    sectionId: string | null
    entryId: string | null
  }) => {
    if (selection.sectionId) {
      setSelectedSectionId(selection.sectionId)
    }

    setSelectedEntryId(selection.entryId)
    setMobileStudioTab('editor')
  }, [])

  const handleSelectSection = useCallback((sectionId: string) => {
    setSelectedSectionId(sectionId)
    setSelectedEntryId(null)
  }, [])

  const handleSelectEntry = useCallback((sectionId: string, entryId: string) => {
    setSelectedSectionId(sectionId)
    setSelectedEntryId(entryId)
  }, [])

  const recommendationContext = useMemo<ResumeThemePickerRecommendationContext | null>(() => {
    if (!props.workspace || !draft) {
      return null
    }

    const job = props.workspace.job
    const includedSections = draft.sections.filter((section) => section.included)
    const includedExperienceEntries = includedSections
      .filter((section) => section.kind === 'experience')
      .flatMap((section) => section.entries.filter((entry) => entry.included))
    const includedProjects = includedSections
      .filter((section) => section.kind === 'projects')
      .flatMap((section) => section.entries.filter((entry) => entry.included))
    const includedCertifications = includedSections
      .filter((section) => section.kind === 'certifications')
      .flatMap((section) => section.entries.filter((entry) => entry.included))
    const includedEducation = includedSections
      .filter((section) => section.kind === 'education')
      .flatMap((section) => section.entries.filter((entry) => entry.included))

    return {
      jobTitle: job.title,
      jobKeywords: [
        ...job.keySkills,
        ...job.keywordSignals.map((signal) => signal.label),
      ],
      hasProjects: includedProjects.length > 0,
      hasCertifications: includedCertifications.length > 0,
      hasFormalEducation: includedEducation.length > 0,
      experienceEntryCount: includedExperienceEntries.length,
      totalIncludedBulletCount: includedSections.reduce(
        (sum, section) =>
          sum +
          section.bullets.filter((bullet) => bullet.included).length +
          section.entries.reduce(
            (entrySum, entry) =>
              entry.included
                ? entrySum + entry.bullets.filter((bullet) => bullet.included).length
                : entrySum,
            0,
          ),
        0,
      ),
    }
  }, [draft, props.workspace])

  if (!props.workspace || !draft) {
      return (
        <main className="grid min-h-full place-items-center px-6 py-10">
          <EmptyState
            title="Resume editor unavailable"
            description="We couldn't load this resume. Go back to Shortlisted and try another job."
          />
        </main>
      );
  }

  const { job, research, validation } = props.workspace;

  const editorPanel = (
    <ResumeWorkspaceEditorPanel
      actionMessage={props.actionMessage}
      availableResumeTemplates={props.availableResumeTemplates}
      draft={draft}
      hasUnsavedChanges={hasUnsavedChanges}
      isWorkspacePending={props.isWorkspacePending}
      jobId={props.jobId}
      onApplyPatch={props.onApplyPatch}
      onRegenerateSection={props.onRegenerateSection}
      onSectionChange={(nextSection) =>
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
      onSelectEntry={handleSelectEntry}
      onSelectSection={handleSelectSection}
      onThemeChange={(templateId) =>
        setDraft((currentDraft) =>
          currentDraft
            ? {
                ...currentDraft,
                templateId,
              }
            : currentDraft,
        )
      }
      recommendationContext={recommendationContext}
      runWithSavedDraft={runWithSavedDraft}
      selectedEntryId={selectedEntryId}
      selectedSectionId={selectedSectionId}
      withDraftPatch={withDraftPatch}
    />
  )

  const assistantRail = (
    <ResumeWorkspaceSecondaryRail
      assistantMessages={props.assistantMessages}
      assistantPending={props.assistantPending}
      isWorkspacePending={props.isWorkspacePending}
      onSendAssistantMessage={(content) =>
        runWithSavedDraftAsync(
          () => props.onSendAssistantMessage(props.jobId, content),
          "Saved your draft before sending this request.",
        )
      }
    />
  )

  const selectedTheme = props.availableResumeTemplates.find(
    (template) => template.id === draft.templateId,
  ) ?? null
  const selectedTemplateApprovalEligible = selectedTheme
    ? isResumeTemplateApprovalEligible(selectedTheme)
    : false
  const selectedTemplateLane = selectedTheme
    ? getResumeTemplateDeliveryLane(selectedTheme)
    : 'apply_safe'
  const fallbackThemeLabel =
    props.availableResumeTemplates[0]?.label ||
    'Classic ATS'

  const previewPane = (
    <ResumeStudioPreviewPane
      isDirty={hasUnsavedChanges}
      isPending={props.isWorkspacePending}
      onRetry={() => refreshPreview(draft)}
      onSelectTarget={handlePreviewTargetSelect}
      preview={preview}
      previewError={previewError}
      previewStatus={previewStatus}
      selectedEntryId={selectedEntryId}
      selectedSectionId={selectedSectionId}
      templateLabel={selectedTheme?.label ?? fallbackThemeLabel}
    />
  )

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="pb-(--gap-section) pt-8"
      topContent={(
        <ResumeWorkspaceHeader
          draft={draft}
          hasUnsavedChanges={hasUnsavedChanges}
          jobCompany={job.company}
          jobLocation={job.location}
          jobTitle={job.title}
          onBack={props.onBack}
          onRefresh={() =>
            runWithSavedDraftAsync(
              () => props.onRefresh(),
              'Saved your changes before reloading the latest version.',
            )
          }
          selectedThemeLabel={selectedTheme?.label ?? fallbackThemeLabel}
          researchCount={research.length}
          validationIssueCount={validation?.issues.length ?? 0}
        />
      )}
    >
      <section className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(16rem,18rem)_minmax(0,1.4fr)_minmax(20rem,28rem)] xl:overflow-hidden">
        <ResumeWorkspaceSidebar
          draft={draft}
          hasUnsavedChanges={hasUnsavedChanges}
          workspace={props.workspace}
        />

        <div className="min-h-0 min-w-0 xl:h-full xl:overflow-hidden">
          <div className="surface-panel-shell flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--surface-panel-border) px-5 py-4">
              <div className="grid gap-1">
                <h2 className="font-display text-sm font-semibold text-(--text-headline)">
                  Resume Studio
                </h2>
                <p className="text-sm leading-6 text-foreground-soft">
                  Preview first, then edit or review the exact structured content behind it.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  pending={props.isWorkspacePending}
                  onClick={() => props.onSaveDraft(draft)}
                  type="button"
                  variant="primary"
                >
                  <Save className="size-4" />
                  Save draft
                </Button>
                <Button
                  pending={props.isWorkspacePending}
                  onClick={() =>
                    runWithSavedDraft(
                      () => props.onRegenerateDraft(props.jobId),
                      'Saved your draft before refreshing the resume.',
                    )
                  }
                  type="button"
                  variant="secondary"
                >
                  <RefreshCcw className="size-4" />
                  Refresh draft
                </Button>
                <Button
                  pending={props.isWorkspacePending}
                  onClick={() =>
                    runWithSavedDraft(
                      () => props.onExportPdf(props.jobId),
                      'Saved your draft before exporting the PDF.',
                    )
                  }
                  type="button"
                  variant="secondary"
                >
                  <FileOutput className="size-4" />
                  Export PDF
                </Button>
                {draft.approvedExportId ? (
                  <Button
                    pending={props.isWorkspacePending}
                    onClick={() =>
                      runWithSavedDraftAsync(
                        () => props.onClearResumeApproval(props.jobId),
                        'Saved your draft before clearing approval.',
                      )
                    }
                    type="button"
                    variant="destructive"
                  >
                    <ShieldOff className="size-4" />
                    Clear approval
                  </Button>
                ) : availableExportToApprove && selectedTemplateApprovalEligible ? (
                  <Button
                    pending={props.isWorkspacePending}
                    onClick={() =>
                      runWithSavedDraft(
                        () => props.onApproveResume(props.jobId, availableExportToApprove.id),
                        'Saved your draft before approving the PDF.',
                      )
                    }
                    type="button"
                    variant="primary"
                  >
                    <ShieldCheck className="size-4" />
                    Approve current PDF
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="border-b border-(--surface-panel-border) px-5 py-3 text-sm text-foreground-soft">
              {hasUnsavedChanges
                ? 'Unsaved edits are visible in the live preview, but export and approval still use the last saved draft until you save again.'
                : !selectedTemplateApprovalEligible
                  ? `This ${selectedTemplateLane === 'share_ready' ? 'share-ready' : 'non-approvable'} template can still be exported, but approval and apply-safe flows stay disabled until you switch back to an apply-safe template.`
                : draft.approvedExportId
                  ? 'This saved draft already has an approved export. Any new save or template change will clear that approval state.'
                  : availableExportToApprove
                    ? 'The newest saved export matches this draft and is ready to approve.'
                    : 'Save, then export a fresh PDF before approval.'}
            </div>

            <div className="min-h-0 flex-1 xl:hidden">
              <Tabs
                className="min-h-0 h-full"
                onValueChange={(value) => setMobileStudioTab(value as 'preview' | 'editor' | 'assistant')}
                value={mobileStudioTab}
              >
                <TabsList className="grid w-full grid-cols-3 border-b border-(--surface-panel-border) bg-transparent" variant="line">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="editor">Editor</TabsTrigger>
                  <TabsTrigger value="assistant">Assistant</TabsTrigger>
                </TabsList>
                <div className="min-h-0 flex-1 p-4">
                  <TabsContent className="min-h-0 h-full" value="preview">
                    {previewPane}
                  </TabsContent>
                  <TabsContent className="min-h-0 h-full" value="editor">
                    {editorPanel}
                  </TabsContent>
                  <TabsContent className="min-h-0 h-full" value="assistant">
                    {assistantRail}
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            <div className="hidden min-h-0 flex-1 gap-4 p-4 xl:grid xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,25rem)] xl:overflow-hidden">
              <div className="min-h-0 min-w-0 xl:h-full">
                {previewPane}
              </div>
              <div className="min-h-0 min-w-0 xl:h-full">
                {editorPanel}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden min-h-0 min-w-0 xl:block xl:h-full">
          {assistantRail}
        </div>
      </section>
    </LockedScreenLayout>
  );
}
