// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { ApplicationsDetailPanelRecoveryActionsSection } from "./applications-detail-panel-recovery-actions-section";

afterEach(cleanup);

describe("ApplicationsDetailPanelRecoveryActionsSection", () => {
  it("offers an explicit user-confirmed retry after an application sign-in handoff", () => {
    const onStartApplyCopilot = vi.fn();
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_auth_wait",
        runId: "run_auth_wait",
        jobId: "job_workday",
        queuePosition: 0,
        state: "blocked",
        summary: "The application requires an authenticated account.",
        detail: "Sign in manually, then retry preparation.",
        startedAt: "2026-07-14T10:00:00.000Z",
        updatedAt: "2026-07-14T10:01:00.000Z",
        completedAt: "2026-07-14T10:01:00.000Z",
        blockerReason: "auth_required",
        blockerSummary: "Sign in manually.",
        visualObservationSets: [],
        visualCheckpoints: [],
        latestQuestionCount: 0,
        latestAnswerCount: 0,
        pendingConsentRequestCount: 0,
        artifactCount: 0,
        latestCheckpointId: null,
        privacyReceipt: null,
      };

    const { getByRole, getByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={1}
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_workday"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    expect(getByText(/never handles or stores your credentials/i)).toBeTruthy();
    fireEvent.click(
      getByRole("button", { name: /i'm signed in — retry application/i }),
    );
    expect(onStartApplyCopilot).toHaveBeenCalledWith("job_workday");
  });

  it("explains a failed CV attachment and makes retry an explicit approval", () => {
    const onStartApplyCopilot = vi.fn();
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_resume_wait",
        runId: "run_resume_wait",
        jobId: "job_greenhouse",
        queuePosition: 0,
        state: "blocked",
        summary: "Resume attachment needs your help",
        detail: "The approved CV was not attached.",
        startedAt: "2026-07-16T10:00:00.000Z",
        updatedAt: "2026-07-16T10:01:00.000Z",
        completedAt: "2026-07-16T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary: "Resume attachment needs your help",
        visualObservationSets: [],
        visualCheckpoints: [],
        latestQuestionCount: 4,
        latestAnswerCount: 3,
        pendingConsentRequestCount: 0,
        artifactCount: 1,
        latestCheckpointId: "checkpoint_resume_wait",
        privacyReceipt: null,
      };

    const { getByRole, getByText, queryByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={1}
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_greenhouse"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    expect(getByText(/approved CV was not attached/i)).toBeTruthy();
    expect(queryByText(/POST|XHR|mutating page action/i)).toBeNull();
    fireEvent.click(
      getByRole("button", { name: /approve and retry CV attachment/i }),
    );
    expect(onStartApplyCopilot).toHaveBeenCalledWith("job_greenhouse");
  });

  it("keeps long safe preparation visibly explained while controls are disabled", () => {
    const { getByRole, getByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={1}
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={true}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_greenhouse"
        selectedRun={null}
        visibleApplyResult={null}
      />,
    );

    expect(getByRole("status").textContent).toMatch(
      /stop before the final submit control/i,
    );
    const pendingButton = getByRole("button", { name: /preparing safely/i });
    expect(getByText(/can take up to a minute/i)).toBeTruthy();
    expect(pendingButton).toHaveProperty("disabled", true);
  });
});
