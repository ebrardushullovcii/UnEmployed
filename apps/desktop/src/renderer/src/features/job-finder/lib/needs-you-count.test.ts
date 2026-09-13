import { describe, expect, it } from "vitest";

import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";

import {
  countApplicationLedgerEntries,
  countApplyRunItemsNeedingYou,
  countNeedsYouItems,
} from "./needs-you-count";

describe("application ledger count", () => {
  it("gives Home, Applications, and Tasks the same count from one fixture", () => {
    const records = Array.from({ length: 13 }, (_, index) => ({
      jobId: `job-${index}`,
    }));
    const applicationsCount = countApplicationLedgerEntries(records);
    const tasksCount = countApplicationLedgerEntries(records);
    const homeCount = countApplicationLedgerEntries(
      records,
      new Set(records.map((record) => record.jobId)),
    );

    expect({ applicationsCount, homeCount, tasksCount }).toEqual({
      applicationsCount: 13,
      homeCount: 13,
      tasksCount: 13,
    });
  });
});

describe("one apply run's share of the Needs you population", () => {
  function blockedRecord(index: number) {
    return {
      id: `application_${index}`,
      jobId: `job_${index}`,
      title: "Manager",
      company: "Alliant Credit Union",
      status: "drafting",
      lastActionLabel: "Preparation paused",
      nextActionLabel: "Finish this step on the site",
      lastUpdatedAt: "2026-09-13T07:00:00.000Z",
      lastAttemptState: "paused",
      questionSummary: {},
      latestBlocker: null,
      consentSummary: { status: "granted" },
      replaySummary: {},
      events: [],
      crm: null,
    } as unknown as JobFinderWorkspaceSnapshot["applicationRecords"][number];
  }

  it("gives the run summary and the header badge the same number", () => {
    const applicationRecords = [1, 2, 3, 4, 5].map(blockedRecord);
    const runJobIds = new Set(applicationRecords.map((record) => record.jobId));

    const runSummaryCount = countApplyRunItemsNeedingYou({
      applicationRecords,
      requests: [],
      runId: "apply_run_1",
      runJobIds,
    });
    const badgeCount = countNeedsYouItems({
      applicationRecords,
      groupedDecisions: [],
      requests: [],
    });

    expect(runSummaryCount).toBe(5);
    expect(runSummaryCount).toBe(badgeCount);
  });

  it("counts a job once when a live request already represents it", () => {
    const applicationRecords = [1, 2, 3, 4, 5].map(blockedRecord);
    const runJobIds = new Set(applicationRecords.map((record) => record.jobId));
    const requests = [
      {
        id: "request_1",
        state: "awaiting_user",
        scope: {
          type: "application",
          runId: "apply_run_1",
          jobId: "job_1",
          applicationRecordId: "application_1",
        },
      },
    ] as unknown as JobFinderWorkspaceSnapshot["userActionRequests"];

    expect(
      countApplyRunItemsNeedingYou({
        applicationRecords,
        requests,
        runId: "apply_run_1",
        runJobIds,
      }),
    ).toBe(
      countNeedsYouItems({
        applicationRecords,
        groupedDecisions: [],
        requests,
      }),
    );
  });

  it("leaves another run's waiting applications out of this run's number", () => {
    const applicationRecords = [1, 2, 3, 4, 5].map(blockedRecord);

    expect(
      countApplyRunItemsNeedingYou({
        applicationRecords,
        requests: [],
        runId: "apply_run_1",
        runJobIds: new Set(["job_1", "job_2"]),
      }),
    ).toBe(2);
  });
});
