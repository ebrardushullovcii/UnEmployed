// @vitest-environment jsdom

import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  JobFinderResumePreview,
  JobFinderResumeWorkspace,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeAssistantMessage,
  ResumeTemplateDefinition,
  WorkHistoryReviewAcknowledgment,
} from "@unemployed/contracts";
import {
  getResumeIdentityTargetId,
  ResumeDraftRevisionSchema,
} from "@unemployed/contracts";
import { JobFinderResumeWorkspaceSchema } from "@unemployed/contracts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createApplyQueueDemoState } from "../../../../../../main/adapters/job-finder-demo-state";
import {
  createJobFinderSaveCoordinator,
  JOB_FINDER_STALE_RETRY_GUIDANCE,
  type JobFinderSaveState,
} from "@renderer/pages/job-finder-save-state";
import { ResumeWorkspaceScreen } from "./resume-workspace-screen";
import type { ResumeWorkHistoryDecisionRequest } from "./resume-workspace-work-history-decisions";

const availableResumeTemplates: readonly ResumeTemplateDefinition[] = [
  {
    id: "classic_ats",
    label: "Chronology Classic",
    familyId: "chronology_classic",
    familyLabel: "Chronology Classic",
    familyDescription: "Calm ATS-safe layouts.",
    variantLabel: "Recruiter Standard",
    description:
      "Single-column, conservative, and recruiter-friendly for high parsing reliability.",
    fitSummary: "A clean all-rounder.",
    avoidSummary: "Less distinctive for project-led portfolios.",
    bestFor: ["General applications"],
    visualTags: ["Minimal", "Balanced"],
    density: "balanced",
    deliveryLane: "apply_safe",
    atsConfidence: "high",
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 10,
  },
  {
    id: "technical_matrix",
    label: "Engineering Spec",
    familyId: "engineering_spec",
    familyLabel: "Engineering Spec",
    familyDescription: "Spec-like ATS-safe layouts.",
    variantLabel: "Skills First",
    description:
      "Skills-forward single-column layout that highlights technical depth before chronology.",
    fitSummary: "Best when systems depth should land early.",
    avoidSummary: "Can feel too technical for generalist roles.",
    bestFor: ["Engineering roles"],
    visualTags: ["Skills matrix", "Technical"],
    density: "compact",
    deliveryLane: "apply_safe",
    atsConfidence: "high",
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 20,
  },
  {
    id: "project_showcase",
    label: "Proof Portfolio",
    familyId: "proof_portfolio",
    familyLabel: "Proof Portfolio",
    familyDescription: "Proof-led ATS-safe layouts.",
    variantLabel: "Projects First",
    description:
      "Project-forward single-column layout for candidates whose proof lands best through shipped work.",
    fitSummary: "Useful when shipped work is your strongest evidence.",
    avoidSummary: "Less ideal for conservative chronology-first screens.",
    bestFor: ["Portfolio-heavy candidates"],
    visualTags: ["Projects first", "Proof led"],
    density: "comfortable",
    deliveryLane: "apply_safe",
    atsConfidence: "high",
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 30,
  },
];

function buildWorkspace(): JobFinderResumeWorkspace {
  const state = createApplyQueueDemoState();
  const job = state.savedJobs.find((entry) => entry.id === "job_ready");
  const baseDraft = state.resumeDrafts.find(
    (entry) => entry.jobId === "job_ready",
  );
  const tailoredAsset =
    state.tailoredAssets.find((entry) => entry.jobId === "job_ready") ?? null;

  if (!job || !baseDraft) {
    throw new Error(
      "Expected demo state to contain the ready resume workspace fixture.",
    );
  }
  const draft: ResumeDraft = {
    ...baseDraft,
    sections: baseDraft.sections.map((section) =>
      section.kind === "experience"
        ? {
            ...section,
            entries: [
              {
                ...section.entries[0]!,
                id: "experience_demo_previous",
                title: "Previous Systems Designer",
                subtitle: "Northwind Labs",
                dateRange: "2019 – 2021",
                startDate: "2019",
                endDate: "2021",
                isCurrent: false,
                sortOrder: 1,
                profileRecordId: "experience_demo_previous",
              },
              ...section.entries,
              {
                id: "experience_demo_hidden",
                entryType: "experience",
                title: "Sales Operations Associate",
                subtitle: "Bright Market",
                location: "Remote",
                dateRange: "2019 – 2020",
                startDate: "2019",
                endDate: "2020",
                isCurrent: false,
                summary: "Coordinated customer operations reporting.",
                bullets: [],
                origin: "ai_generated",
                locked: false,
                included: false,
                sortOrder: section.entries.length + 1,
                profileRecordId: "experience_demo_hidden",
                sourceRefs: [],
                updatedAt: baseDraft.updatedAt,
              },
            ],
          }
        : section,
    ),
  };

  return JobFinderResumeWorkspaceSchema.parse({
    job,
    draft,
    validation: null,
    exports: state.resumeExportArtifacts.filter(
      (entry) => entry.jobId === "job_ready",
    ),
    research: [],
    assistantMessages: [],
    tailoredAsset,
    sharedProfile: {},
    workHistoryReviewSuggestions: [
      {
        id: "work_history_review_demo_hidden",
        profileRecordId: "experience_demo_hidden",
        sectionId: "section_experience",
        entryId: null,
        kind: "weak_fit",
        action: "consider_showing",
        severity: "info",
        message:
          "Hidden by default for review: this role has a weaker career-family fit for the target job.",
        messageContentHash: "fnv1a32:465fc3f2",
      },
    ],
  });
}

function buildWorkspaceWithRevision(): JobFinderResumeWorkspace {
  const workspace = buildWorkspace();

  return JobFinderResumeWorkspaceSchema.parse({
    ...workspace,
    revisions: [
      ResumeDraftRevisionSchema.parse({
        id: "revision_restore_1",
        draftId: workspace.draft.id,
        parentRevisionId: null,
        actor: "user",
        mutationKind: "manual_save",
        snapshotDraft: workspace.draft,
        snapshotIdentity: workspace.draft.identity,
        snapshotSections: workspace.draft.sections,
        beforeHash: "before_restore_1",
        afterHash: "after_restore_1",
        diff: {
          templateChanged: false,
          identityChanged: false,
          sectionOrderChanged: false,
          addedSectionIds: [],
          removedSectionIds: [],
          changedSectionIds: ["section_summary"],
        },
        restoredFromRevisionId: null,
        createdAt: "2026-04-27T00:00:00.000Z",
        reason: "Before template change",
      }),
    ],
  });
}
function buildPreview(
  revisionKey: string,
  htmlText: string,
): JobFinderResumePreview {
  return {
    draftId: "resume_draft_job_ready",
    revisionKey,
    html: `<!doctype html><html><body>${htmlText}</body></html>`,
    warnings: [],
    metadata: {
      templateId: "classic_ats",
      renderedAt: "2026-04-27T00:00:00.000Z",
      pageCount: null,
      sectionCount: 2,
      entryCount: 1,
    },
  };
}

