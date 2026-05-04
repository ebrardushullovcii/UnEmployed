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
} from "@unemployed/contracts";
import { getResumeIdentityTargetId } from "@unemployed/contracts";
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
import { ResumeWorkspaceScreen } from "./resume-workspace-screen";

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
        entryId: "experience_demo_hidden",
        kind: "weak_fit",
        action: "consider_showing",
        severity: "info",
        message:
          "Hidden by default for review: this role has a weaker career-family fit for the target job.",
      },
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
    createdAt: overrides?.createdAt ?? "2026-04-27T00:00:00.000Z",
  };
}

function renderScreen(options?: {
  assistantMessages?: ResumeAssistantMessage[];
  assistantPending?: boolean;
  onApplyPatch?: (
    patch: ResumeDraftPatch,
    revisionReason?: string | null,
  ) => void;
  onPreviewDraft?: (draft: ResumeDraft) => Promise<JobFinderResumePreview>;
  onSaveDraftAndThen?: (
    draft: ResumeDraft,
    next: () => void,
    successMessage?: string | null,
  ) => void;
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
      onExportPdf={vi.fn()}
      onPreviewDraft={onPreviewDraft}
      onRefresh={vi.fn()}
      onRegenerateDraft={vi.fn()}
      onRegenerateSection={vi.fn()}
      onSaveDraft={vi.fn()}
      onSaveDraftAndThen={options?.onSaveDraftAndThen ?? vi.fn()}
      onSendAssistantMessage={vi.fn()}
      workspace={buildWorkspace()}
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

  afterEach(() => {
    vi.runOnlyPendingTimers();
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

    expect(screen.getAllByText("Template strategy").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Engineering Spec · Skills First").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Use this template" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Open guided edits" }).length,
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
      screen.getAllByRole("button", { name: "Open guided edits" }).length,
    ).toBeGreaterThan(0);
  });

  it("opens the guided edits popup from the always-available bubble", async () => {
    renderScreen();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    fireEvent.click(screen.getByRole("button", { name: "Open guided edits" }));

    expect(screen.getByRole("dialog", { name: "Guided edits" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Minimize guided edits" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
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
        onSaveDraft={vi.fn()}
        onSaveDraftAndThen={vi.fn()}
        onSendAssistantMessage={vi.fn()}
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
          onSaveDraft={vi.fn()}
          onSaveDraftAndThen={vi.fn()}
          onSendAssistantMessage={vi.fn()}
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

  it("shows work-history review guidance in the editor without rendering it in the preview iframe", async () => {
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

    const previewFrame = screen.getAllByTitle(
      "Live resume preview",
    )[0] as HTMLIFrameElement;
    const renderedHtml =
      previewFrame.getAttribute("srcdoc") ?? previewFrame.srcdoc;

    expect(renderedHtml).not.toContain("weaker career-family fit");
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
      name: "Move entry up",
    });
    const moveDownButtons = screen.getAllByRole("button", {
      name: "Move entry down",
    });

    expect(moveUpButtons.length).toBeGreaterThanOrEqual(2);
    expect(moveUpButtons[0]).toHaveProperty("disabled", true);
    expect(moveDownButtons.at(-1)).toHaveProperty("disabled", true);

    fireEvent.click(moveUpButtons[1]!);

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
                    sortOrder: 0,
                  },
                  {
                    ...experienceSection.entries[0]!,
                    dateRange: "2024 – Present",
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
        onSaveDraft={vi.fn()}
        onSaveDraftAndThen={vi.fn()}
        onSendAssistantMessage={vi.fn()}
        workspace={manualWorkspace}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText("Manual order").length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("button", { name: /Reset to chronology/i }),
    );

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
});
