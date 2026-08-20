import { describe, expect, test } from "vitest";
import { ApplicationRecordSchema } from "@unemployed/contracts";
import type { ApplicationRecord } from "@unemployed/contracts";
import type { ApplicationRecordBatchCommitResult } from "@unemployed/db";

import {
  ApplicationCrmBulkStageRevisionConflictError,
  ApplicationCrmBulkStageValidationError,
  ApplicationCrmRevisionConflictError,
  buildApplicationCrmCalendar,
  exportApplicationCrm,
  findApplicationCrmDuplicateHints,
  getApplicationCrmData,
  mutateApplicationCrm,
  mutateApplicationCrmBulkStage,
  projectApplicationCrmDashboard,
  recommendApplicationCrmAction,
  runApplicationNoResponseAutomation,
} from "./application-crm";

function record(overrides: Record<string, unknown> = {}) {
  return ApplicationRecordSchema.parse({
    id: "application_1",
    jobId: "job_1",
    title: "Software Engineer",
    company: "Example Inc",
    status: "submitted",
    lastActionLabel: "Prepared",
    nextActionLabel: null,
    lastUpdatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  });
}

function repository(initial = [record()]) {
  let records = [...initial];
  return {
    listApplicationRecords: () => Promise.resolve(records),
    upsertApplicationRecord: (next: (typeof records)[number]) => {
      records = records.map((current) =>
        current.id === next.id ? next : current,
      );
      return Promise.resolve();
    },
    commitApplicationRecordBatch: ({
      expectedRevisions,
      records: next,
    }: {
      expectedRevisions: readonly {
        applicationRecordId: string;
        expectedRevision: number;
      }[];
      records: readonly ApplicationRecord[];
    }): Promise<ApplicationRecordBatchCommitResult> => {
      const currentById = new Map(
        records.map((current) => [current.id, current]),
      );
      const staleRecordIds = expectedRevisions
        .filter(
          ({ applicationRecordId, expectedRevision }) =>
            (currentById.get(applicationRecordId)?.crm?.revision ?? 0) !==
            expectedRevision,
        )
        .map(({ applicationRecordId }) => applicationRecordId);
      if (staleRecordIds.length > 0) {
        return Promise.resolve({
          status: "stale" as const,
          recordIds: staleRecordIds,
        });
      }
      records = records.map(
        (current) =>
          next.find((candidate) => candidate.id === current.id) ?? current,
      );
      return Promise.resolve({
        status: "applied" as const,
        committedRecordIds: expectedRevisions.map(
          ({ applicationRecordId }) => applicationRecordId,
        ),
      });
    },
    read: () => records,
  };
}

