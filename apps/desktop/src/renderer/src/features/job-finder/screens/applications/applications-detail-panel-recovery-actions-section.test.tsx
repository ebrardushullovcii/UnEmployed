// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { ApplyRunSchema } from "@unemployed/contracts";
import type { QueueEntry } from "./applications-detail-panel-helpers";
import {
  ApplicationsDetailPanelRecoveryActionsSection,
  type FinishInBrowserHandler,
  type FinishInBrowserOutcome,
} from "./applications-detail-panel-recovery-actions-section";

afterEach(cleanup);

describe("ApplicationsDetailPanelRecoveryActionsSection", () => {
  it("makes a blocker-only uncertain submission terminal with no retry controls", () => {
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_uncertain",
        runId: "run_uncertain",
        jobId: "job_uncertain",
        applicationRecordId: "application_uncertain",
        queuePosition: 0,
        state: "blocked",
        summary: "Submission outcome needs verification.",
        detail: "Check the employer site.",
        startedAt: "2026-08-28T10:00:00.000Z",
        updatedAt: "2026-08-28T10:01:00.000Z",
        completedAt: "2026-08-28T10:01:00.000Z",
        blockerReason: "submission_outcome_uncertain",
        blockerSummary: "Verify on the employer site.",
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

    const { getByText, queryByRole, queryByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        canRestageAutoRun
        canRestageQueueRun
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_uncertain"
        selectedApplicationRecordId="application_uncertain"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    expect(getByText("Manual verification required")).toBeTruthy();
    expect(
      getByText(/automatic retry and preparation stay unavailable/i),
    ).toBeTruthy();
    expect(queryByRole("button")).toBeNull();
    expect(queryByTestId("applications-recovery-actions")).toBeNull();
  });

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

    const { getByRole, getByText, queryByRole } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
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
      getByRole("button", { name: /i'm signed in — run preparation again/i }),
    );
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_workday",
      applicationRecordId: "application_workday",
    });
    expect(
      getByRole("button", { name: /run preparation again/i }),
    ).toBeTruthy();
    expect(
      queryByRole("button", { name: "Prepare this job automatically" }),
    ).toBeNull();
    expect(
      getByText(/staging an automatic preparation stays available only/i),
    ).toBeTruthy();
    expect(
      queryByRole("button", { name: "Prepare remaining jobs" }),
    ).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(
      /apply copilot|restage|rerun/i,
    );
  });

  it("keeps recovery actions start-aligned with natural widths and responsive secondary wrapping", () => {
    const onStartApplyCopilot = vi.fn();
    const onStartAutoApply = vi.fn();
    const onStartAutoApplyQueue = vi.fn();
    const { container, getByRole, getByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        canRestageAutoRun
        canRestageQueueRun
        dailyPreparationCapacity={null}
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

    const actions = getByTestId("applications-recovery-actions");
    expect(actions.className).toContain("min-w-0");
    expect(actions.className).toContain("flex-wrap");
    expect(actions.className).toContain("items-start");
    expect(actions.className).toContain("justify-start");
    expect(actions.className).not.toContain("grid");

    const primary = getByTestId("applications-recovery-primary-action");
    expect(primary.className).toContain("flex-wrap");
    // Stretch, not start: every control in the row shares one box metric so
    // the row cannot render at three heights and three tops.
    expect(primary.className).toContain("items-stretch");
    expect(primary.className).toContain("min-w-0");
    expect(primary.className).toContain("max-w-full");
    expect(primary.className).not.toContain("grid");

    const retry = getByRole("button", { name: "Run preparation again" });
    expect(retry.className).toContain("w-fit");
    expect(retry.className).toContain("min-w-0");
    expect(retry.className).toContain("max-w-full");
    expect(retry.className).toContain("min-h-11");
    expect(retry.className).toContain("whitespace-normal");
    expect(retry.className.split(/\s+/)).not.toContain("w-full");
    expect(retry.getAttribute("data-variant")).toBe("primary");

    const secondary = getByTestId("applications-recovery-secondary-actions");
    expect(secondary.className).toContain("flex-wrap");
    expect(secondary.className).toContain("items-start");
    expect(secondary.className).toContain("min-w-0");
    expect(secondary.className).toContain("max-w-full");
    const secondaryClassNames = secondary.className.split(/\s+/);
    expect(secondaryClassNames).not.toContain("rounded-(--radius-field)");
    expect(secondaryClassNames).not.toContain("border");
    expect(secondaryClassNames).not.toContain("bg-background/40");
    expect(secondaryClassNames).not.toContain("p-2");
    const secondaryActionList = getByTestId(
      "applications-recovery-secondary-action-list",
    );
    expect(secondaryActionList.className).toContain("flex-wrap");
    expect(secondaryActionList.className).toContain("justify-start");
    expect(secondaryActionList.className).toContain("max-w-full");
    expect(secondaryActionList.className).not.toContain("grid");
    expect(within(secondary).getAllByRole("button")).toHaveLength(2);

    const automatic = getByRole("button", {
      name: "Prepare this job automatically",
    });
    const remaining = getByRole("button", {
      name: "Prepare remaining jobs",
    });
    for (const button of [automatic, remaining]) {
      expect(button.className).toContain("w-fit");
      expect(button.className).toContain("min-w-0");
      expect(button.className).toContain("max-w-full");
      // One box metric across the whole row, primary included.
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("whitespace-normal");
      expect(button.className.split(/\s+/)).not.toContain("w-full");
    }

    const buttonLabels = Array.from(
      container.querySelectorAll(
        '[data-testid="applications-recovery-actions"] button',
      ),
    ).map((button) => button.textContent?.trim());
    expect(buttonLabels).toEqual([
      "Run preparation again",
      "Prepare this job automatically",
      "Prepare remaining jobs",
    ]);

    fireEvent.click(retry);
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_workday",
      applicationRecordId: "application_workday",
    });
    fireEvent.click(automatic);
    expect(onStartAutoApply).toHaveBeenCalledWith({
      jobId: "job_workday",
      applicationRecordId: "application_workday",
    });
    fireEvent.click(remaining);
    expect(onStartAutoApplyQueue).toHaveBeenCalledWith(["job_workday"]);
  });

  it("keeps a single optional recovery action natural-width and start-aligned", () => {
    const onStartAutoApply = vi.fn();

    const { getByRole, getByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        canRestageAutoRun
        canRestageQueueRun={false}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={onStartAutoApply}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_workday"
        selectedApplicationRecordId="application_workday"
        selectedRun={null}
        visibleApplyResult={null}
      />,
    );

    const secondary = getByTestId("applications-recovery-secondary-actions");
    expect(secondary.className).toContain("flex-wrap");
    expect(secondary.className).toContain("items-start");
    const secondaryClassNames = secondary.className.split(/\s+/);
    expect(secondaryClassNames).not.toContain("rounded-(--radius-field)");
    expect(secondaryClassNames).not.toContain("border");
    expect(secondaryClassNames).not.toContain("bg-background/40");
    expect(secondaryClassNames).not.toContain("p-2");
    const secondaryActionList = getByTestId(
      "applications-recovery-secondary-action-list",
    );
    expect(secondaryActionList.className).toContain("flex-wrap");
    expect(secondaryActionList.className).toContain("justify-start");
    expect(secondaryActionList.className).not.toContain("grid");

    const automatic = getByRole("button", {
      name: "Prepare this job automatically",
    });
    expect(automatic.className).toContain("w-fit");
    expect(automatic.className).toContain("max-w-full");
    expect(automatic.className.split(/\s+/)).not.toContain("w-full");
    fireEvent.click(automatic);
    expect(onStartAutoApply).toHaveBeenCalledWith({
      jobId: "job_workday",
      applicationRecordId: "application_workday",
    });
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
      getByText(
        /no verified writes to the employer page were recorded for this run/i,
      ),
    ).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(
      /fields? (?:were )?saved|fields? remain/i,
    );
    expect(queryByText(/POST|XHR|mutating page action/i)).toBeNull();
    fireEvent.click(
      getByRole("button", { name: /approve and reattach the resume/i }),
    );
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_greenhouse",
      applicationRecordId: "application_greenhouse",
    });
  });

  it("keeps long safe preparation visibly explained while controls are disabled", () => {
    const { getByRole, getByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
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

    // The boundary is stated once on this screen, by the guidance paragraph
    // that owns it; the preparing status no longer repeats it word for word.
    expect(getByRole("status").textContent).not.toMatch(
      /stop before the final submit control/i,
    );
    expect(getByText(/still stops before the final submit/i)).toBeTruthy();
    const pendingButton = getByRole("button", { name: /preparing safely/i });
    expect(getByText(/can take up to a minute/i)).toBeTruthy();
    // Pending keeps the control exposed but inert instead of natively
    // disabled, so focus survives the in-flight preparation.
    expect(pendingButton.hasAttribute("disabled")).toBe(false);
    expect(pendingButton.getAttribute("aria-disabled")).toBe("true");
    expect(pendingButton.getAttribute("aria-busy")).toBe("true");
  });

  it("makes Safeguards the primary action for a site-blocked pause without a preparing spinner", () => {
    const onOpenSafeguards = vi.fn();
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_sw_block",
        runId: "run_sw_block",
        jobId: "job_linkedin",
        applicationRecordId: "application_linkedin",
        queuePosition: 0,
        state: "blocked",
        summary: "A LinkedIn service worker blocked automated preparation.",
        detail: "The dedicated browser could not continue safely.",
        startedAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:01:00.000Z",
        completedAt: "2026-08-27T10:01:00.000Z",
        blockerReason: "site_protection",
        blockerSummary: "Service worker interference on this job site.",
        listingSignalEvidence: null,
        visualObservationSets: [],
        visualCheckpoints: [],
        latestQuestionCount: 2,
        latestAnswerCount: 0,
        pendingConsentRequestCount: 0,
        artifactCount: 0,
        latestCheckpointId: null,
        privacyReceipt: null,
      };

    const { getByRole, getByTestId, queryByRole, queryByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={true}
        onOpenSafeguards={onOpenSafeguards}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_linkedin"
        selectedApplicationRecordId="application_linkedin"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    // The instruction is owned by the Next step callout above this section;
    // it is not restated here (it used to arrive three times).
    expect(
      getByRole("heading", { name: /Finish this application/i }),
    ).toBeTruthy();
    // Page-layout commentary was removed: heading, one sentence in Next
    // step, and the action are enough.
    expect(queryByText(/Use the action below/i)).toBeNull();
    expect(
      queryByRole("button", { name: /Prepare this job automatically/i }),
    ).toBeNull();
    expect(
      queryByRole("button", { name: /Prepare remaining jobs/i }),
    ).toBeNull();
    expect(
      queryByRole("button", { name: /run preparation again/i }),
    ).toBeNull();
    expect(queryByText(/service worker that can interfere/i)).toBeNull();
    expect(queryByRole("button", { name: /preparing safely/i })).toBeNull();
    expect(queryByText(/can take up to a minute/i)).toBeNull();
    expect(queryByText(/Run outcome summary/i)).toBeNull();
    expect(queryByText(/Will be prepared/i)).toBeNull();
    const safeguardsPrimary = getByTestId("site-blocked-safeguards-primary");
    expect(safeguardsPrimary.className).toContain("w-fit");
    expect(safeguardsPrimary.className).toContain("min-w-0");
    expect(safeguardsPrimary.className).toContain("max-w-full");
    expect(safeguardsPrimary.className.split(/\s+/)).not.toContain("w-full");
    fireEvent.click(
      getByRole("button", {
        name: /Open Safeguards to reset the Job Finder browser/i,
      }),
    );
    expect(onOpenSafeguards).toHaveBeenCalledOnce();
  });

  it("makes finish-in-browser primary for conflicting prefilled fields and demotes retry", () => {
    const onStartApplyCopilot = vi.fn();
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_prefill_conflict",
        runId: "run_prefill_conflict",
        jobId: "job_partiful",
        applicationRecordId: "application_partiful",
        queuePosition: 0,
        state: "blocked",
        summary: "Prefilled application values need manual review",
        detail:
          "One or more known application fields already contain values that do not match the exact saved candidate profile. The runtime preserved those values, captured the conflicts for review, and stopped before advancing.",
        startedAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:01:00.000Z",
        completedAt: "2026-08-27T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary: "Prefilled application values need manual review",
        listingSignalEvidence: null,
        visualObservationSets: [],
        visualCheckpoints: [],
        latestQuestionCount: 2,
        latestAnswerCount: 0,
        pendingConsentRequestCount: 0,
        artifactCount: 0,
        latestCheckpointId: null,
        privacyReceipt: null,
      };

    const { getByRole, getByTestId, getByText, queryByRole, queryByText } =
      render(
        <ApplicationsDetailPanelRecoveryActionsSection
          canRestageAutoRun={false}
          canRestageQueueRun={false}
          dailyPreparationCapacity={null}
          excludedQueueRecoveryEntries={[]}
          isApplyPending={true}
          onStartApplyCopilot={onStartApplyCopilot}
          onStartAutoApply={vi.fn()}
          onStartAutoApplyQueue={vi.fn()}
          selectedQueueOutcomeEntries={[]}
          selectedQueueRecoveryEntries={[]}
          selectedQueueRecoveryJobIds={[]}
          selectedRecordJobId="job_partiful"
          selectedApplicationRecordId="application_partiful"
          selectedRun={null}
          visibleApplyResult={visibleApplyResult}
        />,
      );

    expect(getByText(/Finish this application/i)).toBeTruthy();
    // Page-layout commentary was removed: heading, one sentence in Next
    // step, and the action are enough.
    expect(queryByText(/Use the action below/i)).toBeNull();
    expect(
      queryByRole("button", { name: /Prepare this job automatically/i }),
    ).toBeNull();
    const finishPrimary = getByTestId("manual-field-finish-primary");
    expect(finishPrimary.textContent).toMatch(/Open the Job Finder browser/i);
    expect(finishPrimary.className).toContain("w-fit");
    expect(finishPrimary.className).toContain("min-w-0");
    expect(finishPrimary.className).toContain("max-w-full");
    expect(finishPrimary.className).toContain("min-h-11");
    expect(finishPrimary.className.split(/\s+/)).not.toContain("w-full");
    expect(queryByRole("button", { name: /preparing safely/i })).toBeNull();
    expect(queryByText(/can take up to a minute/i)).toBeNull();
    expect(
      queryByRole("button", { name: /^Run preparation again$/i }),
    ).toBeNull();

    const retryLater = getByRole("button", {
      name: /Run preparation again later/i,
    });
    expect(retryLater.className).toContain("w-fit");
    expect(retryLater.className).toContain("min-w-0");
    expect(retryLater.className).toContain("max-w-full");
    expect(retryLater.className.split(/\s+/)).not.toContain("w-full");
    expect(retryLater).toHaveProperty("disabled", false);
    fireEvent.click(retryLater);
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_partiful",
      applicationRecordId: "application_partiful",
    });
  });

  it("uses the same finish-first hierarchy for a prepare-only field save pause", () => {
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_field_save",
        runId: "run_field_save",
        jobId: "job_partiful",
        applicationRecordId: "application_partiful",
        queuePosition: 0,
        state: "blocked",
        summary: "The application page could not safely save a prepared field",
        detail:
          "The application site tried to save 'application field' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.",
        startedAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:01:00.000Z",
        completedAt: "2026-08-27T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary:
          "The application page could not safely save a prepared field",
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

    const { getByRole, getByTestId, queryByRole, queryByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
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
        selectedRecordJobId="job_partiful"
        selectedApplicationRecordId="application_partiful"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    expect(
      getByRole("heading", { name: /Finish this application/i }),
    ).toBeTruthy();
    expect(getByTestId("manual-field-finish-primary")).toBeTruthy();
    expect(
      getByRole("button", { name: /Run preparation again later/i }),
    ).toBeTruthy();
    expect(
      queryByRole("button", { name: /^Run preparation again$/i }),
    ).toBeNull();
    // Autosave pause: the reason is owned by the Next step callout above this
    // section, which is why this section no longer restates it. F71: the same
    // instruction used to be printed three times on one screen.
    expect(queryByText(/tried to save a field automatically/i)).toBeNull();
    expect(getByTestId("manual-field-finish-primary")).toHaveProperty(
      "disabled",
      true,
    );
    expect(getByTestId("manual-field-finish-unavailable-note")).toBeTruthy();
  });

  it("opens the Job Finder browser on the paused application from the finish action", () => {
    // The hand-off reports what it did; the status below repeats only that.
    const onFinishInBrowser = vi.fn(
      (): FinishInBrowserOutcome => ({ kind: "opened_application_page" }),
    );
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_field_save_open",
        runId: "run_field_save_open",
        jobId: "job_partiful",
        applicationRecordId: "application_partiful",
        queuePosition: 0,
        state: "awaiting_review",
        summary: "The application page could not safely save a prepared field",
        detail:
          "The application site tried to save 'application field' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.",
        startedAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:01:00.000Z",
        completedAt: "2026-08-27T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary:
          "The application page could not safely save a prepared field",
        listingSignalEvidence: null,
        visualObservationSets: [],
        visualCheckpoints: [],
        latestQuestionCount: 0,
        latestAnswerCount: 0,
        pendingConsentRequestCount: 0,
        artifactCount: 0,
        latestCheckpointId: null,
        privacyReceipt: {
          schemaVersion: 1,
          generatedAt: "2026-08-27T10:01:00.000Z",
          lineage: {
            applicationRecordId: "application_partiful",
            runId: "run_field_save_open",
            jobId: "job_partiful",
            resultId: "result_field_save_open",
          },
          destination: {
            origin: "https://jobs.example.com",
            safePath: "/apply/123",
          },
          resume: {
            source: "tailored_export",
            sourceDocumentId: null,
            fileName: "resume.pdf",
            sha256: "a".repeat(64),
            format: "pdf",
          },
          stayedLocal: [],
          modelUse: [],
          externalWrites: [],
          accountCreationAuthorized: false,
          finalSubmitAuthorized: false,
          finalSubmitOccurred: false,
        } as unknown as NonNullable<
          JobFinderWorkspaceSnapshot["applyJobResults"][number]["privacyReceipt"]
        >,
      };

    const { getByRole, getByTestId, queryByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onFinishInBrowser={onFinishInBrowser}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_partiful"
        selectedApplicationRecordId="application_partiful"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    const finishPrimary = getByRole("button", {
      name: /Open the Job Finder browser/i,
    });
    expect(finishPrimary).toBe(getByTestId("manual-field-finish-primary"));
    expect(finishPrimary).toHaveProperty("disabled", false);
    expect(queryByTestId("manual-field-finish-unavailable-note")).toBeNull();
    expect(queryByTestId("manual-field-finish-status")).toBeNull();

    fireEvent.click(finishPrimary);

    expect(onFinishInBrowser).toHaveBeenCalledExactlyOnceWith({
      jobId: "job_partiful",
      resultId: "result_field_save_open",
      runId: "run_field_save_open",
      applicationRecordId: "application_partiful",
      destinationUrl: "https://jobs.example.com/apply/123",
    });
    const status = getByTestId("manual-field-finish-status");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toMatch(
      /Opened in the Job Finder browser\. Finish the step there/i,
    );
    // Retry stays the secondary action and never fires from the finish click.
    expect(
      getByRole("button", { name: /Run preparation again later/i }),
    ).toHaveProperty("disabled", false);
  });

  describe("browser hand-off outcome truthfulness", () => {
    // One paused, field-conflict result: the exact state whose primary action
    // is the browser hand-off.
    function createManualFieldFinishResult(): JobFinderWorkspaceSnapshot["applyJobResults"][number] {
      return {
        id: "result_handoff_outcome",
        runId: "run_handoff_outcome",
        jobId: "job_partiful",
        applicationRecordId: "application_partiful",
        queuePosition: 0,
        state: "awaiting_review",
        summary: "The application page could not safely save a prepared field",
        detail:
          "The application site tried to save 'application field' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.",
        startedAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:01:00.000Z",
        completedAt: "2026-08-27T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary:
          "The application page could not safely save a prepared field",
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
    }

    function renderWithOutcome(outcome: FinishInBrowserOutcome) {
      return render(
        <ApplicationsDetailPanelRecoveryActionsSection
          canConfirmFinishedInBrowser
          canRestageAutoRun={false}
          canRestageQueueRun={false}
          dailyPreparationCapacity={null}
          excludedQueueRecoveryEntries={[]}
          isApplyPending={false}
          onConfirmFinishedInBrowser={vi.fn()}
          onFinishInBrowser={vi.fn((): FinishInBrowserOutcome => outcome)}
          onStartApplyCopilot={vi.fn()}
          onStartAutoApply={vi.fn()}
          onStartAutoApplyQueue={vi.fn()}
          selectedQueueOutcomeEntries={[]}
          selectedQueueRecoveryEntries={[]}
          selectedQueueRecoveryJobIds={[]}
          selectedRecordJobId="job_partiful"
          selectedApplicationRecordId="application_partiful"
          selectedRun={null}
          visibleApplyResult={createManualFieldFinishResult()}
        />,
      );
    }

    it("says the exact application page opened only when it did", () => {
      const { getByRole, getByTestId } = renderWithOutcome({
        kind: "opened_application_page",
      });

      fireEvent.click(getByTestId("manual-field-finish-primary"));

      const status = getByTestId("manual-field-finish-status");
      expect(status.getAttribute("data-handoff-outcome")).toBe(
        "opened_application_page",
      );
      expect(status.textContent).toMatch(
        /Opened in the Job Finder browser\. Finish the step there/i,
      );
      // The page is open, so the open action demotes and confirming is the
      // primary path back in.
      expect(
        getByRole("button", { name: /Reopen the Job Finder browser/i }),
      ).toBe(getByTestId("manual-field-finish-primary"));
      expect(
        getByRole("button", { name: "Check whether this step is done" }),
      ).toHaveProperty("disabled", false);
    });

    it("says only the window opened when the application page was not reopened", () => {
      // The fall-back opens a bare browser session, not the paused page, and
      // used to claim "Opened in the Job Finder browser. Switch to that window
      // to finish the step" all the same.
      const { getByRole, getByTestId } = renderWithOutcome({
        kind: "opened_browser_only",
      });

      fireEvent.click(getByTestId("manual-field-finish-primary"));

      const status = getByTestId("manual-field-finish-status");
      expect(status.getAttribute("data-handoff-outcome")).toBe(
        "opened_browser_only",
      );
      expect(status.textContent).toContain(
        "this application page was not reopened",
      );
      expect(status.textContent).not.toMatch(
        /Opened in the Job Finder browser\. Finish the step there/i,
      );
      // The page still needs opening, so the open action must not demote to
      // "Reopen"; the way back into the loop stays available.
      expect(getByTestId("manual-field-finish-primary").textContent).toContain(
        "Open the Job Finder browser",
      );
      expect(
        getByRole("button", { name: "Check whether this step is done" }),
      ).toHaveProperty("disabled", false);
    });

    it("reports a failed hand-off with its reason instead of claiming success", () => {
      const { getByTestId } = renderWithOutcome({
        kind: "failed",
        reason: "The browser runtime is disabled",
      });

      fireEvent.click(getByTestId("manual-field-finish-primary"));

      const status = getByTestId("manual-field-finish-status");
      expect(status.getAttribute("data-handoff-outcome")).toBe("failed");
      expect(status.textContent).toContain("did not open");
      expect(status.textContent).toContain("The browser runtime is disabled.");
      expect(status.textContent).toContain("nothing was sent to the employer");
      expect(status.textContent).not.toMatch(
        /Opened in the Job Finder browser/i,
      );
      expect(getByTestId("manual-field-finish-primary").textContent).toContain(
        "Open the Job Finder browser",
      );
    });

    /**
     * One hand-off whose promise the test settles by hand, so "before it
     * settled" and "after it settled" are separately observable.
     */
    function createDeferredHandoff() {
      let settle: (outcome: FinishInBrowserOutcome) => void = () => undefined;
      const promise = new Promise<FinishInBrowserOutcome>((resolve) => {
        settle = resolve;
      });

      return {
        promise,
        settle: (outcome: FinishInBrowserOutcome) => {
          settle(outcome);
        },
      };
    }

    function renderWithHandler(onFinishInBrowser: FinishInBrowserHandler) {
      return render(
        <ApplicationsDetailPanelRecoveryActionsSection
          canConfirmFinishedInBrowser
          canRestageAutoRun={false}
          canRestageQueueRun={false}
          dailyPreparationCapacity={null}
          excludedQueueRecoveryEntries={[]}
          isApplyPending={false}
          onConfirmFinishedInBrowser={vi.fn()}
          onFinishInBrowser={onFinishInBrowser}
          onStartApplyCopilot={vi.fn()}
          onStartAutoApply={vi.fn()}
          onStartAutoApplyQueue={vi.fn()}
          selectedQueueOutcomeEntries={[]}
          selectedQueueRecoveryEntries={[]}
          selectedQueueRecoveryJobIds={[]}
          selectedRecordJobId="job_partiful"
          selectedApplicationRecordId="application_partiful"
          selectedRun={null}
          visibleApplyResult={createManualFieldFinishResult()}
        />,
      );
    }

    // The production hand-off is an IPC round trip. These three cases are the
    // ones a synchronous reading of it got wrong: it wrote a status before the
    // call had settled, so a failing IPC still rendered "Opened in the Job
    // Finder browser" while a route banner carried the error.
    it("says nothing until the asynchronous hand-off has settled", async () => {
      const handoff = createDeferredHandoff();
      const { getByTestId, queryByTestId } = renderWithHandler(
        () => handoff.promise,
      );

      fireEvent.click(getByTestId("manual-field-finish-primary"));

      expect(queryByTestId("manual-field-finish-status")).toBeNull();
      expect(getByTestId("manual-field-finish-primary").textContent).toContain(
        "Open the Job Finder browser",
      );

      handoff.settle({ kind: "opened_application_page" });

      await waitFor(() => {
        expect(
          getByTestId("manual-field-finish-status").getAttribute(
            "data-handoff-outcome",
          ),
        ).toBe("opened_application_page");
      });
    });

    it("renders the failed status when the asynchronous hand-off reports a failure", async () => {
      const { getByTestId } = renderWithHandler(() =>
        Promise.resolve<FinishInBrowserOutcome>({
          kind: "failed",
          reason: "The browser runtime is disabled",
        }),
      );

      fireEvent.click(getByTestId("manual-field-finish-primary"));

      await waitFor(() => {
        expect(
          getByTestId("manual-field-finish-status").getAttribute(
            "data-handoff-outcome",
          ),
        ).toBe("failed");
      });

      const status = getByTestId("manual-field-finish-status");
      expect(status.textContent).toBe(
        "The Job Finder browser did not open, so nothing was opened for this " +
          "application and nothing was sent to the employer. The browser runtime " +
          "is disabled. Try again, or open this step from Needs you.",
      );
      expect(status.textContent).not.toMatch(
        /Opened in the Job Finder browser/i,
      );
      // Nothing reached the employer, so the wording must not read as a
      // half-finished submission and the way back in stays open.
      expect(getByTestId("manual-field-finish-primary").textContent).toContain(
        "Open the Job Finder browser",
      );
    });

    it("renders the failed status when the asynchronous hand-off rejects", async () => {
      const { getByTestId } = renderWithHandler(() =>
        Promise.reject(new Error("The browser runtime is disabled")),
      );

      fireEvent.click(getByTestId("manual-field-finish-primary"));

      await waitFor(() => {
        expect(
          getByTestId("manual-field-finish-status").getAttribute(
            "data-handoff-outcome",
          ),
        ).toBe("failed");
      });

      expect(getByTestId("manual-field-finish-status").textContent).toContain(
        "The browser runtime is disabled.",
      );
    });

    it("says only the window opened when the asynchronous hand-off reopened no page", async () => {
      const { getByTestId } = renderWithHandler(() =>
        Promise.resolve<FinishInBrowserOutcome>({
          kind: "opened_browser_only",
        }),
      );

      fireEvent.click(getByTestId("manual-field-finish-primary"));

      await waitFor(() => {
        expect(
          getByTestId("manual-field-finish-status").getAttribute(
            "data-handoff-outcome",
          ),
        ).toBe("opened_browser_only");
      });

      expect(getByTestId("manual-field-finish-status").textContent).toContain(
        "this application page was not reopened",
      );
    });

    it("drops a previous attempt's status while the next hand-off is running", async () => {
      // A stale "Opened" line standing beside a running retry is the same false
      // claim in a different place.
      const outcomes: FinishInBrowserOutcome[] = [
        { kind: "opened_application_page" },
      ];
      const second = createDeferredHandoff();
      const { getByTestId, queryByTestId } = renderWithHandler(() => {
        const next = outcomes.shift();

        return next ? Promise.resolve(next) : second.promise;
      });

      fireEvent.click(getByTestId("manual-field-finish-primary"));
      await waitFor(() => {
        expect(getByTestId("manual-field-finish-status")).toBeTruthy();
      });

      fireEvent.click(getByTestId("manual-field-finish-primary"));
      expect(queryByTestId("manual-field-finish-status")).toBeNull();

      second.settle({ kind: "failed", reason: null });
      await waitFor(() => {
        expect(
          getByTestId("manual-field-finish-status").getAttribute(
            "data-handoff-outcome",
          ),
        ).toBe("failed");
      });
    });

    it("claims nothing when the hand-off reports no outcome", () => {
      const { getByTestId, queryByTestId } = render(
        <ApplicationsDetailPanelRecoveryActionsSection
          canRestageAutoRun={false}
          canRestageQueueRun={false}
          dailyPreparationCapacity={null}
          excludedQueueRecoveryEntries={[]}
          isApplyPending={false}
          onFinishInBrowser={vi.fn()}
          onStartApplyCopilot={vi.fn()}
          onStartAutoApply={vi.fn()}
          onStartAutoApplyQueue={vi.fn()}
          selectedQueueOutcomeEntries={[]}
          selectedQueueRecoveryEntries={[]}
          selectedQueueRecoveryJobIds={[]}
          selectedRecordJobId="job_partiful"
          selectedApplicationRecordId="application_partiful"
          selectedRun={null}
          visibleApplyResult={createManualFieldFinishResult()}
        />,
      );

      fireEvent.click(getByTestId("manual-field-finish-primary"));

      expect(queryByTestId("manual-field-finish-status")).toBeNull();
    });
  });

  it("closes the browser hand-off loop on the page that opened it", () => {
    const onConfirmFinishedInBrowser = vi.fn();
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_field_save_confirm",
        runId: "run_field_save_confirm",
        jobId: "job_partiful",
        applicationRecordId: "application_partiful",
        queuePosition: 0,
        state: "blocked",
        summary:
          "The application site tried to save 'application field' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.",
        detail: "Job Finder stopped before that save.",
        startedAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:01:00.000Z",
        completedAt: "2026-08-27T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary:
          "The application page could not safely save a prepared field",
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

    const { getByRole, getByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        canConfirmFinishedInBrowser
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onConfirmFinishedInBrowser={onConfirmFinishedInBrowser}
        onFinishInBrowser={vi.fn()}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_partiful"
        selectedApplicationRecordId="application_partiful"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    // The screen that sends the user to the browser takes them back in; the
    // return leg used to exist only on Needs you.
    const confirm = getByRole("button", {
      name: "Check whether this step is done",
    });
    expect(confirm).toBe(getByTestId("confirm-finished-in-browser"));

    fireEvent.click(confirm);

    expect(onConfirmFinishedInBrowser).toHaveBeenCalledExactlyOnceWith({
      jobId: "job_partiful",
      resultId: "result_field_save_confirm",
      runId: "run_field_save_confirm",
      applicationRecordId: "application_partiful",
      destinationUrl: null,
    });
  });

  it("resolves the finished-step check in place from pending to still blocked", () => {
    // The live walkthrough clicked "I finished this step", got a
    // "Verification started…" banner, and then watched the card sit unchanged
    // for six seconds with no progress and no result.
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_field_save_status",
        runId: "run_field_save_status",
        jobId: "job_partiful",
        applicationRecordId: "application_partiful",
        queuePosition: 0,
        state: "blocked",
        summary:
          "The application site tried to save 'application field' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.",
        detail: "Job Finder stopped before that save.",
        startedAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:01:00.000Z",
        completedAt: "2026-08-27T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary:
          "The application page could not safely save a prepared field",
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
    const onConfirmFinishedInBrowser = vi.fn();
    const renderSection = (
      status: "idle" | "checking" | "still_blocked",
      blockerText: string | null,
    ) => (
      <ApplicationsDetailPanelRecoveryActionsSection
        canConfirmFinishedInBrowser
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        confirmFinishedInBrowserBlockerText={blockerText}
        confirmFinishedInBrowserStatus={status}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onConfirmFinishedInBrowser={onConfirmFinishedInBrowser}
        onFinishInBrowser={vi.fn()}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_partiful"
        selectedApplicationRecordId="application_partiful"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />
    );

    const { getByRole, getByTestId, queryByTestId, rerender } = render(
      renderSection("idle", null),
    );

    // Idle: the offer, and no status noise.
    expect(
      getByRole("button", { name: "Check whether this step is done" }),
    ).toBeTruthy();
    expect(queryByTestId("confirm-finished-in-browser-status")).toBeNull();

    // Pending: the button says the check is running, is disabled, and an
    // in-place row with a spinner explains what is happening.
    rerender(renderSection("checking", null));
    const pendingButton = getByTestId(
      "confirm-finished-in-browser",
    ) as HTMLButtonElement;
    // Pending controls stay focusable and expose aria-busy/aria-disabled
    // instead of native `disabled`, so focus survives the transition.
    expect(pendingButton.getAttribute("aria-disabled")).toBe("true");
    expect(pendingButton.getAttribute("aria-busy")).toBe("true");
    expect(pendingButton.textContent).toContain("Checking");
    const pendingStatus = getByTestId("confirm-finished-in-browser-status");
    expect(pendingStatus.getAttribute("role")).toBe("status");
    expect(pendingStatus.textContent).toContain(
      "Checking the application page in the Job Finder browser…",
    );
    expect(getByTestId("confirm-finished-in-browser-spinner")).toBeTruthy();
    expect(pendingButton.getAttribute("aria-describedby")).toBe(
      pendingStatus.id,
    );
    fireEvent.click(pendingButton);
    expect(onConfirmFinishedInBrowser).not.toHaveBeenCalled();

    // Resolved as still blocked: the outcome, its reason, and the same action
    // offered again.
    rerender(
      renderSection(
        "still_blocked",
        "The application page still shows the field you need to complete.",
      ),
    );
    const resolvedStatus = getByTestId("confirm-finished-in-browser-status");
    expect(resolvedStatus.textContent).toContain("Not done yet —");
    expect(resolvedStatus.textContent).toContain(
      "The application page still shows the field you need to complete.",
    );
    expect(queryByTestId("confirm-finished-in-browser-spinner")).toBeNull();
    const retryButton = getByTestId(
      "confirm-finished-in-browser",
    ) as HTMLButtonElement;
    expect(retryButton.getAttribute("aria-disabled")).toBeNull();
    // One name, always: a failed check is reported beside the control, not
    // by renaming it into a third label.
    expect(retryButton.textContent).toContain(
      "Check whether this step is done",
    );
    expect(retryButton.textContent).not.toContain("Check again");
    fireEvent.click(retryButton);
    expect(onConfirmFinishedInBrowser).toHaveBeenCalledExactlyOnceWith({
      jobId: "job_partiful",
      resultId: "result_field_save_status",
      runId: "run_field_save_status",
      applicationRecordId: "application_partiful",
      destinationUrl: null,
    });
  });

  it("states a plain still-blocked reason when the request carries none", () => {
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_field_save_no_reason",
        runId: "run_field_save_no_reason",
        jobId: "job_partiful",
        applicationRecordId: "application_partiful",
        queuePosition: 0,
        state: "blocked",
        summary:
          "The application site tried to save 'application field' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.",
        detail: "Job Finder stopped before that save.",
        startedAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:01:00.000Z",
        completedAt: "2026-08-27T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary:
          "The application page could not safely save a prepared field",
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

    const { getByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        canConfirmFinishedInBrowser
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        confirmFinishedInBrowserBlockerText="   "
        confirmFinishedInBrowserStatus="still_blocked"
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onConfirmFinishedInBrowser={vi.fn()}
        onFinishInBrowser={vi.fn()}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_partiful"
        selectedApplicationRecordId="application_partiful"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    const status = getByTestId("confirm-finished-in-browser-status");
    expect(status.textContent).toContain(
      "Not done yet — the application page still shows the step you need to finish.",
    );
    expect(status.textContent).toContain("the Job Finder browser");
    expect(status.textContent).toContain("Check whether this step is done");
  });

  it("offers no confirmation when no pending browser step exists", () => {
    const visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] =
      {
        id: "result_field_save_no_request",
        runId: "run_field_save_no_request",
        jobId: "job_partiful",
        applicationRecordId: "application_partiful",
        queuePosition: 0,
        state: "blocked",
        summary:
          "The application site tried to save 'application field' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.",
        detail: "Job Finder stopped before that save.",
        startedAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:01:00.000Z",
        completedAt: "2026-08-27T10:01:00.000Z",
        blockerReason: "required_human_input",
        blockerSummary:
          "The application page could not safely save a prepared field",
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

    const { queryByRole } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        canConfirmFinishedInBrowser={false}
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        dailyPreparationCapacity={null}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onConfirmFinishedInBrowser={vi.fn()}
        onFinishInBrowser={vi.fn()}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_partiful"
        selectedApplicationRecordId="application_partiful"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    );

    expect(
      queryByRole("button", { name: "Check whether this step is done" }),
    ).toBeNull();
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
        /That creates a fresh run and uses one of today's remaining application slots\./i,
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
    fireEvent.click(getByRole("button", { name: /run preparation again/i }));
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
      /run preparation again/i,
      /prepare this job automatically/i,
      /prepare remaining jobs/i,
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
    const retryButton = getByRole("button", { name: /run preparation again/i });
    expect(retryButton).toHaveProperty("disabled", false);
    fireEvent.click(retryButton);
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_workday",
      applicationRecordId: "application_workday",
    });
  });

  it("disables Prepare remaining jobs with a trim-to-N reason when the selection exceeds today's remaining slots", () => {
    const onStartApplyCopilot = vi.fn();
    const onStartAutoApplyQueue = vi.fn();

    const { getByRole, getByTestId, queryByTestId } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
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

    const queueButton = getByRole("button", { name: "Prepare remaining jobs" });
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
    const retryButton = getByRole("button", { name: /run preparation again/i });
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

    // Prepare remaining jobs as the fresh-run path forward.
    const explanation = getByText(
      /one of your safety limits was reached\. It will not carry on by itself/i,
    );
    expect(explanation.textContent).toContain(
      "Use Prepare remaining jobs to finish the ones it did not get to",
    );
    expect(explanation.textContent).not.toMatch(/Needs you/i);

    // Finishing stays possible through a fresh recovery run.
    const queueButton = getByRole("button", { name: "Prepare remaining jobs" });
    expect(queueButton).toHaveProperty("disabled", false);
    fireEvent.click(queueButton);
    expect(onStartAutoApplyQueue).toHaveBeenCalledWith(["job_b", "job_c"]);
  });
});
