import { describe, expect, test } from "vitest";
import { ApplicationRecordSchema } from "@unemployed/contracts";

import {
  buildApplicationCrmCalendarForView,
  groupApplicationRecordsByStage,
  inferApplicationCrmStageForView,
} from "./applications-crm-model";

function record(overrides: Record<string, unknown> = {}) {
  return ApplicationRecordSchema.parse({
    id: "application_1",
    jobId: "job_1",
    title: "Engineer",
    company: "Example",
    status: "submitted",
    lastActionLabel: "Applied manually",
    nextActionLabel: null,
    lastUpdatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  });
}

describe("application CRM renderer model", () => {
  test("maps old records without rewriting them", () => {
    expect(inferApplicationCrmStageForView(record())).toBe("applied");
    expect(record().crm).toBeNull();
  });

  test("groups records into all lifecycle columns", () => {
    const grouped = groupApplicationRecordsByStage([
      record(),
      record({ id: "application_2", jobId: "job_2", status: "interview" }),
    ]);
    expect(grouped.get("applied")).toHaveLength(1);
    expect(grouped.get("interview")).toHaveLength(1);
    expect(grouped.has("no_response")).toBe(true);
  });

  test("projects reminders, interviews, and offer deadlines", () => {
    const entries = buildApplicationCrmCalendarForView([
      record({
        crm: {
          stage: "offer",
          stageChangedAt: "2026-08-15T10:00:00.000Z",
          reminders: [
            {
              id: "reminder_1",
              title: "Follow up",
              dueAt: "2026-08-16T10:00:00.000Z",
              createdAt: "2026-08-15T10:00:00.000Z",
              updatedAt: "2026-08-15T10:00:00.000Z",
            },
          ],
          interviews: [
            {
              id: "interview_1",
              title: "Technical interview",
              startsAt: "2026-08-17T10:00:00.000Z",
              createdAt: "2026-08-15T10:00:00.000Z",
              updatedAt: "2026-08-15T10:00:00.000Z",
            },
          ],
          compensation: {
            offerDeadlineAt: "2026-08-18T10:00:00.000Z",
            offerStatus: "active",
          },
        },
      }),
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual([
      "reminder",
      "interview",
      "offer_deadline",
    ]);
  });
});
