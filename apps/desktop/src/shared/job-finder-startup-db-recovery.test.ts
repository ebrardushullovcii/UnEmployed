import { describe, expect, it } from "vitest";
import {
  JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_DETAIL,
  JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_MESSAGE,
  buildJobFinderStartupDatabaseRecoveryBlockedDetail,
  isJobFinderStartupDatabaseRecoveryFact,
  type JobFinderStartupDatabaseRecoveryFact,
} from "./job-finder-startup-db-recovery";

function restoredFact(): JobFinderStartupDatabaseRecoveryFact {
  return {
    status: "restored",
    incidentId: "incident-1",
    restoredFrom: "backup",
    lossWindow: {
      detectedAtIso: "2026-08-20T10:00:00.000Z",
      quarantinedDatabaseModifiedAtIso: null,
      restoredSnapshotModifiedAtIso: "2026-08-19T10:00:00.000Z",
    },
    quarantinedArtifactBasenames: ["job-finder-workspace.sqlite.quarantine-a"],
    restoredAtIso: "2026-08-20T10:05:00.000Z",
    dismissedAtIso: null,
  };
}

function blockedFact(): JobFinderStartupDatabaseRecoveryFact {
  return {
    status: "blocked",
    incidentId: "incident-2",
    outcome: "salvage-required",
    candidates: [
      { kind: "backup", status: "invalid", failedStage: "integrity-check" },
      { kind: "backup-prev", status: "missing", failedStage: null },
    ],
    quarantineBasenames: [],
  };
}

describe("startup database recovery fact module", () => {
  it("accepts idle, restored, and blocked facts", () => {
    expect(isJobFinderStartupDatabaseRecoveryFact({ status: "idle" })).toBe(
      true,
    );
    expect(isJobFinderStartupDatabaseRecoveryFact(restoredFact())).toBe(true);
    expect(isJobFinderStartupDatabaseRecoveryFact(blockedFact())).toBe(true);
  });

  it("rejects non-objects and unknown statuses", () => {
    expect(isJobFinderStartupDatabaseRecoveryFact(null)).toBe(false);
    expect(isJobFinderStartupDatabaseRecoveryFact("restored")).toBe(false);
    expect(isJobFinderStartupDatabaseRecoveryFact({ status: "surprise" })).toBe(
      false,
    );
  });

  it("rejects malformed restored facts", () => {
    const malformed = [
      { ...restoredFact(), incidentId: "" },
      { ...restoredFact(), restoredFrom: "elsewhere" },
      {
        ...restoredFact(),
        lossWindow: {
          detectedAtIso: "not-a-date",
          quarantinedDatabaseModifiedAtIso: null,
          restoredSnapshotModifiedAtIso: null,
        },
      },
      {
        ...restoredFact(),
        quarantinedArtifactBasenames: [42],
      },
      { ...restoredFact(), dismissedAtIso: "yesterday" },
      { ...restoredFact(), restoredAtIso: undefined },
    ];

    for (const fact of malformed) {
      expect(isJobFinderStartupDatabaseRecoveryFact(fact)).toBe(false);
    }
  });

  it("rejects malformed blocked facts", () => {
    const malformed = [
      { ...blockedFact(), outcome: "mystery-outcome" },
      {
        ...blockedFact(),
        candidates: [{ kind: "backup", status: "invalid", failedStage: null }],
      },
      {
        ...blockedFact(),
        candidates: [{ kind: "backup", status: "valid", failedStage: "open" }],
      },
      { ...blockedFact(), candidates: "backup" },
      { ...blockedFact(), quarantineBasenames: [null] },
    ];

    for (const fact of malformed) {
      expect(isJobFinderStartupDatabaseRecoveryFact(fact)).toBe(false);
    }
  });

  it("keeps the blocked detail free of retained file names while naming the incident", () => {
    const detail = buildJobFinderStartupDatabaseRecoveryBlockedDetail({
      incidentId: "incident-2",
      outcome: "salvage-required",
    });

    expect(detail).toContain("Incident ID: incident-2");
    expect(detail.toLowerCase()).toContain("retained");
    expect(detail).toContain("contact support");
    expect(detail).not.toContain("job-finder-workspace.sqlite");
  });

  it("states that database-only recovery excludes documents, assets, and browser data", () => {
    expect(JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_MESSAGE).toContain(
      "automatic snapshot",
    );
    expect(JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_DETAIL).toContain(
      "generated documents",
    );
    expect(JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_DETAIL).toContain(
      "candidate assets",
    );
    expect(JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_DETAIL).toContain(
      "browser sign-in data",
    );
    expect(JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_DETAIL).toContain(
      "may be missing",
    );
  });
});
