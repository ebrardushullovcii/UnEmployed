// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { ApplyRunSchema } from "@unemployed/contracts";
import type { QueueEntry } from "./applications-detail-panel-helpers";
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
        applicationRecordId: "application_workday",
        queuePosition: 0,
        state: "blocked",
        summary: "The application requires an authenticated account.",
        detail: "Sign in manually, then retry preparation.",
        startedAt: "2026-07-14T10:00:00.000Z",
        updatedAt: "2026-07-14T10:01:00.000Z",
        completedAt: "2026-07-14T10:01:00.000Z",
        blockerReason: "auth_required",
        blockerSummary: "Sign in manually.",
        listingSignalEvidence: null,
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
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_workday"
        selectedApplicationRecordId="application_workday"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    expect(getByText(/never handles or stores your credentials/i)).toBeTruthy();
    fireEvent.click(
      getByRole("button", { name: /i'm signed in — retry preparation/i }),
    );
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_workday",
      applicationRecordId: "application_workday",
    });
    expect(getByRole("button", { name: /retry preparation/i })).toBeTruthy();
    expect(
      getByRole("button", { name: "Queue automatic preparation" }),
    ).toBeTruthy();
    expect(getByRole("button", { name: "Queue remaining jobs" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(
      /apply copilot|restage|rerun/i,
    );
  });

  it("explains a failed resume attachment and makes retry an explicit approval", () => {
    const onStartApplyCopilot = vi.fn();
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_resume_wait",
        runId: "run_resume_wait",
        jobId: "job_greenhouse",
        applicationRecordId: "application_greenhouse",
        queuePosition: 0,
        state: "blocked",
        summary: "Resume attachment needs your help",
        detail: "The approved resume was not attached.",
        startedAt: "2026-07-16T10:00:00.000Z",
        updatedAt: "2026-07-16T10:01:00.000Z",
        completedAt: "2026-07-16T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary: "Resume attachment needs your help",
        listingSignalEvidence: null,
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
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_greenhouse"
        selectedApplicationRecordId="application_greenhouse"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    expect(getByText(/approved resume was not attached/i)).toBeTruthy();
    expect(
      getByText(/no verified site writes are recorded for this run/i),
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(
      /fields? (?:were )?saved|fields? remain/i,
    );
    expect(queryByText(/POST|XHR|mutating page action/i)).toBeNull();
    fireEvent.click(
      getByRole("button", { name: /approve and retry resume attachment/i }),
    );
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_greenhouse",
      applicationRecordId: "application_greenhouse",
    });
  });

  it("keeps long safe preparation visibly explained while controls are disabled", () => {
    const { getByRole, getByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={1}
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={true}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_greenhouse"
        selectedApplicationRecordId="application_greenhouse"
        selectedRun={null}
        visibleApplyResult={null}
      />,
    );

    expect(getByRole("status").textContent).toMatch(
      /stop before the final submit control/i,
    );
    const pendingButton = getByRole("button", { name: /preparing safely/i });
    expect(getByText(/can take up to a minute/i)).toBeTruthy();
    // Pending keeps the control exposed but inert instead of natively
    // disabled, so focus survives the in-flight preparation.
    expect(pendingButton.hasAttribute("disabled")).toBe(false);
    expect(pendingButton.getAttribute("aria-disabled")).toBe("true");
    expect(pendingButton.getAttribute("aria-busy")).toBe("true");
  });

  it("discloses the fresh run and daily slot cost in the sign-in retry copy", () => {
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_auth_wait_slots",
        runId: "run_auth_wait_slots",
        jobId: "job_workday",
        applicationRecordId: "application_workday",
        queuePosition: 0,
        state: "blocked",
        summary: "The application requires an authenticated account.",
        detail: "Sign in manually, then retry preparation.",
        startedAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:01:00.000Z",
        completedAt: "2026-08-20T10:01:00.000Z",
        blockerReason: "auth_required",
        blockerSummary: "Sign in manually.",
        listingSignalEvidence: null,
        visualObservationSets: [],
        visualCheckpoints: [],
        latestQuestionCount: 0,
        latestAnswerCount: 0,
        pendingConsentRequestCount: 0,
        artifactCount: 0,
        latestCheckpointId: null,
        privacyReceipt: null,
      };

    const { getByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={1}
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_workday"
        selectedApplicationRecordId="application_workday"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    expect(
      getByText(
        /Retrying creates a fresh run and uses one of today's remaining application slots\./i,
      ),
    ).toBeTruthy();
  });

  it("reports an unreachable employer page as a technical failure without jargon or a Needs-you ask", () => {
    const onStartApplyCopilot = vi.fn();
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_unreachable",
        runId: "run_unreachable",
        jobId: "job_ashby",
        applicationRecordId: "application_ashby",
        queuePosition: 0,
        state: "failed",
        summary: "Job Finder could not open the application page",
        detail:
          "The dedicated browser could not load this employer page, so preparation stopped before the page opened. Nothing was filled, attached, or submitted.",
        startedAt: "2026-08-21T10:00:00.000Z",
        updatedAt: "2026-08-21T10:01:00.000Z",
        completedAt: "2026-08-21T10:01:00.000Z",
        blockerReason: "application_page_unreachable",
        blockerSummary: "Job Finder could not open the application page.",
        listingSignalEvidence: null,
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
        applyRunHistoryCount={2}
        canRestageAutoRun={true}
        canRestageQueueRun={false}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_ashby"
        selectedApplicationRecordId="application_ashby"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    expect(
      getByText(
        /could not open this employer page, so preparation stopped before anything was filled or submitted/i,
      ),
    ).toBeTruthy();
    expect(
      getByText(/did not count against today's application slots/i),
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(
      /needs you|manual review|net::|ERR_|timeout exceeded|sign in/i,
    );
    fireEvent.click(getByRole("button", { name: /retry preparation/i }));
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_ashby",
      applicationRecordId: "application_ashby",
    });
  });

  it("disables every start control and names the reached daily limit when no preparation slots remain", () => {
    const onStartApplyCopilot = vi.fn();
    const onStartAutoApply = vi.fn();
    const onStartAutoApplyQueue = vi.fn();

    const { getByRole, getByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={3}
        canRestageAutoRun={true}
        canRestageQueueRun={true}
        dailyPreparationCapacity={{
          limit: 20,
          used: 20,
          legacyUncertain: 0,
          remaining: 0,
          localDate: "2026-08-25",
          resetsAt: "2026-08-26T04:00:00.000Z",
        }}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={onStartAutoApply}
        onStartAutoApplyQueue={onStartAutoApplyQueue}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={["job_workday"]}
        selectedRecordJobId="job_workday"
        selectedApplicationRecordId="application_workday"
        selectedRun={null}
        visibleApplyResult={null}
      />,
    );

    const alert = getByTestId("daily-capacity-reached-alert");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toMatch(/20 of 20 used today/i);
    expect(alert.textContent).toMatch(/reset at local midnight \(/i);

    for (const name of [
      /retry preparation/i,
      /queue automatic preparation/i,
      /queue remaining jobs/i,
    ]) {
      const button = getByRole("button", { name });
      expect(button).toHaveProperty("disabled", true);
      fireEvent.click(button);
    }
    expect(onStartApplyCopilot).not.toHaveBeenCalled();
    expect(onStartAutoApply).not.toHaveBeenCalled();
    expect(onStartAutoApplyQueue).not.toHaveBeenCalled();
  });

  it("keeps recovery controls available while at least one daily slot remains", () => {
    const onStartApplyCopilot = vi.fn();

    const { getByRole, queryByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={1}
        canRestageAutoRun={true}
        canRestageQueueRun={false}
        dailyPreparationCapacity={{
          limit: 20,
          used: 19,
          legacyUncertain: 0,
          remaining: 1,
          localDate: "2026-08-25",
          resetsAt: "2026-08-26T04:00:00.000Z",
        }}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={["job_workday"]}
        selectedRecordJobId="job_workday"
        selectedApplicationRecordId="application_workday"
        selectedRun={null}
        visibleApplyResult={null}
      />,
    );

    expect(queryByTestId("daily-capacity-reached-alert")).toBeNull();
    const retryButton = getByRole("button", { name: /retry preparation/i });
    expect(retryButton).toHaveProperty("disabled", false);
    fireEvent.click(retryButton);
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_workday",
      applicationRecordId: "application_workday",
    });
  });

  it("disables Queue remaining jobs with a trim-to-N reason when the selection exceeds today's remaining slots", () => {
    const onStartApplyCopilot = vi.fn();
    const onStartAutoApplyQueue = vi.fn();

    const { getByRole, getByTestId, queryByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={2}
        canRestageAutoRun={true}
        canRestageQueueRun={true}
        dailyPreparationCapacity={{
          limit: 20,
          used: 19,
          legacyUncertain: 0,
          remaining: 1,
          localDate: "2026-08-25",
          resetsAt: "2026-08-26T04:00:00.000Z",
        }}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={onStartAutoApplyQueue}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={["job_workday", "job_greenhouse"]}
        selectedRecordJobId="job_workday"
        selectedApplicationRecordId="application_workday"
        selectedRun={null}
        visibleApplyResult={null}
      />,
    );

    // A partial exceedance is not full exhaustion, so the reached alert and
    // its copy stay out of the way of the trim guidance.
    expect(queryByTestId("daily-capacity-reached-alert")).toBeNull();

    const queueButton = getByRole("button", { name: "Queue remaining jobs" });
    expect(queueButton).toHaveProperty("disabled", true);
    fireEvent.click(queueButton);
    expect(onStartAutoApplyQueue).not.toHaveBeenCalled();

    const note = getByTestId("queue-recovery-daily-capacity-exceeded-note");
    expect(note.textContent).toMatch(/You selected 2 jobs for this run/i);
    expect(note.textContent).toMatch(
      /only 1 of 20 daily application slot remains today/i,
    );
    expect(note.textContent).toMatch(/Trim the selection to 1 or fewer/i);
    // The disabled control points at the note that explains why.
    expect(queueButton.getAttribute("aria-describedby")).toBe(
      note.getAttribute("id"),
    );

    // A single-job retry remains valid while one daily slot remains.
    const retryButton = getByRole("button", { name: /retry preparation/i });
    expect(retryButton).toHaveProperty("disabled", false);
    fireEvent.click(retryButton);
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_workday",
      applicationRecordId: "application_workday",
    });
  });

  it("names every restartable outcome and says a stop-rule-paused auto run needs a fresh recovery run", () => {
    const onStartAutoApplyQueue = vi.fn();
    const now = "2026-08-25T10:00:00.000Z";
    const selectedRun = ApplyRunSchema.parse({
      id: "run_queue_paused",
      mode: "queue_auto",
      state: "paused_for_user_review",
      jobIds: ["job_a", "job_b", "job_c"],
      currentJobId: null,
      summary: "The queue stopped for your review.",
      detail: "Preparation stopped before any final submit control.",
      createdAt: now,
      updatedAt: now,
    });
    type ApplyJobResult = JobFinderWorkspaceSnapshot["applyJobResults"][number];
    const resultWithState = (state: ApplyJobResult["state"]) =>
      ({ state }) as ApplyJobResult;
    const selectedQueueOutcomeEntries: QueueEntry[] = [
      {
        jobId: "job_a",
        label: "Job A at Employer A",
        runResult: resultWithState("awaiting_review"),
        includeInRecovery: false,
      },
      {
        jobId: "job_b",
        label: "Job B at Employer B",
        runResult: resultWithState("failed"),
        includeInRecovery: true,
      },
      {
        jobId: "job_c",
        label: "Job C at Employer C",
        runResult: resultWithState("skipped"),
        includeInRecovery: true,
      },
    ];

    const { getByRole, getByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={1}
        canRestageAutoRun={true}
        canRestageQueueRun={true}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[selectedQueueOutcomeEntries[0]!]}
        isApplyPending={false}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={onStartAutoApplyQueue}
        selectedQueueOutcomeEntries={selectedQueueOutcomeEntries}
        selectedQueueRecoveryEntries={[
          selectedQueueOutcomeEntries[1]!,
          selectedQueueOutcomeEntries[2]!,
        ]}
        selectedQueueRecoveryJobIds={["job_b", "job_c"]}
        selectedRecordJobId="job_b"
        selectedApplicationRecordId="application_b"
        selectedRun={selectedRun}
        visibleApplyResult={null}
      />,
    );

    // The target count covers every outcome the recovery set actually
    // includes, not only remaining and blocked jobs.
    expect(
      getByText(
        /targets\s+2\s+remaining, blocked, failed, or skipped jobs from the selected run\./i,
      ),
    ).toBeTruthy();

    // A stop-rule pause holds no resumable decision: say so, and point at
    // Queue remaining jobs as the fresh-run path forward.
    const explanation = getByText(
      /paused this run on one of its stop rules\. It will not continue on its own/i,
    );
    expect(explanation.textContent).toContain(
      "Use Queue remaining jobs to finish the unfinished jobs in a fresh safe recovery run",
    );
    expect(explanation.textContent).not.toMatch(/Resolve the consent request/i);

    // Finishing stays possible through a fresh recovery run.
    const queueButton = getByRole("button", { name: "Queue remaining jobs" });
    expect(queueButton).toHaveProperty("disabled", false);
    fireEvent.click(queueButton);
    expect(onStartAutoApplyQueue).toHaveBeenCalledWith(["job_b", "job_c"]);
  });
});
