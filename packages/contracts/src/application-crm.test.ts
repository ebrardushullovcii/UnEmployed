import { describe, expect, test } from "vitest";

import {
  ApplicationCrmBulkStageMutationInputSchema,
  ApplicationCrmDataSchema,
  ApplicationCrmMutationInputSchema,
  ApplicationCrmSettingsSchema,
} from "./application-crm";
import { ApplicationRecordSchema } from "./discovery";

describe("application CRM contracts", () => {
  test("keeps legacy application records readable without inventing CRM history", () => {
    const record = ApplicationRecordSchema.parse({
      id: "application_1",
      jobId: "job_1",
      title: "Software Engineer",
      company: "Example",
      status: "submitted",
      lastActionLabel: "Prepared",
      nextActionLabel: null,
      lastUpdatedAt: "2026-08-15T10:00:00.000Z",
    });

    expect(record.crm).toBeNull();
  });

  test("parses the complete local CRM data without storing attachment bytes", () => {
    const crm = ApplicationCrmDataSchema.parse({
      stage: "interview",
      stageChangedAt: "2026-08-15T10:00:00.000Z",
      tags: ["priority", "remote"],
      contacts: [
        {
          id: "contact_1",
          name: "Recruiter",
          email: "recruiter@example.com",
          createdAt: "2026-08-15T10:00:00.000Z",
          updatedAt: "2026-08-15T10:00:00.000Z",
        },
      ],
      attachments: [
        {
          id: "attachment_1",
          candidateAssetId: "asset_1",
          label: "Approved resume",
          kind: "resume",
          addedAt: "2026-08-15T10:00:00.000Z",
        },
      ],
    });

    expect(crm.stage).toBe("interview");
    expect(crm.attachments[0]).not.toHaveProperty("filePath");
    expect(crm.attachments[0]).not.toHaveProperty("bytes");
  });

  test("defaults no-response automation to fourteen days", () => {
    expect(ApplicationCrmSettingsSchema.parse({}).noResponseAutomation).toEqual(
      { enabled: true, afterDays: 14 },
    );
  });

  test("rejects stale or negative mutation revisions at the boundary", () => {
    expect(() =>
      ApplicationCrmMutationInputSchema.parse({
        applicationRecordId: "application_1",
        expectedRevision: -1,
        mutation: { type: "set_tags", tags: ["priority"] },
      }),
    ).toThrow();
  });

  test("requires unique revision-guarded records for bulk stage changes", () => {
    expect(() =>
      ApplicationCrmBulkStageMutationInputSchema.parse({
        items: [
          { applicationRecordId: "application_1", expectedRevision: 0 },
          { applicationRecordId: "application_1", expectedRevision: 0 },
        ],
        stage: "reviewing",
      }),
    ).toThrow();

    expect(
      ApplicationCrmBulkStageMutationInputSchema.parse({
        items: [{ applicationRecordId: "application_1", expectedRevision: 2 }],
        stage: "reviewing",
      }),
    ).toMatchObject({
      customStageId: null,
      note: null,
    });
  });
});