describe("application CRM service", () => {
  test("maps legacy records into truthful CRM stages", () => {
    expect(getApplicationCrmData(record()).stage).toBe("applied");
    expect(
      getApplicationCrmData(
        record({ status: "ready_for_review", lastAttemptState: "paused" }),
      ).stage,
    ).toBe("ready_for_approval");
  });

  test("persists manual stage changes without granting submit authority", async () => {
    const repo = repository();
    const updated = await mutateApplicationCrm({
      repository: repo,
      command: {
        applicationRecordId: "application_1",
        expectedRevision: 0,
        mutation: {
          type: "set_stage",
          stage: "recruiter_contact",
          customStageId: null,
          note: "Recruiter emailed me.",
        },
      },
      now: () => "2026-08-15T10:00:00.000Z",
      createId: () => "event_1",
    });

    expect(updated.crm).toMatchObject({
      revision: 1,
      stage: "recruiter_contact",
      lastEmployerActivityAt: "2026-08-15T10:00:00.000Z",
    });
    expect(updated.status).toBe("submitted");
    expect(updated).not.toHaveProperty("submitAuthorized");
    expect(updated.lastAttemptState).toBeNull();
    expect(repo.read()[0]?.crm?.events[0]?.source).toBe("user");
  });

  test("commits a bulk stage change once and updates every selected record", async () => {
    const repo = repository([
      record(),
      record({
        id: "application_2",
        jobId: "job_2",
        title: "Backend Engineer",
      }),
    ]);
    let commitCalls = 0;
    const commit = repo.commitApplicationRecordBatch;
    repo.commitApplicationRecordBatch = async (input) => {
      commitCalls += 1;
      return commit(input);
    };

    const updated = await mutateApplicationCrmBulkStage({
      repository: repo,
      command: {
        items: [
          { applicationRecordId: "application_1", expectedRevision: 0 },
          { applicationRecordId: "application_2", expectedRevision: 0 },
        ],
        stage: "reviewing",
        customStageId: null,
        note: "Reviewed together.",
      },
      now: () => "2026-08-15T10:00:00.000Z",
      createId: (() => {
        let index = 0;
        return () => `event_${++index}`;
      })(),
    });

    expect(commitCalls).toBe(1);
    expect(updated.map((entry) => entry.crm?.stage)).toEqual([
      "reviewing",
      "reviewing",
    ]);
    expect(repo.read().map((entry) => entry.crm?.revision)).toEqual([1, 1]);
  });

  test("rejects missing and stale bulk records before any partial write", async () => {
    const repo = repository([
      record({
        crm: {
          revision: 3,
          stage: "applied",
          stageChangedAt: "2026-08-15T10:00:00.000Z",
        },
      }),
    ]);
    await expect(
      mutateApplicationCrmBulkStage({
        repository: repo,
        command: {
          items: [
            { applicationRecordId: "application_1", expectedRevision: 3 },
            { applicationRecordId: "missing", expectedRevision: 0 },
          ],
          stage: "reviewing",
        },
      }),
    ).rejects.toBeInstanceOf(ApplicationCrmBulkStageValidationError);
    expect(repo.read()[0]?.crm?.stage).toBe("applied");

    await expect(
      mutateApplicationCrmBulkStage({
        repository: repo,
        command: {
          items: [
            { applicationRecordId: "application_1", expectedRevision: 2 },
          ],
          stage: "reviewing",
        },
      }),
    ).rejects.toBeInstanceOf(ApplicationCrmBulkStageRevisionConflictError);
    expect(repo.read()[0]?.crm?.stage).toBe("applied");
  });

  test("manual applied tracking never invents browser submission evidence", async () => {
    const repo = repository([record({ status: "approved" })]);
    const updated = await mutateApplicationCrm({
      repository: repo,
      command: {
        applicationRecordId: "application_1",
        expectedRevision: 0,
        mutation: {
          type: "set_stage",
          stage: "applied",
          customStageId: null,
          note: "I applied outside the app.",
        },
      },
      now: () => "2026-08-15T10:00:00.000Z",
      createId: () => "event_1",
    });

    expect(updated.status).toBe("approved");
    expect(updated.lastAttemptState).toBeNull();
    expect(updated.crm?.stage).toBe("applied");
    expect(updated.crm?.appliedAt).toBe("2026-08-15T10:00:00.000Z");
    expect(updated).not.toHaveProperty("submittedAt");
    expect(updated).not.toHaveProperty("submitAuthorized");
  });

  test("rejects stale editors", async () => {
    const repo = repository([
      record({
        crm: {
          revision: 2,
          stage: "reviewing",
          stageChangedAt: "2026-08-15T10:00:00.000Z",
        },
      }),
    ]);
    await expect(
      mutateApplicationCrm({
        repository: repo,
        command: {
          applicationRecordId: "application_1",
          expectedRevision: 1,
          mutation: { type: "set_tags", tags: ["priority"] },
        },
      }),
    ).rejects.toBeInstanceOf(ApplicationCrmRevisionConflictError);
  });

  test("marks only old applied applications as no response and takes no external action", async () => {
    const repo = repository([
      record({
        crm: {
          stage: "applied",
          stageChangedAt: "2026-08-01T10:00:00.000Z",
          appliedAt: "2026-08-01T10:00:00.000Z",
        },
      }),
      record({
        id: "application_2",
        jobId: "job_2",
        crm: {
          stage: "interview",
          stageChangedAt: "2026-08-01T10:00:00.000Z",
          appliedAt: "2026-08-01T10:00:00.000Z",
        },
      }),
    ]);
    const updated = await runApplicationNoResponseAutomation({
      repository: repo,
      settings: {
        noResponseAutomation: { enabled: true, afterDays: 14 },
        customStages: [],
      },
      now: () => "2026-08-15T10:01:00.000Z",
      createId: () => "automation_event_1",
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]?.crm?.stage).toBe("no_response");
    expect(updated[0]?.status).toBe("submitted");
    expect(updated[0]?.crm?.events.at(-1)?.detail).toContain(
      "No external action was taken",
    );
    expect(repo.read()[1]?.crm?.stage).toBe("interview");
  });

  test("no-response automation preserves a non-submitted preparation status", async () => {
    const repo = repository([
      record({
        status: "approved",
        crm: {
          stage: "applied",
          stageChangedAt: "2026-08-01T10:00:00.000Z",
          appliedAt: "2026-08-01T10:00:00.000Z",
        },
      }),
    ]);
    const [updated] = await runApplicationNoResponseAutomation({
      repository: repo,
      now: () => "2026-08-16T10:00:00.000Z",
    });
    expect(updated?.status).toBe("approved");
    expect(updated?.crm?.stage).toBe("no_response");
    expect(updated).not.toHaveProperty("submittedAt");
  });

  test("projects calendar work, duplicate hints, and one recommended action", () => {
    const records = [
      record({
        crm: {
          stage: "applied",
          stageChangedAt: "2026-08-01T10:00:00.000Z",
          reminders: [
            {
              id: "reminder_1",
              title: "Follow up",
              dueAt: "2026-08-15T09:00:00.000Z",
              createdAt: "2026-08-01T10:00:00.000Z",
              updatedAt: "2026-08-01T10:00:00.000Z",
            },
          ],
          contacts: [
            {
              id: "contact_1",
              name: "Recruiter",
              email: "same@example.com",
              createdAt: "2026-08-01T10:00:00.000Z",
              updatedAt: "2026-08-01T10:00:00.000Z",
            },
          ],
        },
      }),
      record({
        id: "application_2",
        jobId: "job_2",
        company: "Example LLC",
        crm: {
          stage: "reviewing",
          stageChangedAt: "2026-08-01T10:00:00.000Z",
          contacts: [
            {
              id: "contact_2",
              name: "Recruiter",
              email: "same@example.com",
              createdAt: "2026-08-01T10:00:00.000Z",
              updatedAt: "2026-08-01T10:00:00.000Z",
            },
          ],
        },
      }),
    ];

    expect(buildApplicationCrmCalendar(records)).toHaveLength(1);
    expect(
      findApplicationCrmDuplicateHints(records).map((hint) => hint.kind),
    ).toEqual(["employer", "contact"]);
    expect(
      recommendApplicationCrmAction({
        records,
        now: "2026-08-15T10:00:00.000Z",
      })?.kind,
    ).toBe("overdue_reminder");
  });

  test("exports deterministic local JSON and escaped CSV", () => {
    const records = [record({ company: 'Example, "Labs"' })];
    const json = exportApplicationCrm({
      records,
      request: { format: "json", applicationRecordIds: [] },
      exportedAt: "2026-08-15T10:00:00.000Z",
    });
    const csv = exportApplicationCrm({
      records,
      request: { format: "csv", applicationRecordIds: [] },
      exportedAt: "2026-08-15T10:00:00.000Z",
    });

    const parsed = JSON.parse(json.content) as { applications: unknown[] };
    expect(parsed.applications).toHaveLength(1);
    expect(csv.content).toContain('"Example, ""Labs"""');
    expect(csv.exportedCount).toBe(1);
  });

  test("builds truthful dashboard metrics only after enough applied records exist", () => {
    const records = Array.from({ length: 5 }, (_, index) =>
      record({
        id: `application_${index}`,
        jobId: `job_${index}`,
        crm: {
          stage: index < 2 ? "interview" : "applied",
          stageChangedAt: "2026-08-15T10:00:00.000Z",
          appliedAt: "2026-08-15T09:00:00.000Z",
        },
      }),
    );
    const projection = projectApplicationCrmDashboard({
      records,
      now: "2026-08-15T10:00:00.000Z",
    });
    expect(projection.appliedToday).toBe(5);
    expect(projection.appliedThisWeek).toBe(5);
    expect(projection.responseRate).toBe(40);
    expect(projection.interviewRate).toBe(40);
    expect(projection.rateDenominator).toBe(5);
    expect(
      projectApplicationCrmDashboard({ records: records.slice(0, 4) })
        .responseRate,
    ).toBeNull();
  });

  test("a no-op set_stage returns the existing record without upsert or revision bump", async () => {
    const repo = repository([
      record({
        crm: {
          revision: 4,
          stage: "interview",
          stageChangedAt: "2026-08-10T10:00:00.000Z",
          appliedAt: "2026-08-01T10:00:00.000Z",
        },
      }),
    ]);
    let upsertCalls = 0;
    const originalUpsert = repo.upsertApplicationRecord;
    repo.upsertApplicationRecord = async (next) => {
      upsertCalls += 1;
      await originalUpsert(next);
    };
    const existing = repo.read()[0];

    const updated = await mutateApplicationCrm({
      repository: repo,
      command: {
        applicationRecordId: "application_1",
        expectedRevision: 4,
        mutation: {
          type: "set_stage",
          stage: "interview",
          customStageId: null,
          note: "No actual change.",
        },
      },
      now: () => "2026-08-15T10:00:00.000Z",
      createId: () => "event_1",
    });

    expect(upsertCalls).toBe(0);
    expect(updated).toBe(existing);
    expect(updated.crm?.revision).toBe(4);
    expect(updated.crm?.stage).toBe("interview");
    expect(updated.crm?.events).toHaveLength(0);
    expect(updated.lastUpdatedAt).toBe("2026-08-01T10:00:00.000Z");
    expect(updated.lastActionLabel).toBe("Prepared");
  });

  test("CSV export neutralizes spreadsheet formulas in title, company, and tags", () => {
    const csv = exportApplicationCrm({
      records: [
        record({
          title: '=HYPERLINK("http://evil.example")',
          company: "+Example Inc",
          crm: {
            stage: "applied",
            stageChangedAt: "2026-08-01T10:00:00.000Z",
            tags: ["@priority", "urgent"],
          },
        }),
        record({
          id: "application_2",
          jobId: "job_2",
          company: "-Example LLC",
          crm: {
            stage: "applied",
            stageChangedAt: "2026-08-01T10:00:00.000Z",
            tags: ["-followup"],
          },
        }),
      ],
      request: { format: "csv", applicationRecordIds: [] },
      exportedAt: "2026-08-15T10:00:00.000Z",
    });

    expect(csv.exportedCount).toBe(2);
    expect(csv.content).toContain("'=HYPERLINK(");
    expect(csv.content).toContain("'+Example Inc");
    expect(csv.content).toContain("'@priority; urgent");
    expect(csv.content).toContain("'-Example LLC");
    expect(csv.content).toContain("'-followup");
    const dataRow = csv.content.split("\r\n")[1] ?? "";
    expect(dataRow.startsWith('application_1,job_1,"')).toBe(true);
    expect(dataRow).toContain('"\'=HYPERLINK(""http://evil.example"")"');
  });

  test("set_tags dedup is case-insensitive and locale-independent", async () => {
    const repo = repository();
    const updated = await mutateApplicationCrm({
      repository: repo,
      command: {
        applicationRecordId: "application_1",
        expectedRevision: 0,
        mutation: {
          type: "set_tags",
          tags: ["Priority", "PRIORITY", "priority", "  Priority  "],
        },
      },
      now: () => "2026-08-15T10:00:00.000Z",
      createId: () => "event_1",
    });

    // Dedup must use default Unicode case folding, never the runtime locale:
    // a Turkish-locale fold maps "PRIORITY" to "prıorıty" and would fail to
    // recognize it as a duplicate of "priority".
    expect("PRIORITY".toLowerCase()).toBe("priority");
    expect("PRIORITY".toLocaleLowerCase("tr")).not.toBe("priority");
    expect(updated.crm?.tags).toEqual(["Priority"]);
    expect(updated.crm?.events.at(-1)?.detail).toBe("Priority");
  });
});
