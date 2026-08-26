import { describe, expect, it } from "vitest";
import {
  createDiscoveryRunCancelledFeedback,
  createDiscoveryRunFailedFeedback,
  createDiscoveryRunInterruptedFeedback,
  createDiscoveryRunRefreshIncompleteFeedback,
  createDiscoveryRunStartedFeedback,
  createDiscoveryRunSucceededFeedback,
  getDiscoveryCancelledSavedJobCount,
  getDiscoveryLatestRunVerdict,
  getDiscoveryRunFailureRecovery,
} from "./discovery-run-feedback";

describe("discovery run failure recovery classification", () => {
  it("maps a closed or unavailable browser runtime to opening the browser", () => {
    const recovery = getDiscoveryRunFailureRecovery(
      "The dedicated browser profile could not start because Chrome is not installed or is closed.",
    );

    expect(recovery.kind).toBe("browser_session");
    expect(recovery.actionLabel).toBe("Open browser");
  });

  it("maps a disabled browser agent runtime to opening the browser", () => {
    const recovery = getDiscoveryRunFailureRecovery(
      "Targeted sign-in is unavailable because the browser agent runtime is disabled.",
    );

    expect(recovery.kind).toBe("browser_session");
  });

  it("maps missing or disabled sources to the exact source setup owner", () => {
    const singleTarget = getDiscoveryRunFailureRecovery(
      "single_target: target not found or unavailable",
    );
    const noSources = getDiscoveryRunFailureRecovery(
      "Add or enable at least one valid public job-source URL before searching.",
    );

    expect(singleTarget.kind).toBe("source_setup");
    expect(noSources.kind).toBe("source_setup");
    expect(noSources.actionLabel).toBe("Review job sources");
  });

  it("maps provider and network transport failures to connection guidance", () => {
    for (const detail of [
      "fetch failed",
      "getaddrinfo ENOTFOUND jobs.example.com",
      "request to https://api.example.com timed out",
    ]) {
      expect(getDiscoveryRunFailureRecovery(detail).kind).toBe("connection");
    }
  });

  it("keeps unknown failures retryable without inventing a cause", () => {
    const recovery = getDiscoveryRunFailureRecovery(
      "Discovery failed for Example Board: unexpected extraction shape",
    );

    expect(recovery.kind).toBe("retry");
    expect(recovery.actionLabel).toBeNull();
  });
});

describe("discovery run interrupted feedback", () => {
  it("reports a started run that stopped before completion", () => {
    const feedback = createDiscoveryRunInterruptedFeedback({
      detail: "fetch failed",
      targetLabel: null,
    });

    expect(feedback.status).toBe("failed");
    expect(feedback.headline).toBe(
      "The search stopped before it could finish.",
    );
    expect(feedback.detail).toBe("fetch failed");
    expect(feedback.recovery?.kind).toBe("connection");
  });

  it("names a single-source run that stopped before completion", () => {
    const feedback = createDiscoveryRunInterruptedFeedback({
      detail: null,
      targetLabel: "Stripe Careers",
    });

    expect(feedback.headline).toBe(
      "The search for Stripe Careers stopped before it could finish.",
    );
    expect(feedback.recovery).toBeNull();
  });
});

describe("discovery run feedback factories", () => {
  it("reports an all-source start immediately with pending guidance", () => {
    const feedback = createDiscoveryRunStartedFeedback();

    expect(feedback.status).toBe("started");
    expect(feedback.recovery).toBeNull();
    expect(feedback.headline).toContain("Search started");
  });

  it("names a single-source run while it starts", () => {
    const feedback = createDiscoveryRunStartedFeedback("Stripe Careers");

    expect(feedback.targetLabel).toBe("Stripe Careers");
    expect(feedback.headline).toContain("Stripe Careers");
  });

  it("keeps the truthful finished wording for success", () => {
    const allSources = createDiscoveryRunSucceededFeedback();
    const singleSource = createDiscoveryRunSucceededFeedback("Circle");

    expect(allSources.headline).toBe(
      "Search finished and results were saved on this device.",
    );
    expect(singleSource.headline).toBe(
      "Search finished for Circle and results were saved on this device.",
    );
  });

  it("keeps the classified service detail verbatim on failure", () => {
    const detail =
      "Error invoking remote method 'job-finder:run-agent-discovery': Error: fetch failed";
    const feedback = createDiscoveryRunFailedFeedback({
      detail,
      targetLabel: null,
    });

    expect(feedback.status).toBe("failed");
    expect(feedback.detail).toBe(detail);
    expect(feedback.recovery?.kind).toBe("connection");
  });

  it("reports a finished search whose view refresh failed without inventing a recovery", () => {
    const allSources = createDiscoveryRunRefreshIncompleteFeedback();
    const singleSource = createDiscoveryRunRefreshIncompleteFeedback("Circle");

    expect(allSources.status).toBe("succeeded");
    expect(allSources.headline).toBe(
      "Search finished, but this view could not refresh automatically.",
    );
    expect(singleSource.headline).toBe(
      "Search finished for Circle, but this view could not refresh automatically.",
    );
    expect(allSources.recovery).toBeNull();
    expect(allSources.detail).toBeNull();
  });

  it("offers no invented recovery when no detail survives", () => {
    const feedback = createDiscoveryRunFailedFeedback({ detail: null });

    expect(feedback.recovery).toBeNull();
  });
});

