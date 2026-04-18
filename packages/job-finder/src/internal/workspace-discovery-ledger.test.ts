import { describe, expect, test } from "vitest";

import { type DiscoveryLedgerEntry } from "@unemployed/contracts";

import {
  applyInactiveLedgerMarks,
  findDiscoveryLedgerEntry,
  recordDiscoveredPostingInLedger,
  shouldSkipPostingFromLedger,
} from "./workspace-discovery-ledger";

function createLedgerEntry(overrides: Partial<DiscoveryLedgerEntry> = {}): DiscoveryLedgerEntry {
  return {
    id: "ledger_1",
    canonicalUrl: "https://example.com/jobs/job-1",
    source: "target_site",
    sourceJobId: "job_1",
    providerKey: null,
    providerBoardToken: null,
    providerIdentifier: null,
    title: "Software Engineer",
    company: "Acme",
    targetId: "target_one",
    collectionMethod: "careers_page",
    firstSeenAt: "2026-03-20T09:00:00.000Z",
    lastSeenAt: "2026-03-20T09:00:00.000Z",
    lastAppliedAt: null,
    lastEnrichedAt: null,
    inactiveAt: null,
    latestStatus: "seen",
    titleTriageOutcome: "pass",
    skipReason: null,
    ...overrides,
  };
}

describe("workspace-discovery-ledger", () => {
  test("does not match distinct jobs that only share title and company", () => {
    const result = findDiscoveryLedgerEntry(
      [createLedgerEntry()],
      {
        canonicalUrl: "https://example.com/jobs/job-2",
        source: "target_site",
        sourceJobId: "job_2",
        providerKey: null,
        providerBoardToken: null,
        providerIdentifier: null,
        title: "Software Engineer",
        company: "Acme",
      },
    );

    expect(result).toBeNull();
  });

  test("skips enriched ledger entries as existing handled jobs", () => {
    const decision = shouldSkipPostingFromLedger({
      ledgerEntry: createLedgerEntry({ latestStatus: "enriched", lastEnrichedAt: "2026-03-20T09:05:00.000Z" }),
      posting: {
        title: "Software Engineer",
        company: "Acme",
      },
      triageOutcome: "pass",
    });

    expect(decision).toEqual({
      skip: true,
      reason: "Already retained from an earlier run.",
      outcome: "skip_existing",
    });
  });

  test("preserves applied status when rediscovered through saved-job flows", () => {
    const ledger = recordDiscoveredPostingInLedger({
      ledger: [createLedgerEntry({ latestStatus: "applied", lastAppliedAt: "2026-03-20T09:10:00.000Z" })],
      posting: {
        canonicalUrl: "https://example.com/jobs/job-1",
        source: "target_site",
        sourceJobId: "job_1",
        providerKey: null,
        providerBoardToken: null,
        providerIdentifier: null,
        title: "Software Engineer",
        company: "Acme",
        collectionMethod: "careers_page",
        titleTriageOutcome: "pass",
      },
      targetId: "target_one",
      seenAt: "2026-03-20T10:00:00.000Z",
      status: "applied",
    });

    expect(ledger[0]?.latestStatus).toBe("applied");
    expect(ledger[0]?.lastAppliedAt).toBe("2026-03-20T10:00:00.000Z");
  });

  test("does not mark jobs inactive when inactive marking is disabled", () => {
    const ledger = applyInactiveLedgerMarks({
      ledger: [createLedgerEntry({ latestStatus: "enriched", lastEnrichedAt: "2026-03-20T09:10:00.000Z" })],
      targetId: "target_one",
      seenCanonicalUrls: [],
      occurredAt: "2026-03-20T10:00:00.000Z",
      allowInactiveMarking: false,
    });

    expect(ledger[0]?.latestStatus).toBe("enriched");
    expect(ledger[0]?.inactiveAt).toBeNull();
  });

  test("marks unseen entries inactive when inactive marking is enabled", () => {
    const ledger = applyInactiveLedgerMarks({
      ledger: [createLedgerEntry({ latestStatus: "enriched", lastEnrichedAt: "2026-03-20T09:10:00.000Z" })],
      targetId: "target_one",
      seenCanonicalUrls: [],
      occurredAt: "2026-03-20T10:00:00.000Z",
      allowInactiveMarking: true,
    });

    expect(ledger[0]?.latestStatus).toBe("inactive");
    expect(ledger[0]?.inactiveAt).toBe("2026-03-20T10:00:00.000Z");
  });

  test("clears stale inactive timestamps when a posting becomes active again", () => {
    const ledger = recordDiscoveredPostingInLedger({
      ledger: [createLedgerEntry({ latestStatus: "inactive", inactiveAt: "2026-03-20T09:10:00.000Z" })],
      posting: {
        canonicalUrl: "https://example.com/jobs/job-1",
        source: "target_site",
        sourceJobId: "job_1",
        providerKey: null,
        providerBoardToken: null,
        providerIdentifier: null,
        title: "Software Engineer",
        company: "Acme",
        collectionMethod: "careers_page",
        titleTriageOutcome: "pass",
      },
      targetId: "target_one",
      seenAt: "2026-03-20T10:00:00.000Z",
      status: "seen",
    });

    expect(ledger[0]?.latestStatus).toBe("seen");
    expect(ledger[0]?.inactiveAt).toBeNull();
  });

  test("clears stale skip reasons when a skipped posting becomes active again", () => {
    const ledger = recordDiscoveredPostingInLedger({
      ledger: [
        createLedgerEntry({
          latestStatus: "skipped",
          titleTriageOutcome: "skip_existing",
          skipReason: "Already retained from an earlier run.",
        }),
      ],
      posting: {
        canonicalUrl: "https://example.com/jobs/job-1",
        source: "target_site",
        sourceJobId: "job_1",
        providerKey: null,
        providerBoardToken: null,
        providerIdentifier: null,
        title: "Software Engineer",
        company: "Acme",
        collectionMethod: "careers_page",
        titleTriageOutcome: "pass",
      },
      targetId: "target_one",
      seenAt: "2026-03-20T10:00:00.000Z",
      status: "enriched",
    });

    expect(ledger[0]?.latestStatus).toBe("enriched");
    expect(ledger[0]?.skipReason).toBeNull();
  });
});
