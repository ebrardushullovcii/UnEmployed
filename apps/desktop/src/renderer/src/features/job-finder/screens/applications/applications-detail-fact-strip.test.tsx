// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type {
  ApplicationAttempt,
  ApplicationRecord,
  ApplyJobResultSummary,
  ApplyRunSummary,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsDetailFactStrip } from "./applications-detail-fact-strip";
import { ApplicationsDetailPanel } from "./applications-detail-panel";
import { ApplicationsDetailPanelOverviewSections } from "./applications-detail-panel-overview-sections";
import { ApplicationsDetailPanelAttemptSection } from "./applications-detail-panel-attempt-section";
import { ApplicationsDetailPanelRunHistorySection } from "./applications-detail-panel-run-history-section";

afterEach(cleanup);

const baseRecord: ApplicationRecord = {
  id: "application_1",
  jobId: "job_1",
  title: "Senior Product Designer",
  company: "Signal Systems",
  status: "ready_for_review",
  lastActionLabel: "Resume approved",
  nextActionLabel:
    "Review the prepared application and submit manually when ready",
  lastUpdatedAt: "2026-08-09T08:00:00.000Z",
  lastAttemptState: "paused",
  questionSummary: {
    total: 6,
    required: 4,
    answered: 2,
    unansweredRequired: 1,
  },
  latestBlocker: {
    code: "requires_manual_review",
    summary: "Needed manual follow-up",
  },
  consentSummary: { status: "requested", pendingCount: 2 },
  replaySummary: {
    sourceInstructionArtifactId: null,
    lastUrl: "https://jobs.example.com/apply",
    checkpointCount: 3,
    evidenceCount: 2,
  },
  events: [],
  crm: null,
};

const baseApplyResult: ApplyJobResultSummary = {
  id: "apply_result_1",
  runId: "run_abcdefgh",
  jobId: "job_1",
  applicationRecordId: baseRecord.id,
  queuePosition: 0,
  state: "submitted",
  summary: "Prepared and submitted the application form.",
  detail: "Application detail",
  startedAt: "2026-08-09T07:00:00.000Z",
  updatedAt: "2026-08-09T08:00:00.000Z",
  completedAt: "2026-08-09T08:00:00.000Z",
  blockerReason: null,
  blockerSummary: null,
  listingSignalEvidence: null,
  visualObservationSets: [],
  visualCheckpoints: [],
  latestQuestionCount: 3,
  latestAnswerCount: 2,
  pendingConsentRequestCount: 0,
  artifactCount: 4,
  latestCheckpointId: null,
  privacyReceipt: null,
};

function renderStrip(
  overrides: Partial<{
    selectedAttempt: ApplicationAttempt | null;
    record: ApplicationRecord;
    visibleApplyResult: ApplyJobResultSummary | null;
    visibleApplyRunId: string | null;
  }> = {},
) {
  const props = {
    selectedAttempt: overrides.selectedAttempt ?? null,
    selectedRecord: overrides.record ?? baseRecord,
    visibleApplyResult:
      overrides.visibleApplyResult === undefined
        ? baseApplyResult
        : overrides.visibleApplyResult,
    visibleApplyRunId: overrides.visibleApplyRunId ?? null,
  };

  const { container } = render(<ApplicationsDetailFactStrip {...props} />);

  return { container };
}

