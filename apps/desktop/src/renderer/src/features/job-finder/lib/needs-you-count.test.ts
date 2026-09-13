import { describe, expect, it } from "vitest";

import { countApplicationLedgerEntries } from "./needs-you-count";

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