function buildAssistantMessage(
  overrides?: Partial<ResumeAssistantMessage>,
): ResumeAssistantMessage {
  return {
    id: overrides?.id ?? "assistant_1",
    jobId: overrides?.jobId ?? "job_ready",
    role: overrides?.role ?? "assistant",
    content: overrides?.content ?? "Draft update ready.",
    patches: overrides?.patches ?? [],
    proposalStatus: overrides?.proposalStatus ?? "none",
    baseDraftUpdatedAt: overrides?.baseDraftUpdatedAt ?? null,
    resolvedPatchIds: overrides?.resolvedPatchIds ?? [],
    resolvedAt: overrides?.resolvedAt ?? null,
    proposalError: overrides?.proposalError ?? null,
    createdAt: overrides?.createdAt ?? "2026-04-27T00:00:00.000Z",
  };
}

function buildPendingProposalWorkspaceAndMessage(): {
  workspace: JobFinderResumeWorkspace;
  message: ResumeAssistantMessage;
} {
  const workspace = buildWorkspace();
  const section = workspace.draft.sections.find((entry) => entry.text);

  if (!section) {
    throw new Error("Expected a text section for proposal coverage.");
  }

  return {
    workspace,
    message: buildAssistantMessage({
      id: "proposal_1",
      proposalStatus: "pending",
      baseDraftUpdatedAt: workspace.draft.updatedAt,
      patches: [
        {
          id: "proposal_patch_1",
          draftId: workspace.draft.id,
          operation: "replace_section_text",
          targetSectionId: section.id,
          targetEntryId: null,
          anchorEntryId: null,
          targetBulletId: null,
          anchorBulletId: null,
          position: null,
          newText: "A clearer proposed summary.",
          newIncluded: null,
          newLocked: null,
          newBullets: null,
          appliedAt: "2026-04-27T00:01:00.000Z",
          origin: "assistant",
          conflictReason: null,
        },
      ],
    }),
  };
}

function renderScreen(options?: {
  assistantMessages?: ResumeAssistantMessage[];
  assistantPending?: boolean;
  onApplyPatch?: (
    patch: ResumeDraftPatch,
    revisionReason?: string | null,
  ) => void;
  onDraftEdited?: () => void;
  onPreviewDraft?: (draft: ResumeDraft) => Promise<JobFinderResumePreview>;
  onRegenerateDraft?: (jobId: string) => void;
  onResolveAssistantProposal?: (
    jobId: string,
    proposalId: string,
    action: "accept" | "reject",
    patchIds: readonly string[],
  ) => void;
  onRestoreRevision?: (jobId: string, revisionId: string) => void;
  onSaveDraftAndThen?: (
    draft: ResumeDraft,
    next: () => void | Promise<void>,
    successMessage?: string | null,
  ) => void;
  onSetWorkHistoryReviewAcknowledgment?: (
    jobId: string,
    decision: ResumeWorkHistoryDecisionRequest,
  ) => void;
  workspace?: JobFinderResumeWorkspace | null;
}) {
  const onPreviewDraft =
    options?.onPreviewDraft ??
    (() => Promise.resolve(buildPreview("preview_ready", "ready-preview")));

  return render(
    <ResumeWorkspaceScreen
      actionMessage={null}
      assistantMessages={options?.assistantMessages ?? []}
      assistantPending={options?.assistantPending ?? false}
      availableResumeTemplates={availableResumeTemplates}
      isWorkspacePending={false}
      jobId="job_ready"
      onApplyPatch={options?.onApplyPatch ?? vi.fn()}
      onApproveResume={vi.fn()}
      onBack={vi.fn()}
      onClearResumeApproval={vi.fn()}
      onDirtyChange={vi.fn()}
      {...(options?.onDraftEdited ? { onDraftEdited: options.onDraftEdited } : {})}
      onExportPdf={vi.fn()}
      onPreviewDraft={onPreviewDraft}
      onRefresh={vi.fn()}
      onRegenerateDraft={options?.onRegenerateDraft ?? vi.fn()}
      onResolveAssistantProposal={
        options?.onResolveAssistantProposal ?? vi.fn()
      }
      onRegenerateSection={vi.fn()}
      onRestoreRevision={options?.onRestoreRevision ?? vi.fn()}
      onSaveDraft={vi.fn()}
      onSaveDraftAndThen={options?.onSaveDraftAndThen ?? vi.fn()}
      onSendAssistantMessage={vi.fn()}
      onSetWorkHistoryReviewAcknowledgment={
        options?.onSetWorkHistoryReviewAcknowledgment ?? vi.fn()
      }
      workspace={
        options && "workspace" in options ? options.workspace : buildWorkspace()
      }
    />,
  );
}