describe("ApplicationsDetailFactStrip", () => {
  it("renders one semantic dl whose labels cover each lifecycle fact exactly once", () => {
    const { container } = renderStrip();
    const dl = container.querySelector("dl");
    expect(dl).toBeTruthy();

    const termLabels = within(dl as HTMLElement)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(termLabels).toEqual([
      "Last updated",
      "Latest activity",
      "Preparation",
      "Questions",
      "Blocker",
      "Consent",
      "Replay memory",
      "Preparation run",
    ]);

    expect(
      within(dl as HTMLElement).getAllByText("Needs follow-up"),
    ).toHaveLength(1);
    expect(
      within(dl as HTMLElement).getAllByText(/^Preparation abcdefgh • /),
    ).toHaveLength(1);
    expect(dl?.textContent).toContain("2 answered • 1 required left");
  });

  it("uses a pane-width container contract of two columns with three only where fitting", () => {
    const { container } = renderStrip();
    const dl = container.querySelector("dl");

    expect(dl?.className).toContain("grid-cols-2");
    expect(dl?.className).toContain("@[32rem]/detail:grid-cols-3");
    expect(dl?.className).toContain("gap-y-2");
    expect(container.firstElementChild?.getAttribute("aria-label")).toBe(
      "Application facts",
    );
  });

  it("keeps every fact to a deterministic single-line cell so the region stays under the height budget", () => {
    const { container } = renderStrip();
    const dl = container.querySelector("dl");

    const valueCells = Array.from((dl as HTMLElement).querySelectorAll("dd"));
    for (const valueCell of valueCells) {
      expect(valueCell.className).toContain("truncate");
    }

    const noteLines = Array.from((dl as HTMLElement).querySelectorAll("p"));
    expect(noteLines.length).toBeGreaterThan(0);
    for (const noteLine of noteLines) {
      expect(noteLine.className).toContain("truncate");
      expect(noteLine.getAttribute("title")).toBeTruthy();
    }
  });

  it("collapses empty facts to muted lines instead of bordered cards", () => {
    const emptyRecord: ApplicationRecord = {
      ...baseRecord,
      lastActionLabel: "",
      lastAttemptState: null,
      latestBlocker: null,
      consentSummary: { status: "none", pendingCount: 0 },
      replaySummary: {
        sourceInstructionArtifactId: null,
        lastUrl: null,
        checkpointCount: 0,
        evidenceCount: 0,
      },
    };
    const { container } = renderStrip({
      record: emptyRecord,
      visibleApplyResult: null,
    });
    const dl = container.querySelector("dl");

    const mutedValues = Array.from((dl as HTMLElement).querySelectorAll("dd"))
      .filter((value) => value.className.includes("text-foreground-muted"))
      .map((value) => value.textContent);

    expect(mutedValues).toEqual([
      "No recent activity",
      "No preparation yet",
      "No blocker",
      "None",
      "No checkpoints",
    ]);
    expect(container.querySelectorAll('[data-slot="badge"]')).toHaveLength(0);
  });

  it("never repeats company, stage, or the full run id inside the fact region", () => {
    const { container } = renderStrip();

    expect(screen.queryByText("Signal Systems")).toBeNull();
    expect(screen.queryByText("Needs action")).toBeNull();

    const runCell = container.querySelector('dd[title="run_abcdefgh"]');
    expect(runCell?.textContent).toContain("Submitted");
    expect(container.textContent).not.toContain("run_");
  });

  it("projects an interrupted preparation as failed instead of in progress or filling", () => {
    const failedRecord: ApplicationRecord = {
      ...baseRecord,
      lastActionLabel: "Preparation stopped when the app closed.",
      nextActionLabel: "Retry preparation when you are ready.",
      lastAttemptState: "failed",
    };
    const failedResult: ApplyJobResultSummary = {
      ...baseApplyResult,
      state: "failed",
      summary: "Application preparation stopped when the app closed.",
      completedAt: "2026-08-09T09:00:00.000Z",
    };

    const { container } = renderStrip({
      record: failedRecord,
      visibleApplyResult: failedResult,
    });
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/In progress/);
    expect(text).not.toMatch(/Filling/);
    expect(screen.getByText("Attempt failed")).not.toBeNull();
    const runCell = container.querySelector('dd[title="run_abcdefgh"]');
    expect(runCell?.textContent).toContain("Failed");
  });
});

