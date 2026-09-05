import { ApplyJobResultSchema, ApplyRunSchema } from "@unemployed/contracts";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { deriveGlobalDailyApplicationPreparationCapacity } from "./application-preparation-capacity";

const originalTimeZone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/New_York";
});

afterAll(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

function run(input: {
  id: string;
  campaignId: string | null;
  createdAt: string;
  totalJobs?: number;
  pendingJobs?: number;
}) {
  return ApplyRunSchema.parse({
    id: input.id,
    campaignId: input.campaignId,
    mode: "queue_auto",
    state: "completed",
    jobIds: ["job-1", "job-2"].slice(0, input.totalJobs ?? 1),
    currentJobId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    completedAt: input.createdAt,
    summary: "Capacity fixture.",
    detail: "Capacity fixture.",
    totalJobs: input.totalJobs ?? 1,
    pendingJobs: input.pendingJobs ?? 0,
  });
}

function result(input: {
  id: string;
  runId: string;
  jobId: string;
  state: "planned" | "filling" | "failed";
  startedAt?: string;
  updatedAt?: string;
  preparationStartedAt?: string | null;
  preparationStartedLocalDate?: string | null;
  blockerReason?: string | null;
}) {
  return ApplyJobResultSchema.parse({
    ...input,
    queuePosition: 0,
    summary: "Capacity fixture.",
    detail: "Capacity fixture.",
    startedAt: input.startedAt ?? "2026-03-08T07:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-03-08T07:00:00.000Z",
    ...(input.preparationStartedAt !== undefined
      ? {
          applicationPreparationStartedAt: input.preparationStartedAt,
          applicationPreparationStartedLocalDate:
            input.preparationStartedLocalDate,
        }
      : {}),
  });
}

describe("global daily application preparation capacity", () => {
  test("counts persisted start dates exactly and reports intersecting legacy uncertainty", () => {
    const currentCampaign = run({
      id: "run-current",
      campaignId: "campaign-current",
      createdAt: "2026-03-08T06:00:00.000Z",
      totalJobs: 2,
      pendingJobs: 2,
    });
    const legacy = run({
      id: "run-legacy",
      campaignId: null,
      createdAt: "2026-03-08T06:15:00.000Z",
    });
    const legacyWithoutResults = run({
      id: "run-legacy-counters",
      campaignId: null,
      createdAt: "2026-03-08T06:30:00.000Z",
      totalJobs: 2,
      pendingJobs: 1,
    });
    const yesterday = run({
      id: "run-yesterday",
      campaignId: "campaign-other",
      createdAt: "2026-03-07T06:30:00.000Z",
    });

    expect(
      deriveGlobalDailyApplicationPreparationCapacity({
        now: new Date("2026-03-08T06:30:00.000Z"),
        applyRuns: [currentCampaign, legacy, legacyWithoutResults, yesterday],
        applyJobResults: [
          result({
            id: "result-current-planned",
            runId: currentCampaign.id,
            jobId: "job-1",
            state: "planned",
          }),
          result({
            id: "result-current-begun",
            runId: currentCampaign.id,
            jobId: "job-2",
            state: "failed",
            preparationStartedAt: "2026-03-08T07:00:00.000Z",
            preparationStartedLocalDate: "2026-03-08",
          }),
          result({
            id: "result-current-duplicate",
            runId: currentCampaign.id,
            jobId: "job-2",
            state: "filling",
            preparationStartedAt: "2026-03-08T07:00:00.000Z",
            preparationStartedLocalDate: "2026-03-08",
          }),
          result({
            id: "result-legacy-begun",
            runId: legacy.id,
            jobId: "job-1",
            state: "filling",
          }),
          result({
            id: "result-yesterday",
            runId: yesterday.id,
            jobId: "job-1",
            state: "failed",
            preparationStartedAt: "2026-03-07T07:00:00.000Z",
            preparationStartedLocalDate: "2026-03-07",
          }),
        ],
      }),
    ).toEqual({
      limit: 20,
      used: 1,
      legacyUncertain: 1,
      remaining: 18,
      localDate: "2026-03-08",
      resetsAt: "2026-03-09T04:00:00.000Z",
    });
  });

  test("charges a staged-yesterday result on its persisted approval-day mark", () => {
    const staged = run({
      id: "run-staged-yesterday",
      campaignId: "campaign-current",
      createdAt: "2026-03-07T15:00:00.000Z",
    });
    expect(
      deriveGlobalDailyApplicationPreparationCapacity({
        now: new Date("2026-03-08T16:00:00.000Z"),
        applyRuns: [staged],
        applyJobResults: [
          result({
            id: "result-approved-today",
            runId: staged.id,
            jobId: "job-1",
            state: "planned",
            preparationStartedAt: "2026-03-08T16:00:00.000Z",
            preparationStartedLocalDate: "2026-03-08",
          }),
        ],
      }),
    ).toMatchObject({ used: 1, legacyUncertain: 0, remaining: 19 });
  });

  test("does not guess from explicit null start facts or run counters", () => {
    const legacyCounter = run({
      id: "run-counter",
      campaignId: null,
      createdAt: "2026-03-08T15:00:00.000Z",
      totalJobs: 2,
      pendingJobs: 0,
    });
    const capacity = deriveGlobalDailyApplicationPreparationCapacity({
      now: new Date("2026-03-08T16:00:00.000Z"),
      applyRuns: [legacyCounter],
      applyJobResults: [
        result({
          id: "known-unstarted",
          runId: legacyCounter.id,
          jobId: "job-1",
          state: "failed",
          preparationStartedAt: null,
          preparationStartedLocalDate: null,
        }),
      ],
    });
    expect(capacity).toMatchObject({
      used: 0,
      legacyUncertain: 0,
      remaining: 20,
    });
  });

  test("discounts an unopened employer page from begun daily capacity", () => {
    const current = run({
      id: "run-unreachable",
      campaignId: "campaign-current",
      createdAt: "2026-03-08T06:00:00.000Z",
    });
    // The preparation mark exists because the slot is stamped before the
    // browser launches, but the page never opened, so the begun slot is
    // refunded instead of silently consuming daily capacity.
    expect(
      deriveGlobalDailyApplicationPreparationCapacity({
        now: new Date("2026-03-08T16:00:00.000Z"),
        applyRuns: [current],
        applyJobResults: [
          result({
            id: "result-unreachable",
            runId: current.id,
            jobId: "job-1",
            state: "failed",
            blockerReason: "application_page_unreachable",
            preparationStartedAt: "2026-03-08T07:00:00.000Z",
            preparationStartedLocalDate: "2026-03-08",
          }),
          result({
            id: "result-begun",
            runId: current.id,
            jobId: "job-2",
            state: "failed",
            blockerReason: "required_human_input",
            preparationStartedAt: "2026-03-08T07:30:00.000Z",
            preparationStartedLocalDate: "2026-03-08",
          }),
        ],
      }),
    ).toMatchObject({ used: 1, legacyUncertain: 0, remaining: 19 });
  });

  test("computes the next local midnight across the DST fall-back day", () => {
    expect(
      deriveGlobalDailyApplicationPreparationCapacity({
        now: new Date("2026-11-01T05:30:00.000Z"),
        applyRuns: [],
        applyJobResults: [],
      }).resetsAt,
    ).toBe("2026-11-02T05:00:00.000Z");
  });
});