describe("discovery run cancelled feedback", () => {
  it("acknowledges kept jobs when the stopped run had committed results", () => {
    const allSources = createDiscoveryRunCancelledFeedback({
      savedJobCount: 3,
    });
    const singleSource = createDiscoveryRunCancelledFeedback({
      savedJobCount: 1,
      targetLabel: "Stripe Careers",
    });

    expect(allSources.status).toBe("cancelled");
    expect(allSources.headline).toBe(
      "Search stopped. Jobs found so far were kept on this device.",
    );
    expect(singleSource.headline).toBe(
      "Search stopped for Stripe Careers. Jobs found so far were kept on this device.",
    );
    expect(allSources.detail).toBeNull();
  });

  it("never claims kept jobs or success for an empty cancellation", () => {
    for (const savedJobCount of [0, null]) {
      const feedback = createDiscoveryRunCancelledFeedback({
        savedJobCount,
        targetLabel: null,
      });

      expect(feedback.status).toBe("cancelled");
      expect(feedback.headline).toBe(
        "The search stopped before it could finish.",
      );
      expect(feedback.headline).not.toContain("saved");
      expect(feedback.recovery).toBeNull();
    }
  });

  it("never invents a failure recovery for a deliberate stop", () => {
    const feedback = createDiscoveryRunCancelledFeedback({
      savedJobCount: 5,
      targetLabel: "Circle",
    });

    expect(feedback.status).not.toBe("succeeded");
    expect(feedback.status).not.toBe("failed");
    expect(feedback.recovery).toBeNull();
  });
});

describe("getDiscoveryCancelledSavedJobCount", () => {
  const runWithSummary = (
    state: "completed" | "cancelled",
    validJobsFound: number,
  ) => ({
    state,
    summary: { validJobsFound },
  });

  it("counts only when the newest run is itself the cancelled run", () => {
    expect(getDiscoveryCancelledSavedJobCount([runWithSummary("cancelled", 4)])).toBe(
      4,
    );
    expect(
      getDiscoveryCancelledSavedJobCount([
        runWithSummary("completed", 9),
        runWithSummary("cancelled", 4),
      ]),
    ).toBeNull();
  });

  it("reports unknown for empty history instead of fabricating zero", () => {
    expect(getDiscoveryCancelledSavedJobCount([])).toBeNull();
  });
});

