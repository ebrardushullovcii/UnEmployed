import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  JobFinderResumeWorkspace,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
} from "@unemployed/contracts";
import { EmptyState } from "../../components/empty-state";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { ResumeWorkspaceEditorPanel } from "./resume-workspace-editor-panel";
import { ResumeWorkspaceHeader } from "./resume-workspace-header";
import { ResumeWorkspaceSecondaryRail } from "./resume-workspace-secondary-rail";
import { ResumeWorkspaceSidebar } from "./resume-workspace-sidebar";
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

  const workspaceDraftRevisionKey = props.workspace
    ? `${props.workspace.draft.id}:${props.workspace.draft.updatedAt}`
    : null;

  useEffect(() => {
    if (!props.workspace) {
      setDraft(null);
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

  if (!props.workspace || !draft) {
      return (
        <main className="grid min-h-full place-items-center px-6 py-10">
          <EmptyState
            title="Resume editor unavailable"
            description="We couldn't load this resume. Go back to Review Queue and try another job."
          />
        </main>
      );
  }

  const { job, research, validation } = props.workspace;

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
          researchCount={research.length}
          validationIssueCount={validation?.issues.length ?? 0}
        />
      )}
    >
      <section className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(17rem,19rem)_minmax(0,1fr)_minmax(18rem,22rem)] xl:overflow-hidden">
        <ResumeWorkspaceSidebar
          draft={draft}
          hasUnsavedChanges={hasUnsavedChanges}
          workspace={props.workspace}
        />

        <ResumeWorkspaceEditorPanel
          actionMessage={props.actionMessage}
          approvedExportId={approvedExport?.id ?? null}
          availableExportIdToApprove={availableExportToApprove?.id ?? null}
          busy={props.busy}
          draft={draft}
          jobId={props.jobId}
          onApplyPatch={props.onApplyPatch}
          onApproveResume={props.onApproveResume}
          onClearResumeApproval={props.onClearResumeApproval}
          onExportPdf={props.onExportPdf}
          onRegenerateDraft={props.onRegenerateDraft}
          onRegenerateSection={props.onRegenerateSection}
          onSaveDraft={props.onSaveDraft}
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
          runWithSavedDraft={runWithSavedDraft}
          runWithSavedDraftAsync={runWithSavedDraftAsync}
          withDraftPatch={withDraftPatch}
        />

        <div className="min-h-0 min-w-0 xl:h-full">
          <ResumeWorkspaceSecondaryRail
            assistantMessages={props.assistantMessages}
            assistantPending={props.assistantPending}
            busy={props.busy}
            onSendAssistantMessage={(content) =>
              runWithSavedDraftAsync(
                () => props.onSendAssistantMessage(props.jobId, content),
                "Saved your changes before sending them to the assistant.",
              )
            }
          />
        </div>
      </section>
    </LockedScreenLayout>
  );
}
