// @vitest-environment jsdom

import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  JobFinderResumeWorkspaceSchema,
  JobFinderSetResumeClaimConfirmationInputSchema,
  resumeClaimOwnershipStatement,
  type JobFinderResumeWorkspace,
  type JobFinderSetResumeClaimConfirmationInput,
  type ResumeClaimAssessment,
  type ResumeClaimConfirmation,
} from "@unemployed/contracts";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createApplyQueueDemoState } from "../../../../../../main/adapters/job-finder-demo-state";
import {
  buildResumeClaimConfirmationCommandInput,
  listConfirmNeededClaimAssessments,
  matchResumeClaimConfirmation,
  ResumeClaimConfirmationPanel,
} from "./resume-claim-confirmation-panel";

async function actAndFlush(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

const globalActScope = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = globalActScope.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
  globalActScope.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  if (originalActEnvironment === undefined) {
    delete globalActScope.IS_REACT_ACT_ENVIRONMENT;
    return;
  }
  globalActScope.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

function buildWorkspace(
  claimConfirmations: readonly ResumeClaimConfirmation[] = [],
): JobFinderResumeWorkspace {
  const state = createApplyQueueDemoState();
  const job = state.savedJobs.find((entry) => entry.id === "job_ready");
  const baseDraft = state.resumeDrafts.find(
    (entry) => entry.jobId === "job_ready",
  );

  if (!job || !baseDraft) {
    throw new Error(
      "Expected demo state to contain the ready resume workspace fixture.",
    );
  }

  return JobFinderResumeWorkspaceSchema.parse({
    job,
    draft: { ...baseDraft, claimConfirmations },
    exports: [],
    research: [],
    assistantMessages: [],
    tailoredAsset: null,
    sharedProfile: {},
    workHistoryReviewSuggestions: [],
  });
}

const bulletTargetLabel = "Experience · Senior systems designer · Bullet 1";

const confirmNeededBullet: ResumeClaimAssessment = {
  id: "claim_assessment_bullet",
  field: "entry_bullet",
  sectionId: "section_experience",
  entryId: "entry_signal_systems",
  bulletId: "bullet_signal_rollout",
  claimText: "Led design-system rollout across core workflow surfaces.",
  claimOrigin: "ai_generated",
  contentHash: "fnv1a32:11111111",
  status: "confirm_needed",
  evidenceRefs: [],
  verifier: "deterministic_candidate_evidence_v2",
  assessedAt: "2026-08-20T10:00:00.000Z",
};

function buildConfirmation(
  overrides?: Partial<ResumeClaimConfirmation>,
): ResumeClaimConfirmation {
  return {
    id: "claim_confirmation_1",
    draftId: "draft_under_test",
    field: confirmNeededBullet.field,
    sectionId: confirmNeededBullet.sectionId,
    entryId: confirmNeededBullet.entryId,
    bulletId: confirmNeededBullet.bulletId,
    confirmedClaimContentHash: confirmNeededBullet.contentHash,
    ownershipStatement: resumeClaimOwnershipStatement,
    confirmedAt: "2026-08-20T11:00:00.000Z",
    ...overrides,
  };
}

describe("resume claim confirmation helpers", () => {
  it("matches confirmations only on exact draft, locator, and hash", () => {
    const confirmation = buildConfirmation();

    expect(
      matchResumeClaimConfirmation({
        assessment: confirmNeededBullet,
        confirmations: [confirmation],
        draftId: confirmation.draftId,
      })?.id,
    ).toBe(confirmation.id);
    expect(
      matchResumeClaimConfirmation({
        assessment: confirmNeededBullet,
        confirmations: [confirmation],
        draftId: "other_draft",
      }),
    ).toBeNull();
    expect(
      matchResumeClaimConfirmation({
        assessment: { ...confirmNeededBullet, contentHash: "fnv1a32:22222222" },
        confirmations: [confirmation],
        draftId: confirmation.draftId,
      }),
    ).toBeNull();
    expect(
      matchResumeClaimConfirmation({
        assessment: { ...confirmNeededBullet, bulletId: "bullet_other" },
        confirmations: [confirmation],
        draftId: confirmation.draftId,
      }),
    ).toBeNull();
  });

  it("lists only current-verifier confirm_needed assessments", () => {
    expect(
      listConfirmNeededClaimAssessments([
        confirmNeededBullet,
        {
          ...confirmNeededBullet,
          id: "claim_v1",
          verifier: "deterministic_candidate_evidence_v1",
        },
        {
          ...confirmNeededBullet,
          id: "claim_unsupported",
          status: "unsupported",
        },
        { ...confirmNeededBullet, id: "claim_review", status: "review" },
        { ...confirmNeededBullet, id: "claim_exact", status: "exact" },
        {
          ...confirmNeededBullet,
          id: "claim_paraphrase",
          status: "paraphrase",
        },
      ]).map((assessment) => assessment.id),
    ).toEqual(["claim_assessment_bullet"]);
  });

  it("builds the add command with saved revision, locator, hash, and literal ownership statement", () => {
    const draft = buildWorkspace().draft;
    const input = buildResumeClaimConfirmationCommandInput({
      claimAssessments: [confirmNeededBullet],
      draft,
      jobId: "job_ready",
      request: { intent: "add", target: confirmNeededBullet },
    });

    expect(input).toEqual({
      intent: "add",
      jobId: "job_ready",
      draftId: draft.id,
      expectedDraftUpdatedAt: draft.updatedAt,
      field: "entry_bullet",
      sectionId: "section_experience",
      entryId: "entry_signal_systems",
      bulletId: "bullet_signal_rollout",
      confirmedClaimContentHash: confirmNeededBullet.contentHash,
      ownershipStatement: resumeClaimOwnershipStatement,
    });
    expect(() =>
      JobFinderSetResumeClaimConfirmationInputSchema.parse(input),
    ).not.toThrow();
  });

  it("refuses add commands whose captured wording no longer matches the projection", () => {
    const draft = buildWorkspace().draft;

    expect(
      buildResumeClaimConfirmationCommandInput({
        claimAssessments: [confirmNeededBullet],
        draft,
        jobId: "job_ready",
        request: {
          intent: "add",
          target: { ...confirmNeededBullet, contentHash: "fnv1a32:33333333" },
        },
      }),
    ).toBeNull();
    expect(
      buildResumeClaimConfirmationCommandInput({
        claimAssessments: [{ ...confirmNeededBullet, status: "review" }],
        draft,
        jobId: "job_ready",
        request: { intent: "add", target: confirmNeededBullet },
      }),
    ).toBeNull();
    expect(
      buildResumeClaimConfirmationCommandInput({
        claimAssessments: [
          {
            ...confirmNeededBullet,
            verifier: "deterministic_candidate_evidence_v1",
          },
        ],
        draft,
        jobId: "job_ready",
        request: { intent: "add", target: confirmNeededBullet },
      }),
    ).toBeNull();
  });

  it("builds the remove command only from a confirmation stored on the same draft", () => {
    const confirmation = buildConfirmation({ draftId: "draft_1" });
    const draft = { ...buildWorkspace([confirmation]).draft, id: "draft_1" };

    expect(
      buildResumeClaimConfirmationCommandInput({
        claimAssessments: [confirmNeededBullet],
        draft,
        jobId: "job_ready",
        request: { intent: "remove", confirmationId: confirmation.id },
      }),
    ).toEqual({
      intent: "remove",
      jobId: "job_ready",
      draftId: "draft_1",
      expectedDraftUpdatedAt: draft.updatedAt,
      confirmationId: confirmation.id,
    });
    expect(
      buildResumeClaimConfirmationCommandInput({
        claimAssessments: [confirmNeededBullet],
        draft: { ...draft, id: "draft_2" },
        jobId: "job_ready",
        request: { intent: "remove", confirmationId: confirmation.id },
      }),
    ).toBeNull();
  });
});

describe("ResumeClaimConfirmationPanel", () => {
  afterEach(() => {
    cleanup();
  });

  function renderPanel(options?: {
    claimConfirmations?: readonly ResumeClaimConfirmation[];
    hasUnsavedChanges?: boolean;
    onSetResumeClaimConfirmation?: (
      input: JobFinderSetResumeClaimConfirmationInput,
    ) => Promise<unknown>;
  }) {
    return render(
      <ResumeClaimConfirmationPanel
        claimAssessments={[confirmNeededBullet]}
        draft={buildWorkspace(options?.claimConfirmations ?? []).draft}
        hasUnsavedChanges={options?.hasUnsavedChanges ?? false}
        isWorkspacePending={false}
        jobId="job_ready"
        onSetResumeClaimConfirmation={
          options?.onSetResumeClaimConfirmation ?? vi.fn()
        }
      />,
    );
  }

  it("renders nothing when no claim needs confirmation", () => {
    const { container } = render(
      <ResumeClaimConfirmationPanel
        claimAssessments={[
          { ...confirmNeededBullet, status: "exact" },
          {
            ...confirmNeededBullet,
            id: "claim_unsupported",
            status: "unsupported",
          },
        ]}
        draft={buildWorkspace().draft}
        hasUnsavedChanges={false}
        isWorkspacePending={false}
        jobId="job_ready"
        onSetResumeClaimConfirmation={vi.fn()}
      />,
    );

    expect(container.querySelector("section")).toBeNull();
  });

  it("shows the human target label, claim text, explanation, and exact ownership statement without raw ids", () => {
    const { container } = renderPanel();

    expect(screen.getByText(bulletTargetLabel)).toBeTruthy();
    expect(screen.getByText(confirmNeededBullet.claimText)).toBeTruthy();
    expect(
      screen.getByText(
        `Required confirmation: “${resumeClaimOwnershipStatement}”`,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Evidence incomplete")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "1 of 1 claims still need your explicit confirmation",
    );
    expect(container.textContent).not.toContain("claim_assessment_bullet");
    expect(container.textContent).not.toContain("fnv1a32");
  });

  it("gives unsupported and verified-evidence rows no confirm controls", () => {
    render(
      <ResumeClaimConfirmationPanel
        claimAssessments={[
          confirmNeededBullet,
          {
            ...confirmNeededBullet,
            id: "claim_unsupported",
            claimText: "Cut costs by 90 percent.",
            status: "unsupported",
          },
          {
            ...confirmNeededBullet,
            id: "claim_exact",
            claimText: "Verbatim candidate evidence.",
            status: "exact",
          },
        ]}
        draft={buildWorkspace().draft}
        hasUnsavedChanges={false}
        isWorkspacePending={false}
        jobId="job_ready"
        onSetResumeClaimConfirmation={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Cut costs by 90 percent.")).toBeNull();
    expect(screen.queryByText("Verbatim candidate evidence.")).toBeNull();
  });

  it("submits the exact add command once and suppresses duplicate clicks while pending", async () => {
    let resolveCommand!: (value: unknown) => void;
    const onSetResumeClaimConfirmation = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCommand = resolve;
        }),
    );
    const draft = buildWorkspace().draft;

    render(
      <ResumeClaimConfirmationPanel
        claimAssessments={[confirmNeededBullet]}
        draft={draft}
        hasUnsavedChanges={false}
        isWorkspacePending={false}
        jobId="job_ready"
        onSetResumeClaimConfirmation={onSetResumeClaimConfirmation}
      />,
    );

    const confirmButton = screen.getByRole("button", {
      name: `Confirm this wording · ${bulletTargetLabel}`,
    });

    fireEvent.click(confirmButton);
    expect(onSetResumeClaimConfirmation).toHaveBeenCalledTimes(1);
    expect(onSetResumeClaimConfirmation).toHaveBeenCalledWith({
      intent: "add",
      jobId: "job_ready",
      draftId: draft.id,
      expectedDraftUpdatedAt: draft.updatedAt,
      field: "entry_bullet",
      sectionId: "section_experience",
      entryId: "entry_signal_systems",
      bulletId: "bullet_signal_rollout",
      confirmedClaimContentHash: confirmNeededBullet.contentHash,
      ownershipStatement: resumeClaimOwnershipStatement,
    });

    // Pending keeps the control exposed but inert, so focus stays put and a
    // second activation cannot submit twice.
    expect(confirmButton.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(confirmButton);
    expect(onSetResumeClaimConfirmation).toHaveBeenCalledTimes(1);

    await actAndFlush(() => {
      resolveCommand(undefined);
    });
    expect(confirmButton.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("derives the confirmed state from the returned snapshot and undoes by confirmation id", async () => {
    const onSetResumeClaimConfirmation = vi
      .fn<
        (input: JobFinderSetResumeClaimConfirmationInput) => Promise<unknown>
      >()
      .mockResolvedValue({});
    const savedDraftId = buildWorkspace().draft.id;
    const confirmation = buildConfirmation({ draftId: savedDraftId });
    const { rerender } = renderPanel({ onSetResumeClaimConfirmation });

    await actAndFlush(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Confirm this wording/ }),
      );
    });

    // The committed workspace snapshot comes back through props: same
    // assessments, draft now carrying the stored confirmation.
    rerender(
      <ResumeClaimConfirmationPanel
        claimAssessments={[confirmNeededBullet]}
        draft={buildWorkspace([confirmation]).draft}
        hasUnsavedChanges={false}
        isWorkspacePending={false}
        jobId="job_ready"
        onSetResumeClaimConfirmation={onSetResumeClaimConfirmation}
      />,
    );

    expect(screen.getByText("Confirmed by you")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Confirm this wording/ }),
    ).toBeNull();

    const undoButton = screen.getByRole("button", {
      name: `Undo confirmation · ${bulletTargetLabel}`,
    });
    await actAndFlush(() => {
      fireEvent.click(undoButton);
    });

    expect(onSetResumeClaimConfirmation).toHaveBeenCalledTimes(2);
    expect(onSetResumeClaimConfirmation).toHaveBeenLastCalledWith({
      intent: "remove",
      jobId: "job_ready",
      draftId: savedDraftId,
      expectedDraftUpdatedAt: buildWorkspace([confirmation]).draft.updatedAt,
      confirmationId: confirmation.id,
    });
  });

  it("keeps stale rejections visible with truthful retry copy and allows retrying", async () => {
    const onSetResumeClaimConfirmation = vi
      .fn<
        (input: JobFinderSetResumeClaimConfirmationInput) => Promise<unknown>
      >()
      .mockRejectedValueOnce(
        new Error(
          "Resume draft changed before this claim confirmation could be saved. Reload the workspace and try again.",
        ),
      )
      .mockResolvedValue({});
    const { container } = renderPanel({ onSetResumeClaimConfirmation });

    await actAndFlush(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Confirm this wording/ }),
      );
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "Resume draft changed before this claim confirmation could be saved. Reload the workspace and try again.",
    );
    expect(container.querySelector("[data-pending]")).toBeNull();

    await actAndFlush(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Confirm this wording/ }),
      );
    });
    expect(onSetResumeClaimConfirmation).toHaveBeenCalledTimes(2);
  });

  it("notes that checks describe the last saved draft while edits are unsaved", () => {
    renderPanel({ hasUnsavedChanges: true });

    expect(
      screen.getByText(
        "These checks describe the last saved draft. Save your edits to refresh claim evidence.",
      ),
    ).toBeTruthy();
  });
});