describe("ResumeWorkspaceScreen", () => {
  const globalScope = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const originalActEnvironment = globalScope.IS_REACT_ACT_ENVIRONMENT;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );

  beforeAll(() => {
    globalScope.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    if (originalActEnvironment === undefined) {
      delete globalScope.IS_REACT_ACT_ENVIRONMENT;
      return;
    }

    globalScope.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  beforeEach(() => {
    vi.useFakeTimers();

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(async () => {
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();
    cleanup();
    if (originalScrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        originalScrollIntoViewDescriptor,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    if (originalResizeObserver) {
      vi.stubGlobal("ResizeObserver", originalResizeObserver);
    } else {
      vi.unstubAllGlobals();
    }
    vi.clearAllMocks();
  });

  it("shows an honest loading state while the resume workspace is fetched", () => {
    renderScreen({ workspace: null });

    expect(
      screen.getByRole("heading", { name: "Loading Resume Studio" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Loading the saved draft, validation, and version history.",
      ),
    ).toBeTruthy();
  });

  it("consolidates header status and date metadata while retaining lifecycle actions", async () => {
    renderScreen();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText(/Updated /).length).toBe(1);
    expect(screen.queryByText(/^Template: /)).toBeNull();
    expect(screen.queryByText("Preview-led review")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /save draft/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /refresh draft/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /export pdf/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /reload workspace/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /back to shortlisted/i }).length,
    ).toBeGreaterThan(0);
  });
  it("makes the resume-to-application handoff explicit", () => {
    renderScreen();

    expect(screen.getByText("Your next step")).toBeTruthy();
    expect(
      screen.getByText(
        "Review → export → approve → return to Shortlisted. Final application submission stays disabled.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Continue to Shortlisted|Approve this PDF|Export review PDF/,
      }),
    ).toBeTruthy();
  });

  it("shows preview fallback while keeping editing available when preview rendering fails", async () => {
    const onPreviewDraft = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'job-finder:preview-resume-draft': Error: Preview rendering failed in desktop test mode.",
        ),
      );

    renderScreen({ onPreviewDraft });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText("Preview unavailable").length).toBeGreaterThan(
      0,
    );

    expect(
      screen.getAllByText("Preview rendering failed in desktop test mode.")
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Section text").length).toBeGreaterThan(0);
  });

  it("debounces unsaved preview refreshes and ignores stale preview responses", async () => {
    const previewResolvers: Array<(preview: JobFinderResumePreview) => void> =
      [];
    const onPreviewDraft = vi.fn().mockImplementation(
      () =>
        new Promise<JobFinderResumePreview>((resolve) => {
          previewResolvers.push(resolve);
        }),
    );

    renderScreen({ onPreviewDraft });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(99);
    });
    expect(onPreviewDraft).toHaveBeenCalledTimes(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onPreviewDraft).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getAllByLabelText("Section text")[0]!, {
      target: { value: "Updated unsaved summary for preview coverage." },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(onPreviewDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onPreviewDraft).toHaveBeenCalledTimes(2);

    await act(async () => {
      previewResolvers[1]?.(buildPreview("preview_fresh", "fresh-preview"));
      await Promise.resolve();
    });

    const freshPreviewFrame = screen.getAllByTitle(
      "Live resume preview",
    )[0] as HTMLIFrameElement;
    expect(
      freshPreviewFrame.getAttribute("srcdoc") ?? freshPreviewFrame.srcdoc,
    ).toContain("fresh-preview");

    await act(async () => {
      previewResolvers[0]?.(buildPreview("preview_stale", "stale-preview"));
      await Promise.resolve();
    });

    const staleCheckFrame = screen.getAllByTitle(
      "Live resume preview",
    )[0] as HTMLIFrameElement;
    const renderedHtml =
      staleCheckFrame.getAttribute("srcdoc") ?? staleCheckFrame.srcdoc;

    expect(renderedHtml).toContain("fresh-preview");
    expect(renderedHtml).not.toContain("stale-preview");
    expect(
      screen.getAllByText("Unsaved edits rendered").length,
    ).toBeGreaterThan(0);
  });

  it("shows grounded template recommendations for the current draft", async () => {
    renderScreen();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText("Template").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Engineering Spec · Skills First").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", {
        name: /template: Engineering Spec · Skills First$/,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /^Open guided edits/ }).length,
    ).toBeGreaterThan(0);
  });

  it("keeps preview and editor visible after assistant replies on desktop", async () => {
    renderScreen({
      assistantMessages: [
        buildAssistantMessage({
          content: "Tightened the summary and refreshed one bullet.",
        }),
      ],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByTitle("Live resume preview").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Structured edits").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /guided edits/i }).length,
    ).toBeGreaterThan(0);
  });

  it("anchors the untouched guided edits bubble to the viewport bottom-left", async () => {
    renderScreen();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const popupRoot = document.querySelector<HTMLElement>(
      "[data-resume-guided-edits-open]",
    );

    expect(popupRoot?.parentElement).toBe(document.body);
    expect(popupRoot?.style.bottom).toBe("16px");
    expect(popupRoot?.style.left).toBe("16px");
    expect(popupRoot?.style.top).toBe("");
  });
  it("opens the guided edits popup from the always-available bubble", async () => {
    renderScreen();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    fireEvent.click(screen.getByRole("button", { name: /^Open guided edits/ }));

    const guidedEditToggle = screen
      .getAllByRole("button", { name: "Minimize guided edits" })
      .at(-1);

    expect(screen.getByRole("dialog", { name: "Guided edits" })).toBeTruthy();
    expect(guidedEditToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByText("No edit requests yet").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText(
        "Ask for a tighter summary, stronger bullets, or clearer job-specific wording.",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("keeps the assistant tab visible when a reply lands after mobile users switch to assistant", async () => {
    const onPreviewDraft = vi.fn(
      () => new Promise<JobFinderResumePreview>(() => {}),
    );

    const { rerender } = render(
      <ResumeWorkspaceScreen
        actionMessage={null}
        assistantMessages={[]}
        assistantPending={false}
        availableResumeTemplates={availableResumeTemplates}
        isWorkspacePending={false}
        jobId="job_ready"
        onApplyPatch={vi.fn()}
        onApproveResume={vi.fn()}
        onBack={vi.fn()}
        onClearResumeApproval={vi.fn()}
        onDirtyChange={vi.fn()}
        onExportPdf={vi.fn()}
        onPreviewDraft={onPreviewDraft}
        onRefresh={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onRegenerateSection={vi.fn()}
        onRestoreRevision={vi.fn()}
        onSaveDraft={vi.fn()}
        onSaveDraftAndThen={vi.fn()}
        onSendAssistantMessage={vi.fn()}
        onSetWorkHistoryReviewAcknowledgment={vi.fn()}
        workspace={buildWorkspace()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Assistant" }));
    fireEvent.click(screen.getByRole("tab", { name: "Assistant" }));
    expect(
      screen.getByRole("tab", { name: "Assistant" }).getAttribute("data-state"),
    ).toBe("active");

    act(() => {
      rerender(
        <ResumeWorkspaceScreen
          actionMessage={null}
          assistantMessages={[
            buildAssistantMessage({
              content: "Here is the update you asked for.",
            }),
          ]}
          assistantPending={false}
          availableResumeTemplates={availableResumeTemplates}
          isWorkspacePending={false}
          jobId="job_ready"
          onApplyPatch={vi.fn()}
          onApproveResume={vi.fn()}
          onBack={vi.fn()}
          onClearResumeApproval={vi.fn()}
          onDirtyChange={vi.fn()}
          onExportPdf={vi.fn()}
          onPreviewDraft={onPreviewDraft}
          onRefresh={vi.fn()}
          onRegenerateDraft={vi.fn()}
          onRegenerateSection={vi.fn()}
          onRestoreRevision={vi.fn()}
          onSaveDraft={vi.fn()}
          onSaveDraftAndThen={vi.fn()}
          onSendAssistantMessage={vi.fn()}
          onSetWorkHistoryReviewAcknowledgment={vi.fn()}
          workspace={buildWorkspace()}
        />,
      );
    });

    expect(
      screen.getByRole("tab", { name: "Assistant" }).getAttribute("data-state"),
    ).toBe("active");
    expect(
      screen.getAllByText("Here is the update you asked for.").length,
    ).toBeGreaterThan(0);
  });

  it("previews assistant patches and applies only the selected proposal changes", async () => {
    const workspace = buildWorkspace();
    const section = workspace.draft.sections.find((entry) => entry.text);
    if (!section) {
      throw new Error("Expected a text section for proposal preview coverage.");
    }
    workspace.validation = {
      id: "validation_demo",
      draftId: workspace.draft.id,
      issues: [],
      draftContentHash: null,
      claimAssessments: [
        {
          id: "claim_demo_section",
          field: "section_text",
          sectionId: section.id,
          entryId: null,
          bulletId: null,
          claimText: section.text!,
          claimOrigin: "ai_generated",
          contentHash: "fnv1a32:00000000",
          status: "exact",
          evidenceRefs: [],
          verifier: "deterministic_candidate_evidence_v1",
          assessedAt: "2026-04-27T00:00:00.000Z",
        },
      ],
      coverageComparison: null,
      pageCount: null,
      validatedAt: "2026-04-27T00:00:00.000Z",
    };
    const onResolveAssistantProposal = vi.fn();
    renderScreen({
      assistantMessages: [
        buildAssistantMessage({
          id: "proposal_1",
          proposalStatus: "pending",
          baseDraftUpdatedAt: workspace.draft.updatedAt,
          patches: [
            {
              id: "proposal_patch_1",
              draftId: workspace.draft.id,
              operation: "replace_section_text",
              targetSectionId: section.id,
              targetEntryId: null,
              anchorEntryId: null,
              targetBulletId: null,
              anchorBulletId: null,
              position: null,
              newText: "A clearer proposed summary.",
              newIncluded: null,
              newLocked: null,
              newBullets: null,
              appliedAt: "2026-04-27T00:01:00.000Z",
              origin: "assistant",
              conflictReason: null,
            },
          ],
        }),
      ],
      onResolveAssistantProposal,
      workspace,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Mount the secondary rail transcript by activating the assistant tab so
    // both assistant surfaces can be compared side by side.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Assistant" }));
    fireEvent.click(screen.getByRole("tab", { name: "Assistant" }));
    fireEvent.click(screen.getByRole("button", { name: /^Open guided edits/ }));

    expect(screen.getAllByText(section.text!).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("A clearer proposed summary.").length,
    ).toBeGreaterThan(0);

    // Both assistant surfaces (secondary rail and guided edits popup) receive
    // the saved validation and render the same grounding disclosure.
    const groundingSummaries = screen.getAllByText("Why this edit is grounded");
    expect(groundingSummaries.length).toBe(2);
    fireEvent.click(groundingSummaries[0]!);
    expect(
      screen.getAllByText("Current saved text: Exact evidence.").length,
    ).toBe(2);
    fireEvent.click(screen.getAllByText("Why this edit is grounded")[1]!);
    expect(
      screen.getAllByText("Current saved text: Exact evidence.").length,
    ).toBe(2);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Accept selected (1)" }).at(-1)!,
    );
    expect(onResolveAssistantProposal).toHaveBeenCalledWith(
      "job_ready",
      "proposal_1",
      "accept",
      ["proposal_patch_1"],
    );
  });

  it("keeps preview-selected identity fields focused instead of jumping to summary", async () => {
    renderScreen();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const linkedinInput = screen.getAllByLabelText(
      "LinkedIn URL",
    )[0] as HTMLInputElement;
    linkedinInput.focus();

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(linkedinInput);
    expect(linkedinInput.dataset.resumeEditorTarget).toBe(
      getResumeIdentityTargetId("linkedinUrl"),
    );
    expect(screen.getAllByLabelText("Section text")[0]).not.toBe(
      document.activeElement,
    );
  });

  it("saves unsaved edits before regenerating the full draft", async () => {
    const onPreviewDraft = vi.fn((previewDraft: ResumeDraft) =>
      Promise.resolve(buildPreview(previewDraft.updatedAt, "ready-preview")),
    );
    const onRegenerateDraft = vi.fn();
    const onSaveDraftAndThen = vi.fn();

    renderScreen({
      onPreviewDraft,
      onRegenerateDraft,
      onSaveDraftAndThen,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const summaryInput = screen.getAllByLabelText(
      "Section text",
    )[0] as HTMLTextAreaElement;
    fireEvent.change(summaryInput, {
      target: {
        value:
          "Unsaved stale summary that should not be persisted before rebuild.",
      },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: /refresh draft/i })[0]!,
    );

    expect(onSaveDraftAndThen).toHaveBeenCalledTimes(1);
    expect(onRegenerateDraft).not.toHaveBeenCalled();
    const followUp = onSaveDraftAndThen.mock.calls[0]?.[1] as
      | (() => void | Promise<void>)
      | undefined;
    expect(followUp).toBeTypeOf("function");
    await followUp?.();
    expect(onRegenerateDraft).toHaveBeenCalledWith("job_ready");
  });

  it("saves unsaved edits before restoring an earlier draft", async () => {
    const onRestoreRevision = vi.fn();
    const onSaveDraftAndThen = vi.fn();

    renderScreen({
      onRestoreRevision,
      onSaveDraftAndThen,
      workspace: buildWorkspaceWithRevision(),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const summaryInput = screen.getAllByLabelText(
      "Section text",
    )[0] as HTMLTextAreaElement;
    fireEvent.change(summaryInput, {
      target: { value: "Unsaved summary that must be saved before restore." },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Restore version saved/i }),
    );

    expect(onSaveDraftAndThen).toHaveBeenCalledTimes(1);
    expect(onRestoreRevision).not.toHaveBeenCalled();

    const followUp = onSaveDraftAndThen.mock.calls[0]?.[1] as
      | (() => void | Promise<void>)
      | undefined;
    expect(followUp).toBeTypeOf("function");
    await followUp?.();

    expect(onRestoreRevision).toHaveBeenCalledWith(
      "job_ready",
      "revision_restore_1",
    );
    expect(onSaveDraftAndThen.mock.calls[0]?.[2]).toBe(
      "Saved your current edits before restoring the earlier draft.",
    );
  });
  it("shows work-history review guidance in the editor", async () => {
    renderScreen({
      onPreviewDraft: () =>
        Promise.resolve(
          buildPreview(
            "preview_guidance",
            "<main><p>Sales Operations Associate</p></main>",
          ),
        ),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText("Work-history review").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText(
        "Hidden by default for review: this role has a weaker career-family fit for the target job.",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("exposes manual entry ordering controls and sends typed reorder patches", async () => {
    const appliedPatches: Array<{
      patch: ResumeDraftPatch;
      revisionReason?: string | null;
    }> = [];
    const onApplyPatch = vi.fn(
      (patch: ResumeDraftPatch, revisionReason?: string | null) => {
        appliedPatches.push({
          patch,
          ...(revisionReason === undefined ? {} : { revisionReason }),
        });
      },
    );

    renderScreen({ onApplyPatch });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText("Chronology").length).toBeGreaterThan(0);

    const moveUpButtons = screen.getAllByRole("button", {
      name: /^Move .+ up$/,
    });
    const moveDownButtons = screen.getAllByRole("button", {
      name: /^Move .+ down$/,
    });

    expect(moveUpButtons.length).toBeGreaterThanOrEqual(2);
    expect(moveUpButtons[0]).toHaveProperty("disabled", true);
    expect(moveDownButtons.at(-1)).toHaveProperty("disabled", true);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Move Senior systems designer up",
        }),
      );
      await Promise.resolve();
    });

    expect(onApplyPatch).toHaveBeenCalledTimes(1);
    expect(appliedPatches[0]?.patch).toMatchObject({
      anchorEntryId: "experience_demo_previous",
      operation: "move_entry",
      position: "before",
      targetEntryId: "entry_signal_systems",
      targetSectionId: "section_experience",
    });
    expect(appliedPatches[0]?.revisionReason).toBe("Moved entry up");
  });

  it("marks manual order and exposes reset-to-chronology for manually ordered sections", async () => {
    const workspace = buildWorkspace();
    const experienceSection = workspace.draft.sections.find(
      (section) => section.kind === "experience",
    );

    if (!experienceSection) {
      throw new Error(
        "Expected demo workspace to contain an experience section.",
      );
    }

    const manualWorkspace = JobFinderResumeWorkspaceSchema.parse({
      ...workspace,
      draft: {
        ...workspace.draft,
        sections: workspace.draft.sections.map((section) =>
          section.kind === "experience"
            ? {
                ...section,
                entryOrderMode: "manual",
                entries: [
                  {
                    ...experienceSection.entries[1]!,
                    dateRange: "2021 – 2022",
                    startDate: "2021",
                    endDate: "2022",
                    isCurrent: false,
                    sortOrder: 0,
                  },
                  {
                    ...experienceSection.entries[0]!,
                    dateRange: "2024 – Present",
                    startDate: "2024",
                    endDate: null,
                    isCurrent: true,
                    sortOrder: 1,
                  },
                ],
              }
            : section,
        ),
      },
    });
    const appliedPatches: Array<{
      patch: ResumeDraftPatch;
      revisionReason?: string | null;
    }> = [];
    const onApplyPatch = vi.fn(
      (patch: ResumeDraftPatch, revisionReason?: string | null) => {
        appliedPatches.push({
          patch,
          ...(revisionReason === undefined ? {} : { revisionReason }),
        });
      },
    );

    render(
      <ResumeWorkspaceScreen
        actionMessage={null}
        assistantMessages={[]}
        assistantPending={false}
        availableResumeTemplates={availableResumeTemplates}
        isWorkspacePending={false}
        jobId="job_ready"
        onApplyPatch={onApplyPatch}
        onApproveResume={vi.fn()}
        onBack={vi.fn()}
        onClearResumeApproval={vi.fn()}
        onDirtyChange={vi.fn()}
        onExportPdf={vi.fn()}
        onPreviewDraft={() =>
          Promise.resolve(buildPreview("preview_ready", "ready-preview"))
        }
        onRefresh={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onRegenerateSection={vi.fn()}
        onRestoreRevision={vi.fn()}
        onSaveDraft={vi.fn()}
        onSaveDraftAndThen={vi.fn()}
        onSendAssistantMessage={vi.fn()}
        onSetWorkHistoryReviewAcknowledgment={vi.fn()}
        workspace={manualWorkspace}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText("Manual order").length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Reset to chronology/i }),
      );
      await Promise.resolve();
    });

    expect(onApplyPatch).toHaveBeenCalledTimes(1);
    expect(appliedPatches[0]?.patch).toMatchObject({
      operation: "reset_entry_order",
      targetEntryId: null,
      targetSectionId: "section_experience",
    });
    expect(appliedPatches[0]?.revisionReason).toBe(
      "Reset entry order to chronology",
    );
    expect(screen.getAllByText("Chronology").length).toBeGreaterThan(0);

    const entryTitleInputs: HTMLElement[] = screen.getAllByLabelText("Title");
    const currentRoleIndex = entryTitleInputs.findIndex(
      (input) =>
        input instanceof HTMLInputElement &&
        input.value === experienceSection.entries[0]!.title,
    );
    const olderRoleIndex = entryTitleInputs.findIndex(
      (input) =>
        input instanceof HTMLInputElement &&
        input.value === experienceSection.entries[1]!.title,
    );

    expect(currentRoleIndex).toBeGreaterThanOrEqual(0);
    expect(olderRoleIndex).toBeGreaterThanOrEqual(0);
    expect(currentRoleIndex).toBeLessThan(olderRoleIndex);
  });

  const hiddenRoleMessage =
    "Hidden by default for review: this role has a weaker career-family fit for the target job.";

  it("lists omitted-entry decisions near the top of the structured editor with exact guidance", async () => {
    renderScreen();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const scrollRegion = document.querySelector(
      "[data-resume-editor-scroll-region]",
    );
    expect(scrollRegion?.textContent).toContain("Work-history decisions");
    expect(scrollRegion?.textContent).toContain(hiddenRoleMessage);
    expect(screen.getAllByText("Needs decision").length).toBeGreaterThan(0);

    const decisionsSection = document.querySelector(
      "[data-resume-work-history-decisions]",
    );
    const identityHeading = Array.from(
      scrollRegion?.querySelectorAll("h3") ?? [],
    ).find((heading) => heading.textContent === "Resume identity");

    if (!decisionsSection || !identityHeading) {
      throw new Error("Expected structured editor sections to render.");
    }

    expect(
      decisionsSection.compareDocumentPosition(identityHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    const keepButtons = screen.getAllByRole("button", {
      name: `Keep omitted · Weak fit: ${hiddenRoleMessage}`,
    });
    expect(keepButtons.length).toBeGreaterThan(0);
    for (const button of keepButtons) {
      expect(button.getAttribute("aria-pressed")).toBe("false");
      expect(button.hasAttribute("disabled")).toBe(false);
    }
  });

  it("sends the exact typed acknowledgment command with server suggestion fields", async () => {
    const onSetWorkHistoryReviewAcknowledgment = vi.fn();
    renderScreen({ onSetWorkHistoryReviewAcknowledgment });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    fireEvent.click(
      screen.getAllByRole("button", {
        name: `Keep omitted · Weak fit: ${hiddenRoleMessage}`,
      })[0]!,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSetWorkHistoryReviewAcknowledgment).toHaveBeenCalledOnce();
    expect(onSetWorkHistoryReviewAcknowledgment).toHaveBeenCalledWith(
      "job_ready",
      {
        intent: "acknowledge",
        suggestion: {
          id: "work_history_review_demo_hidden",
          profileRecordId: "experience_demo_hidden",
          kind: "weak_fit",
          action: "consider_showing",
          messageContentHash: "fnv1a32:465fc3f2",
        },
      },
    );
  });

  it("shows acknowledged omissions as kept and sends the removal command by acknowledgment id", async () => {
    const workspace = buildWorkspace();
    const acknowledgedWorkspace = JobFinderResumeWorkspaceSchema.parse({
      ...workspace,
      draft: {
        ...workspace.draft,
        workHistoryReviewAcknowledgments: [
          {
            id: "work_history_ack_demo_hidden_1",
            draftId: workspace.draft.id,
            profileRecordId: "experience_demo_hidden",
            kind: "weak_fit",
            action: "consider_showing",
            messageContentHash: "fnv1a32:465fc3f2",
            reason: "intentional_omission",
            acknowledgedAt: "2026-04-27T00:00:00.000Z",
          } satisfies WorkHistoryReviewAcknowledgment,
        ],
      },
    });
    const onSetWorkHistoryReviewAcknowledgment = vi.fn();

    renderScreen({
      onSetWorkHistoryReviewAcknowledgment,
      workspace: acknowledgedWorkspace,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText("Kept omitted").length).toBeGreaterThan(0);

    const undoButtons = screen.getAllByRole("button", {
      name: `Undo keep omitted · Weak fit: ${hiddenRoleMessage}`,
    });
    expect(undoButtons.length).toBeGreaterThan(0);
    expect(undoButtons[0]!.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(undoButtons[0]!);
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSetWorkHistoryReviewAcknowledgment).toHaveBeenCalledOnce();
    expect(onSetWorkHistoryReviewAcknowledgment).toHaveBeenCalledWith(
      "job_ready",
      {
        intent: "remove",
        acknowledgmentId: "work_history_ack_demo_hidden_1",
      },
    );
  });

  it("keeps stale acknowledgments unresolved when the projected hash no longer matches", async () => {
    const workspace = buildWorkspace();
    const staleAckWorkspace = JobFinderResumeWorkspaceSchema.parse({
      ...workspace,
      draft: {
        ...workspace.draft,
        workHistoryReviewAcknowledgments: [
          {
            id: "work_history_ack_stale_hash",
            draftId: workspace.draft.id,
            profileRecordId: "experience_demo_hidden",
            kind: "weak_fit",
            action: "consider_showing",
            messageContentHash: "fnv1a32:00000000",
            reason: "intentional_omission",
            acknowledgedAt: "2026-04-27T00:00:00.000Z",
          } satisfies WorkHistoryReviewAcknowledgment,
        ],
      },
    });

    renderScreen({ workspace: staleAckWorkspace });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText("Needs decision").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/waiting on an explicit kept-omitted decision/)
        .length,
    ).toBeGreaterThan(0);
  });

  it("disables decision buttons while workspace work is pending", async () => {
    const workspace = buildWorkspace();
    const onSetWorkHistoryReviewAcknowledgment = vi.fn();

    render(
      <ResumeWorkspaceScreen
        actionMessage={null}
        assistantMessages={[]}
        assistantPending={false}
        availableResumeTemplates={availableResumeTemplates}
        isWorkspacePending
        jobId="job_ready"
        onApplyPatch={vi.fn()}
        onApproveResume={vi.fn()}
        onBack={vi.fn()}
        onClearResumeApproval={vi.fn()}
        onDirtyChange={vi.fn()}
        onExportPdf={vi.fn()}
        onPreviewDraft={() =>
          Promise.resolve(buildPreview("preview_ready", "ready-preview"))
        }
        onRefresh={vi.fn()}
        onRegenerateDraft={vi.fn()}
        onRegenerateSection={vi.fn()}
        onRestoreRevision={vi.fn()}
        onSaveDraft={vi.fn()}
        onSaveDraftAndThen={vi.fn()}
        onSendAssistantMessage={vi.fn()}
        onSetWorkHistoryReviewAcknowledgment={
          onSetWorkHistoryReviewAcknowledgment
        }
        workspace={workspace}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const keepButtons = screen.getAllByRole("button", {
      name: `Keep omitted · Weak fit: ${hiddenRoleMessage}`,
    });
    expect(keepButtons.length).toBeGreaterThan(0);
    for (const button of keepButtons) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(button.hasAttribute("data-pending")).toBe(true);
    }

    fireEvent.click(keepButtons[0]!);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSetWorkHistoryReviewAcknowledgment).not.toHaveBeenCalled();
  });

  it("blocks approval with explanatory copy until every omission has a decision and focuses the list", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const workspace = buildWorkspace();
    const unapprovedWorkspace = JobFinderResumeWorkspaceSchema.parse({
      ...workspace,
      draft: {
        ...workspace.draft,
        approvedAt: null,
        approvedExportId: null,
      },
    });

    renderScreen({ workspace: unapprovedWorkspace });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(
      screen.getAllByText(/waiting on an explicit kept-omitted decision/)
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /Approve current PDF/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Approve this PDF",
      }),
    ).toBeNull();

    const reviewDecisionButtons = screen.getAllByRole("button", {
      name: "Review work-history decisions",
    });
    expect(reviewDecisionButtons.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(reviewDecisionButtons[0]!);

    await act(async () => {
      await Promise.resolve();
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(
      document.activeElement?.hasAttribute(
        "data-resume-work-history-decisions",
      ),
    ).toBe(true);
  });

  it("does not block approval or show the decisions list for compact-only suggestions", async () => {
    const workspace = buildWorkspace();
    const compactOnlyWorkspace = JobFinderResumeWorkspaceSchema.parse({
      ...workspace,
      workHistoryReviewSuggestions: [
        {
          id: "work_history_review_compact_only",
          profileRecordId: "experience_demo_previous",
          sectionId: null,
          entryId: null,
          kind: "compact_recommended",
          action: "keep_compact",
          severity: "info",
          message:
            "This resume is compact enough to keep every included entry as-is.",
          messageContentHash: "fnv1a32:32a7b731",
        },
      ],
    });

    renderScreen({ workspace: compactOnlyWorkspace });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.queryByText("Work-history decisions")).toBeNull();
    expect(
      screen.queryByText(/waiting on an explicit kept-omitted decision/),
    ).toBeNull();
  });

  it("saves unsaved edits before recording a kept-omitted decision", () => {
    const onSaveDraftAndThen = vi.fn();
    renderScreen({ onSaveDraftAndThen });

    fireEvent.change(screen.getAllByLabelText("Section text")[0]!, {
      target: { value: "Dirty summary before a work-history decision." },
    });

    fireEvent.click(
      screen.getAllByRole("button", {
        name: `Keep omitted · Weak fit: ${hiddenRoleMessage}`,
      })[0]!,
    );

    expect(onSaveDraftAndThen).toHaveBeenCalledTimes(1);
    expect(onSaveDraftAndThen.mock.calls[0]?.[2]).toBe(
      "Saved your draft before recording this decision.",
    );
  });

  it("saves unsaved edits once before accepting a guided edits proposal and resolves only after the save", async () => {
    const { workspace, message } = buildPendingProposalWorkspaceAndMessage();
    const onSaveDraftAndThen = vi.fn();
    const onResolveAssistantProposal = vi.fn();

    renderScreen({
      assistantMessages: [message],
      onResolveAssistantProposal,
      onSaveDraftAndThen,
      workspace,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    fireEvent.click(screen.getByRole("button", { name: /^Open guided edits/ }));

    fireEvent.change(screen.getAllByLabelText("Section text")[0]!, {
      target: {
        value: "Unsaved summary kept while accepting this proposal.",
      },
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "Accept selected (1)" }).at(-1)!,
    );

    expect(onSaveDraftAndThen).toHaveBeenCalledTimes(1);
    expect(onResolveAssistantProposal).not.toHaveBeenCalled();

    const savedDraft = onSaveDraftAndThen.mock.calls[0]?.[0] as ResumeDraft;
    expect(
      savedDraft.sections.some(
        (section) =>
          section.text ===
          "Unsaved summary kept while accepting this proposal.",
      ),
    ).toBe(true);

    const followUp = onSaveDraftAndThen.mock.calls[0]?.[1] as
      | (() => void | Promise<void>)
      | undefined;
    expect(followUp).toBeTypeOf("function");

    await act(async () => {
      await followUp?.();
    });

    expect(onResolveAssistantProposal).toHaveBeenCalledTimes(1);
    expect(onResolveAssistantProposal).toHaveBeenCalledWith(
      "job_ready",
      "proposal_1",
      "accept",
      ["proposal_patch_1"],
    );
  });

  it("saves unsaved edits before rejecting a guided edits proposal and resolves only after the save", async () => {
    const { workspace, message } = buildPendingProposalWorkspaceAndMessage();
    const onSaveDraftAndThen = vi.fn();
    const onResolveAssistantProposal = vi.fn();

    renderScreen({
      assistantMessages: [message],
      onResolveAssistantProposal,
      onSaveDraftAndThen,
      workspace,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    fireEvent.click(screen.getByRole("button", { name: /^Open guided edits/ }));

    fireEvent.change(screen.getAllByLabelText("Section text")[0]!, {
      target: {
        value: "Unsaved summary kept while rejecting this proposal.",
      },
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "Reject proposal" }).at(-1)!,
    );

    expect(onSaveDraftAndThen).toHaveBeenCalledTimes(1);
    expect(onSaveDraftAndThen.mock.calls[0]?.[2]).toBe(
      "Saved your draft before resolving this proposal.",
    );
    expect(onResolveAssistantProposal).not.toHaveBeenCalled();

    const savedDraft = onSaveDraftAndThen.mock.calls[0]?.[0] as ResumeDraft;
    expect(
      savedDraft.sections.some(
        (section) =>
          section.text ===
          "Unsaved summary kept while rejecting this proposal.",
      ),
    ).toBe(true);

    const followUp = onSaveDraftAndThen.mock.calls[0]?.[1] as
      | (() => void | Promise<void>)
      | undefined;
    expect(followUp).toBeTypeOf("function");

    await act(async () => {
      await followUp?.();
    });

    expect(onResolveAssistantProposal).toHaveBeenCalledTimes(1);
    expect(onResolveAssistantProposal).toHaveBeenCalledWith(
      "job_ready",
      "proposal_1",
      "reject",
      [],
    );
  });

  it("keeps unsaved edits and never resolves a guided edits proposal when the pre-action save fails or is stale", async () => {
    const { workspace, message } = buildPendingProposalWorkspaceAndMessage();
    // Mirrors the real save-and-then pipeline on failure/stale/conflict:
    // the follow-up action is suppressed and an actionable error is shown.
    const onSaveDraftAndThen = vi.fn();
    const onResolveAssistantProposal = vi.fn();

    renderScreen({
      assistantMessages: [message],
      onResolveAssistantProposal,
      onSaveDraftAndThen,
      workspace,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    fireEvent.click(screen.getByRole("button", { name: /^Open guided edits/ }));

    fireEvent.change(screen.getAllByLabelText("Section text")[0]!, {
      target: { value: "Local edit that must survive a failed save." },
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "Accept selected (1)" }).at(-1)!,
    );

    expect(onSaveDraftAndThen).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(onSaveDraftAndThen).toHaveBeenCalledTimes(1);
    expect(onResolveAssistantProposal).not.toHaveBeenCalled();
    expect(
      (onSaveDraftAndThen.mock.calls[0]?.[0] as ResumeDraft).sections.some(
        (section) =>
          section.text === "Local edit that must survive a failed save.",
      ),
    ).toBe(true);
  });

  it("resolves a guided edits proposal exactly once without saving when there are no dirty edits", async () => {
    const { workspace, message } = buildPendingProposalWorkspaceAndMessage();
    const onSaveDraftAndThen = vi.fn();
    const onResolveAssistantProposal = vi.fn();

    renderScreen({
      assistantMessages: [message],
      onResolveAssistantProposal,
      onSaveDraftAndThen,
      workspace,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    fireEvent.click(screen.getByRole("button", { name: /^Open guided edits/ }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Accept selected (1)" }).at(-1)!,
    );

    expect(onSaveDraftAndThen).not.toHaveBeenCalled();
    expect(onResolveAssistantProposal).toHaveBeenCalledTimes(1);
    expect(onResolveAssistantProposal).toHaveBeenCalledWith(
      "job_ready",
      "proposal_1",
      "accept",
      ["proposal_patch_1"],
    );
  });

  describe("draft-edit revision signals", () => {
    it("signals each user-authored mutation path: section, identity, reorder patch, and template", async () => {
      const onApplyPatch = vi.fn();
      const onDraftEdited = vi.fn();

      renderScreen({ onApplyPatch, onDraftEdited });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(onDraftEdited).not.toHaveBeenCalled();

      // A user-directed reorder patch both mutates local order and dispatches
      // its saved patch request; run it before local edits would require the
      // separate save-before-action continuation.
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", {
            name: "Move Senior systems designer up",
          }),
        );
        await Promise.resolve();
      });
      expect(onApplyPatch).toHaveBeenCalledTimes(1);
      expect(onDraftEdited).toHaveBeenCalledTimes(1);

      // Section editor keystrokes revise the local draft.
      fireEvent.change(screen.getAllByLabelText("Section text")[0]!, {
        target: { value: "Locally edited summary." },
      });
      expect(onDraftEdited).toHaveBeenCalledTimes(2);

      // Identity header edits go through the same draft-change contract.
      fireEvent.change(screen.getAllByLabelText("Full name")[0]!, {
        target: { value: "Renamed Candidate" },
      });
      expect(onDraftEdited).toHaveBeenCalledTimes(3);

      // Switching templates revises the draft's presentation settings.
      fireEvent.click(
        screen.getAllByRole("button", { name: "Change template" })[0]!,
      );
      fireEvent.click(
        screen
          .getAllByRole("button", { name: /^Use template: Engineering Spec/ })
          .at(-1)!,
      );
      expect(onDraftEdited).toHaveBeenCalledTimes(4);
    });

    it("stays silent while canonical revisions refresh and assistant proposals resolve", async () => {
      const onDraftEdited = vi.fn();
      const onResolveAssistantProposal = vi.fn();
      const { workspace, message } = buildPendingProposalWorkspaceAndMessage();

      const buildElement = (currentWorkspace: JobFinderResumeWorkspace) => (
        <ResumeWorkspaceScreen
          actionMessage={null}
          assistantMessages={[message]}
          assistantPending={false}
          availableResumeTemplates={availableResumeTemplates}
          isWorkspacePending={false}
          jobId="job_ready"
          onApplyPatch={vi.fn()}
          onApproveResume={vi.fn()}
          onBack={vi.fn()}
          onClearResumeApproval={vi.fn()}
          onDirtyChange={vi.fn()}
          onDraftEdited={onDraftEdited}
          onExportPdf={vi.fn()}
          onPreviewDraft={() =>
            Promise.resolve(buildPreview("preview_ready", "ready-preview"))
          }
          onRefresh={vi.fn()}
          onRegenerateDraft={vi.fn()}
          onRegenerateSection={vi.fn()}
          onResolveAssistantProposal={onResolveAssistantProposal}
          onRestoreRevision={vi.fn()}
          onSaveDraft={vi.fn()}
          onSaveDraftAndThen={vi.fn()}
          onSendAssistantMessage={vi.fn()}
          onSetWorkHistoryReviewAcknowledgment={vi.fn()}
          workspace={currentWorkspace}
        />
      );

      const view = render(buildElement(workspace));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Mount-time canonical hydration and preview refreshes never signal.
      expect(onDraftEdited).not.toHaveBeenCalled();

      // Assistant-authored proposal resolution flows through saved actions,
      // not local draft mutation, so accepting one must not signal.
      fireEvent.click(screen.getByRole("button", { name: /^Open guided edits/ }));
      fireEvent.click(
        screen.getAllByRole("button", { name: "Accept selected (1)" }).at(-1)!,
      );
      expect(onResolveAssistantProposal).toHaveBeenCalledTimes(1);
      expect(onDraftEdited).not.toHaveBeenCalled();

      // A later canonical revision re-clones the saved draft silently even
      // though the whole draft payload changed underneath the screen.
      const refreshedWorkspace = JobFinderResumeWorkspaceSchema.parse({
        ...workspace,
        draft: {
          ...workspace.draft,
          updatedAt: "2026-04-27T00:06:00.000Z",
          sections: workspace.draft.sections.map((section) =>
            section.text ? { ...section, text: "Canonical refresh text." } : section,
          ),
        },
      });

      await act(async () => {
        view.rerender(buildElement(refreshedWorkspace));
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(
        (screen.getAllByLabelText("Section text")[0] as HTMLTextAreaElement)
          .value,
      ).toBe("Canonical refresh text.");
      expect(onDraftEdited).not.toHaveBeenCalled();
    });

    it("propagates draft edits to the save coordinator so an edit after a failed save retires Retry with guidance", async () => {
      const states: JobFinderSaveState[] = [];
      const coordinator = createJobFinderSaveCoordinator({
        onStateChange: (state) => states.push(state),
      });

      renderScreen({ onDraftEdited: () => coordinator.markSurfaceRevised("resume") });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // First genuine edit: the studio becomes dirty and the revision epoch
      // advances BEFORE the failing save below captures its retry request.
      fireEvent.change(screen.getAllByLabelText("Section text")[0]!, {
        target: { value: "Dirty before the failed save." },
      });

      await act(async () => {
        const outcome = await coordinator.run({
          dedupeKey: "resume:integration-failure",
          execute: () => Promise.reject(new Error("save unavailable")),
          failedMessage: () => "Resume draft was not saved.",
          label: "Resume draft",
          savedMessage: "Changes saved.",
          surface: "resume",
        });
        expect(outcome.status).toBe("failed");
      });

      // No edit happened after the failure, so the exact-request retry stays.
      const failedState = states.at(-1);
      if (!failedState || failedState.state !== "failed") {
        throw new Error("Expected the failed save state.");
      }
      expect(failedState.canRetry).toBe(true);
      expect(failedState.retryBlockedReason).toBeUndefined();

      // A further user edit while already dirty retires the pre-edit retry:
      // Retry disappears and the stale-retry guidance takes its place.
      fireEvent.change(screen.getAllByLabelText("Section text")[0]!, {
        target: { value: "Edited again after the failed save." },
      });

      const retiredState = states.at(-1);
      if (!retiredState || retiredState.state !== "failed") {
        throw new Error("Expected the failed state to persist.");
      }
      expect(retiredState.canRetry).toBe(false);
      expect(retiredState.retryBlockedReason).toBe(
        JOB_FINDER_STALE_RETRY_GUIDANCE,
      );

      // Defense in depth at the seam: retry refuses instead of resubmitting.
      let retryOutcome: unknown = "unset";
      await act(async () => {
        retryOutcome = await coordinator.retry();
      });
      expect(retryOutcome).toBeNull();
    });
  });
});