describe("ApplicationsDetailPanelOverviewSections dedupe", () => {
  it("owns title and next step once and leaves company, stage, and state to other regions", () => {
    const attempt: ApplicationAttempt = {
      id: "attempt_1",
      jobId: "job_1",
      applicationRecordId: baseRecord.id,
      state: "paused",
      summary: "Paused before final review.",
      detail: "Application detail",
      startedAt: "2026-08-09T07:00:00.000Z",
      updatedAt: "2026-08-09T08:00:00.000Z",
      completedAt: null,
      outcome: null,
      checkpoints: [],
      questions: [],
      blocker: null,
      listingSignalEvidence: null,
      consentDecisions: [],
      replay: {
        sourceDebugEvidenceRefIds: [],
        sourceInstructionArtifactId: null,
        lastUrl: null,
        checkpointUrls: [],
      },
      visualEvidence: [],
      visualObservationSets: [],
      visualCheckpoints: [],
      nextActionLabel:
        "Review the prepared application and submit manually when ready",
      executionTimings: [],
    };

    render(
      <ApplicationsDetailPanelOverviewSections
        selectedAttempt={attempt}
        selectedRecord={baseRecord}
        visibleApplyResult={null}
        visibleApplyRunId={null}
      />,
    );

    expect(screen.getAllByText("Senior Product Designer")).toHaveLength(1);
    expect(screen.queryByText("Signal Systems")).toBeNull();
    expect(screen.queryByText("Needs action")).toBeNull();
    expect(
      screen.getAllByText("Submit the prepared application manually"),
    ).toHaveLength(1);
    expect(
      screen.getAllByText(
        "Saved follow-up: Review the prepared application and submit manually when ready",
      ),
    ).toHaveLength(1);
    expect(screen.getAllByText("Needs follow-up")).toHaveLength(1);

    for (const removedCardHeading of [
      "Stage",
      "Saved next step",
      "Latest apply attempt",
      "Detected questions",
    ]) {
      expect(screen.queryByText(removedCardHeading)).toBeNull();
    }
  });
});

describe("ApplicationsDetailPanelAttemptSection dedupe", () => {
  it("keeps summary and detail but no longer repeats the attempt state or next step", () => {
    const attempt: ApplicationAttempt = {
      id: "attempt_1",
      jobId: "job_1",
      applicationRecordId: baseRecord.id,
      state: "paused",
      summary: "Paused before final review.",
      detail: "The form is saved for review.",
      startedAt: "2026-08-09T07:00:00.000Z",
      updatedAt: "2026-08-09T08:00:00.000Z",
      completedAt: null,
      outcome: null,
      checkpoints: [],
      questions: [],
      blocker: null,
      listingSignalEvidence: null,
      consentDecisions: [],
      replay: {
        sourceDebugEvidenceRefIds: [],
        sourceInstructionArtifactId: null,
        lastUrl: null,
        checkpointUrls: [],
      },
      visualEvidence: [],
      visualObservationSets: [],
      visualCheckpoints: [],
      nextActionLabel: "Review the conflicting fields manually",
      executionTimings: [],
    };

    const { container } = render(
      <ApplicationsDetailPanelAttemptSection selectedAttempt={attempt} />,
    );

    expect(screen.getByText("Preparation details")).toBeTruthy();
    expect(screen.getByText("Paused before final review.")).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="badge"]')).toHaveLength(0);
    expect(screen.queryByText(/Next step:/)).toBeNull();
    expect(screen.queryByText("Needs follow-up")).toBeNull();
  });
});

describe("ApplicationsDetailPanelRunHistorySection", () => {
  const runs: ApplyRunSummary[] = [
    {
      id: "run_latest01",
      campaignId: null,
      mode: "copilot",
      state: "completed",
      jobIds: ["job_1"],
      currentJobId: null,
      submitApprovalId: null,
      visualCheckpointsEnabled: false,
      createdAt: "2026-08-09T07:00:00.000Z",
      updatedAt: "2026-08-09T08:00:00.000Z",
      completedAt: "2026-08-09T08:00:00.000Z",
      summary: "Latest run",
      detail: "Finished.",
      totalJobs: 1,
      pendingJobs: 0,
      submittedJobs: 1,
      skippedJobs: 0,
      blockedJobs: 0,
      failedJobs: 0,
    },
    {
      id: "run_older0202",
      campaignId: null,
      mode: "queue_auto",
      state: "cancelled",
      jobIds: ["job_1"],
      currentJobId: null,
      submitApprovalId: null,
      visualCheckpointsEnabled: false,
      createdAt: "2026-08-08T07:00:00.000Z",
      updatedAt: "2026-08-08T08:00:00.000Z",
      completedAt: "2026-08-08T08:00:00.000Z",
      summary: "Older run",
      detail: "Cancelled.",
      totalJobs: 1,
      pendingJobs: 0,
      submittedJobs: 0,
      skippedJobs: 0,
      blockedJobs: 0,
      failedJobs: 0,
    },
  ];

  function buildHistory() {
    return runs.map((run) => ({
      result: {
        ...baseApplyResult,
        id: `result_${run.id}`,
        runId: run.id,
        state: run.id === "run_latest01" ? "submitted" : "blocked",
        blockerSummary: run.id === "run_latest01" ? null : "Needed input",
      } satisfies ApplyJobResultSummary,
      run,
    }));
  }

  it("syncs selection through aria-pressed without repeating run ids in the header", () => {
    const onSelectApplyRun = vi.fn();
    render(
      <ApplicationsDetailPanelRunHistorySection
        applyRunHistory={buildHistory()}
        onSelectApplyRun={onSelectApplyRun}
        selectedApplyRunId="run_latest01"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Preparation history" }),
    ).toBeTruthy();
    expect(screen.getByTitle("run_latest01").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      screen.getByTitle("run_older0202").getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByRole("heading").textContent).not.toContain("run_");

    fireEvent.click(screen.getByTitle("run_older0202"));
    expect(onSelectApplyRun).toHaveBeenCalledWith("run_older0202");
  });

  it("compacts each row to a meta line so rows stay under the height budget", () => {
    render(
      <ApplicationsDetailPanelRunHistorySection
        applyRunHistory={buildHistory()}
        onSelectApplyRun={vi.fn()}
        selectedApplyRunId="run_latest01"
      />,
    );

    const row = screen.getByTitle("run_older0202");
    expect(row.className).toContain("py-2.5");

    const rowLines = Array.from(row.children).map((child) => child.textContent);
    expect(rowLines).toHaveLength(3);
    expect(rowLines[2]).toContain("• Cancelled");
    expect(rowLines[2]).toContain("• Needed input");
    expect(rowLines[2]).toContain("• Preparation lder0202");
  });
});