describe("getDiscoveryLatestRunVerdict", () => {
  const run = (
    id: string,
    state: "completed" | "failed" | "cancelled" | "running" | "idle",
    startedAt: string,
  ) => ({ id, state, startedAt });
  const olderCompleted = run(
    "run_old",
    "completed",
    "2026-08-20T10:00:00.000Z",
  );
  const newerFailed = run("run_new", "failed", "2026-08-25T10:00:00.000Z");

  it("reports none for empty or idle-only history", () => {
    expect(getDiscoveryLatestRunVerdict([])).toEqual({ kind: "none" });
    expect(getDiscoveryLatestRunVerdict([run("a", "idle", "2026-08-01")])).toEqual(
      { kind: "none" },
    );
  });

  it("reports running when the newest attempt is still in flight", () => {
    expect(
      getDiscoveryLatestRunVerdict([
        olderCompleted,
        run("run_live", "running", "2026-08-25T12:00:00.000Z"),
      ]),
    ).toEqual({ kind: "running" });
  });

  it("reports completed when the newest finished search wins over older failures", () => {
    const completedNewest = [
      olderCompleted,
      run("run_fail_old", "failed", "2026-08-22T10:00:00.000Z"),
      run("run_done", "completed", "2026-08-24T10:00:00.000Z"),
    ];
    expect(getDiscoveryLatestRunVerdict(completedNewest)).toEqual({
      kind: "completed",
    });
    expect(
      getDiscoveryLatestRunVerdict([...completedNewest].reverse()),
    ).toEqual({ kind: "completed" });
  });

  it("marks a newest failed run as interrupted with no earlier completed search", () => {
    const verdict = getDiscoveryLatestRunVerdict([
      run("run_a", "cancelled", "2026-08-21T10:00:00.000Z"),
      newerFailed,
    ]);

    expect(verdict).toEqual({
      hasEarlierCompleted: false,
      interruptState: "failed",
      kind: "interrupted",
    });
  });

  it("preserves the partial-completed signal behind an interrupted newest run", () => {
    const verdict = getDiscoveryLatestRunVerdict([
      newerFailed,
      run("run_cancelled_mid", "cancelled", "2026-08-22T10:00:00.000Z"),
      olderCompleted,
    ]);

    expect(verdict).toEqual({
      hasEarlierCompleted: true,
      interruptState: "failed",
      kind: "interrupted",
    });
  });

  it("marks a cancelled newest run as interrupted and keeps the state name", () => {
    const verdict = getDiscoveryLatestRunVerdict([
      newerFailed,
      run("run_cancel", "cancelled", "2026-08-26T10:00:00.000Z"),
    ]);

    expect(verdict).toEqual({
      hasEarlierCompleted: false,
      interruptState: "cancelled",
      kind: "interrupted",
    });
  });

  it("is independent of history array order for every terminal mixture", () => {
    const histories = [
      [olderCompleted, newerFailed],
      [newerFailed, olderCompleted],
    ];

    for (const history of histories) {
      expect(getDiscoveryLatestRunVerdict(history)).toEqual({
        hasEarlierCompleted: true,
        interruptState: "failed",
        kind: "interrupted",
      });
    }

    const mixed = [
      run("run_c", "cancelled", "2026-08-23T10:00:00.000Z"),
      run("run_d", "completed", "2026-08-19T10:00:00.000Z"),
      run("run_e", "failed", "2026-08-24T10:00:00.000Z"),
    ];
    expect(getDiscoveryLatestRunVerdict(mixed)).toEqual(
      getDiscoveryLatestRunVerdict([...mixed].reverse()),
    );
  });

  it("keeps the first-listed run authoritative when start times tie", () => {
    const tied = [
      run("run_first", "completed", "2026-08-25T10:00:00.000Z"),
      run("run_second", "failed", "2026-08-25T10:00:00.000Z"),
    ];

    expect(getDiscoveryLatestRunVerdict(tied)).toEqual({ kind: "completed" });
  });

  describe("completed runs with source-failure evidence", () => {
    const sourceHealthEntry = (
      targetId: string,
      health: "healthy" | "warning" | "failed",
    ) => ({ durationMs: 0, health, targetId, warnings: [] });
    const completedRun = (
      startedAt: string,
      summary: {
        validJobsFound: number;
        sourceHealth: ReturnType<typeof sourceHealthEntry>[];
      },
    ) => ({
      id: `run_${startedAt}`,
      state: "completed" as const,
      startedAt,
      summary,
    });
    const mixedZeroResultSummary = {
      validJobsFound: 0,
      sourceHealth: [
        sourceHealthEntry("target_healthy", "healthy"),
        sourceHealthEntry("target_failed", "failed"),
      ],
    };

    it("marks a mixed success-and-failure zero-result completed run as interrupted", () => {
      const degradedRun = completedRun(
        "2026-08-25T10:00:00.000Z",
        mixedZeroResultSummary,
      );

      expect(getDiscoveryLatestRunVerdict([degradedRun])).toEqual({
        hasEarlierCompleted: false,
        interruptState: "sources_failed",
        kind: "interrupted",
      });
      expect(
        getDiscoveryLatestRunVerdict([degradedRun].reverse()),
      ).toEqual({
        hasEarlierCompleted: false,
        interruptState: "sources_failed",
        kind: "interrupted",
      });
    });

    it("acknowledges an earlier completed search behind a degraded newest run", () => {
      expect(
        getDiscoveryLatestRunVerdict([
          olderCompleted,
          completedRun("2026-08-25T10:00:00.000Z", mixedZeroResultSummary),
        ]),
      ).toEqual({
        hasEarlierCompleted: true,
        interruptState: "sources_failed",
        kind: "interrupted",
      });
    });

    it("keeps the completed verdict when a failed-source run still found results", () => {
      expect(
        getDiscoveryLatestRunVerdict([
          completedRun("2026-08-25T10:00:00.000Z", {
            ...mixedZeroResultSummary,
            validJobsFound: 3,
          }),
        ]),
      ).toEqual({ kind: "completed" });
    });

    it("keeps the completed verdict for zero results when every execution succeeded", () => {
      expect(
        getDiscoveryLatestRunVerdict([
          completedRun("2026-08-25T10:00:00.000Z", {
            validJobsFound: 0,
            sourceHealth: [
              sourceHealthEntry("target_a", "healthy"),
              sourceHealthEntry("target_b", "healthy"),
              sourceHealthEntry("target_c", "warning"),
            ],
          }),
        ]),
      ).toEqual({ kind: "completed" });
    });

    it("never downgrades a completed run without summary evidence", () => {
      expect(getDiscoveryLatestRunVerdict([olderCompleted])).toEqual({
        kind: "completed",
      });
    });
  });
});
