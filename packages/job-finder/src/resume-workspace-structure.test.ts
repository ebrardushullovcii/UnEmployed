import { describe, expect, test } from "vitest";
import type { ResumeDraft } from "@unemployed/contracts";
import { buildResumeRenderDocument } from "./internal/resume-workspace-structure";
import { createSeed } from "./workspace-service.test-support";

describe("buildResumeRenderDocument", () => {
  test("renders experience entry metadata with tailored entry content", () => {
    const seed = createSeed();
    const profile = seed.profile;
    const draft: ResumeDraft = {
      id: "resume_draft_job_ready",
      jobId: "job_ready",
      status: "draft",
      templateId: "classic_ats",
      sections: [
        {
          id: "section_experience",
          kind: "experience",
          label: "Experience",
          text: null,
          bullets: [],
          entries: [
            {
              id: "experience_experience_1",
              entryType: "experience",
              title: "Senior systems designer",
              subtitle: "Signal Systems",
              location: "London, UK",
              dateRange: "2020-01 – Present",
              summary: "Tailored workflow platform summary.",
              bullets: [
                {
                  id: "experience_bullet_1",
                  text: "Tailored workflow platform impact.",
                  origin: "ai_generated",
                  locked: false,
                  included: true,
                  sourceRefs: [],
                  updatedAt: "2026-03-20T10:04:00.000Z",
                },
              ],
              origin: "ai_generated",
              locked: false,
              included: true,
              sortOrder: 0,
              profileRecordId: "experience_1",
              sourceRefs: [],
              updatedAt: "2026-03-20T10:04:00.000Z",
            },
          ],
          origin: "ai_generated",
          locked: false,
          included: true,
          sortOrder: 0,
          profileRecordId: null,
          sourceRefs: [],
          updatedAt: "2026-03-20T10:04:00.000Z",
        },
      ],
      targetPageCount: 2,
      generationMethod: "ai",
      approvedAt: null,
      approvedExportId: null,
      staleReason: null,
      createdAt: "2026-03-20T10:04:00.000Z",
      updatedAt: "2026-03-20T10:04:00.000Z",
    };

    const document = buildResumeRenderDocument(profile, draft);

    expect(document.sections[0]?.entries[0]).toEqual({
      id: "experience_experience_1",
      heading:
        "Senior systems designer — Signal Systems | London, UK | 2020-01 – Present",
      summary: "Tailored workflow platform summary.",
      bullets: ["Tailored workflow platform impact."],
    });
  });
});