describe("ApplicationsDetailPanel container contract", () => {
  it("names the detail pane as a container and pairs its actions on wide panes", () => {
    const run: ApplyRunSummary = {
      id: "run_latest01",
      campaignId: null,
      mode: "copilot",
      state: "completed",
      jobIds: ["job_1"],
      currentJobId: null,
      submitApprovalId: null,
      visualCheckpointsEnabled: false,
      createdAt: "2026-08-09T07:00:00.000Z",
      updatedAt: "2026-08-09T08:00:00.000Z",
      completedAt: "2026-08-09T08:00:00.000Z",
      summary: "Latest run",
      detail: "Finished.",
      totalJobs: 1,
      pendingJobs: 0,
      submittedJobs: 1,
      skippedJobs: 0,
      blockedJobs: 0,
      failedJobs: 0,
    };

    const { container } = render(
      <ApplicationsDetailPanel
        dailyPreparationCapacity={null}
        activeFilter="all"
        applyRunDetails={null}
        applyRunDetailsTarget={null}
        applyRunDetailsError={null}
        applyRunDetailsStatus="idle"
        applicationRecords={[baseRecord]}
        applyJobResults={[baseApplyResult]}
        discoveryJobs={[]}
        applyRunHistory={[
          { result: { ...baseApplyResult, runId: run.id }, run },
        ]}
        effectiveSelectedApplyResult={baseApplyResult}
        hasAnyApplications
        hasVisibleApplications
        isApplyPending={false}
        isApplyRequestPending={() => false}
        isApplyRunPending={() => false}
        onApproveApplyRun={vi.fn()}
        onCancelApplyRun={vi.fn()}
        onOpenCompany={vi.fn()}
        onExportApplicationPacket={vi.fn(() => Promise.resolve())}
        onSaveApplicationAnswer={vi.fn(() => Promise.resolve())}
        onClearApplicationAnswer={vi.fn(() => Promise.resolve())}
        onResolveApplyConsentRequest={vi.fn()}
        onRevokeApplyRunApproval={vi.fn()}
        onSelectApplyRun={vi.fn()}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedApplyRunId="run_latest01"
        selectedAttempt={null}
        selectedRecord={baseRecord}
        selectedRecordCompanyId="company_1"
      />,
    );

    const panel = container.firstElementChild;
    expect(panel?.className).toContain("@container/detail");
    expect(container.querySelector('div[class*="34rem"]')).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Application facts" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Waiting on consent")).toHaveLength(1);

    // The selected-record body is the pane's single bounded primary scroll
    // region, so the locked layout routes wheel and keyboard scrolling to it.
    expect(
      container.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(1);
    const detailRegion = container.querySelector<HTMLElement>(
      "[data-locked-pane-scroll-region]",
    );
    expect(detailRegion?.className).toContain("overflow-y-auto");
  });
});
