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
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  it("prefers a durable tri-state outcome over the legacy run state", () => {
    renderStrip({
      visibleApplyResult: {
        ...baseApplyResult,
        state: "submitting",
        privacyReceipt: {
          schemaVersion: 1,
          generatedAt: "2026-08-28T10:01:00.000Z",
          lineage: {
            runId: baseApplyResult.runId,
            jobId: baseApplyResult.jobId,
            resultId: baseApplyResult.id,
            applicationRecordId: baseRecord.id,
          },
          destination: { origin: "https://jobs.example", safePath: "/apply" },
          resume: {
            source: "tailored_export",
            sourceDocumentId: null,
            exportArtifactId: "export_1",
            fileName: "Resume.pdf",
            sha256: null,
          },
          stayedLocal: [],
          modelUse: [],
          externalWrites: [],
          accountCreationAuthorized: false,
          finalSubmitAuthorized: true,
          finalSubmitOccurred: false,
          submissionOutcome: {
            id: "outcome_1",
            preflightId: "preflight_1",
            idempotencyKey: "idempotency_1",
            authorityEnvelopeId: "authority_1",
            authorityRevision: 1,
            runId: baseApplyResult.runId,
            jobId: baseApplyResult.jobId,
            resultId: baseApplyResult.id,
            applicationRecordId: baseRecord.id,
            outcome: "not_submitted",
            attemptedAt: "2026-08-28T10:00:00.000Z",
            verifiedAt: null,
            evidence: [],
            retry: { eligible: true, blockReason: null },
          },
        },
      },
    });

    expect(screen.getByText("Final action not submitted")).toBeTruthy();
    expect(screen.queryByText("Submitting")).toBeNull();
  });

  it("renders primary status facts upfront and tucks technical details behind More details", () => {
    const { container } = renderStrip();
    expect(container.firstElementChild?.getAttribute("aria-label")).toBe(
      "Application status",
    );

    const primaryDl = container.querySelector("dl");
    if (!(primaryDl instanceof HTMLElement)) {
      throw new Error("Expected primary fact list");
    }

    const primaryLabels = within(primaryDl)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(primaryLabels).toEqual([
      "Latest activity",
      "Preparation status",
      "What stopped progress",
    ]);

    fireEvent.click(screen.getByText("More about this application"));

    const detailDl = container.querySelector("details dl");
    if (!(detailDl instanceof HTMLElement)) {
      throw new Error("Expected detail fact list");
    }

    const detailLabels = within(detailDl)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(detailLabels).toEqual([
      "Last updated",
      "Form questions",
      "Consent decisions",
      "Saved progress",
      "Latest preparation run",
    ]);
  });

  it("uses a pane-width container contract of two columns with three only where fitting", () => {
    const { container } = renderStrip();
    const section = container.firstElementChild;
    const dl = container.querySelector("dl");

    expect(section?.className).toContain("border-(--border-strong)");
    expect(dl?.className).toContain("grid-cols-1");
    expect(dl?.className).toContain("sm:grid-cols-2");
    expect(dl?.className).toContain("@[32rem]/detail:grid-cols-3");
    expect(dl?.className).toContain("gap-y-3");
  });

  it("lets fact values wrap so site-block and blocker copy stay readable", () => {
    const { container } = renderStrip();
    const dl = container.querySelector("dl");

    const valueCells = Array.from((dl as HTMLElement).querySelectorAll("dd"));
    for (const valueCell of valueCells) {
      expect(valueCell.className).toContain("break-words");
      expect(valueCell.className).not.toContain("truncate");
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
      "Not started",
      "Nothing blocking",
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

  it("treats LinkedIn service-worker apply results as site-blocked even when the blocker code is generic", () => {
    const swRecord: ApplicationRecord = {
      ...baseRecord,
      lastActionLabel: "Application preparation stopped safely",
      latestBlocker: {
        code: "requires_manual_review",
        summary: "The live application page needs manual review.",
      },
    };
    const swResult: ApplyJobResultSummary = {
      ...baseApplyResult,
      state: "blocked",
      summary: "A LinkedIn service worker blocked automated preparation.",
      blockerReason: "site_protection",
      blockerSummary: "Service worker interference on this job site.",
    };

    renderStrip({
      record: swRecord,
      visibleApplyResult: swResult,
    });

    // The Next step callout directly above owns this event in full, so the
    // strip no longer relabels its two halves as "Latest activity" and
    // "What stopped progress" beside it.
    expect(screen.queryByText("Latest activity")).toBeNull();
    expect(screen.queryByText("What stopped progress")).toBeNull();
    expect(screen.getByText("Preparation status")).toBeTruthy();
    expect(screen.queryByText(/Requires Manual Review/i)).toBeNull();
    expect(screen.queryByText(/service worker/i)).toBeNull();
  });

  it("lets Next step own the autosave pause instead of relabelling its halves", () => {
    const pauseSentence =
      "The application page could not safely save a prepared field";
    renderStrip({
      record: {
        ...baseRecord,
        lastActionLabel: pauseSentence,
        latestBlocker: {
          code: "requires_manual_review",
          summary: `${pauseSentence}.`,
        },
      },
      visibleApplyResult: {
        ...baseApplyResult,
        state: "blocked",
        summary: pauseSentence,
        blockerReason: null,
        blockerSummary: `${pauseSentence}.`,
      },
    });

    // One event, one place. Next step already prints "the job site tried to
    // save a field automatically … finish in the open browser", so the strip
    // keeps only the fact that callout does not carry.
    expect(
      screen.queryByText("The job site tried to save a field automatically"),
    ).toBeNull();
    expect(
      screen.queryByText("Job Finder stopped before that save"),
    ).toBeNull();
    expect(screen.queryByText("Latest activity")).toBeNull();
    expect(screen.queryByText("What stopped progress")).toBeNull();
    expect(screen.getByText("Preparation status")).toBeTruthy();
    expect(screen.queryByText(/could not safely save/i)).toBeNull();
    expect(screen.queryByText(/requires manual review/i)).toBeNull();
  });
});

describe("ApplicationsDetailPanelOverviewSections dedupe", () => {
  it("uses the newer declined record next step instead of a stale consent attempt label", () => {
    const declinedRecord: ApplicationRecord = {
      ...baseRecord,
      nextActionLabel: null,
      lastUpdatedAt: "2026-08-09T09:00:00.000Z",
      consentSummary: { status: "declined", pendingCount: 0 },
    };
    const staleConsentAttempt: ApplicationAttempt = {
      id: "attempt_stale_consent",
      jobId: declinedRecord.jobId,
      applicationRecordId: declinedRecord.id,
      state: "paused",
      summary: "Consent was declined.",
      detail: "The consent request was declined before the run continued.",
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
        "Review the consent request and decide whether to continue or skip this job",
      executionTimings: [],
    };

    render(
      <ApplicationsDetailPanelOverviewSections
        selectedAttempt={staleConsentAttempt}
        selectedRecord={declinedRecord}
        visibleApplyResult={null}
        visibleApplyRunId={null}
        showFactStrip={false}
      />,
    );

    expect(
      screen.getByText("Restart the run if you want to try again later."),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Review the consent request and decide whether to continue or skip this job",
      ),
    ).toBeNull();
  });

  it("owns title and next step once and leaves company, stage, and state to other regions", () => {
    const attempt: ApplicationAttempt = {
      id: "attempt_1",
      jobId: "job_1",
      applicationRecordId: baseRecord.id,
      state: "paused",
      summary: "Paused before final review.",
      detail: "Application detail",
      startedAt: "2026-08-09T07:00:00.000Z",
      updatedAt: "2026-08-09T09:00:00.000Z",
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
      screen.getByRole("heading", { name: "Current preparation run" }),
    ).toBeTruthy();
    expect(screen.getByTitle("run_latest01").getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(screen.getByText("1 earlier preparation run"));

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

    fireEvent.click(screen.getByText("1 earlier preparation run"));

    const row = screen.getByTitle("run_older0202");
    expect(row.className).toContain("py-2.5");

    const rowLines = Array.from(row.children).map((child) => child.textContent);
    expect(rowLines).toHaveLength(3);
    expect(rowLines[2]).toContain("• Cancelled");
    expect(rowLines[2]).toContain("• Needed input");
    // Internal run ids stay on the title attribute only; people never read
    // "Run lder0202" in the row copy.
    expect(rowLines[2]).not.toContain("Run lder0202");
    expect(rowLines[2]).not.toMatch(/• Run /);
    expect(rowLines[0]).toContain("Automatic preparation (several jobs)");
  });

  it("writes run states for people instead of title-cased status codes", () => {
    const history = buildHistory().map((entry) => ({
      ...entry,
      run: { ...entry.run, state: "paused_for_user_review" as const },
    }));
    render(
      <ApplicationsDetailPanelRunHistorySection
        applyRunHistory={history}
        onSelectApplyRun={vi.fn()}
        selectedApplyRunId="run_latest01"
      />,
    );

    const row = screen.getByTitle("run_latest01");
    expect(row.textContent).toContain("Paused for your review");
    expect(row.textContent).not.toContain("Paused For User Review");
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
      screen.getByRole("region", { name: "Application status" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Waiting on consent")).toHaveLength(1);

    // The selected-record body is the pane's single bounded primary scroll
    // region, so the locked layout routes wheel and keyboard scrolling to it.
    const detailRegion = container.querySelector<HTMLElement>(
      "[data-locked-pane-scroll-region]",
    );
    expect(
      container.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(1);
    if (!detailRegion) {
      throw new Error("Expected the selected-record detail scroll region");
    }

    const nextStep = within(detailRegion).getByRole("heading", {
      name: "Next step",
    });
    const recoveryActions = within(detailRegion).getByTestId(
      "applications-recovery-actions",
    );
    const statusFacts = within(detailRegion).getByRole("region", {
      name: "Application status",
    });
    expect(nextStep.compareDocumentPosition(recoveryActions)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(recoveryActions.compareDocumentPosition(statusFacts)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(detailRegion?.className).toContain("overflow-y-auto");

    // Diagnostics collapse into one closed "Run details and history" block that
    // owns the run history, review data, and preparation details.
    const technicalDetails = within(detailRegion).getByTestId(
      "applications-technical-details",
    );
    expect(technicalDetails.tagName).toBe("DETAILS");
    expect(technicalDetails.hasAttribute("open")).toBe(false);
    expect(
      within(technicalDetails).getByText("Run details and history"),
    ).toBeTruthy();
    expect(
      within(technicalDetails).getByRole("heading", {
        name: "Current preparation run",
      }),
    ).toBeTruthy();
    expect(
      within(technicalDetails).getByText("What this run recorded"),
    ).toBeTruthy();
    expect(
      within(technicalDetails).getByText("Preparation details"),
    ).toBeTruthy();
    // The stacked (below-xl) pane sizes to its content instead of holding a
    // fixed minimum height; only the xl two-pane layout is full height.
    expect(panel?.className).not.toContain("min-h-124");
    expect(panel?.className).toContain("xl:h-full");
  });
});

describe("Applications detail heading weight", () => {
  it("never dresses a heading in the 700-weight label class", () => {
    // The published scale puts every heading at weight 600. `.label-mono-xs`
    // is a 700-weight *label* class, correct on a `<p>`, `<dt>` or `<span>`
    // but not on an `<h3>`: two Applications section eyebrows rendered at 700
    // beside neighbouring 600-weight eyebrows saying the same kind of thing.
    // They now share `APPLICATION_DETAIL_FACT_LABEL_CLASS` with those
    // neighbours.
    const directory = dirname(fileURLToPath(import.meta.url));
    const offenders: string[] = [];

    for (const entry of readdirSync(directory)) {
      if (!entry.endsWith(".tsx") || entry.includes(".test.")) {
        continue;
      }

      const source = readFileSync(join(directory, entry), "utf8");
      for (const match of source.matchAll(/<h[1-6][^>]*label-mono-xs[^>]*>/g)) {
        offenders.push(`${entry}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
