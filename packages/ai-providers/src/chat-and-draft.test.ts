import { describe, expect, test } from "vitest";
import {
  buildDeterministicStructuredResumeDraft,
  createOpenAiCompatibleJobFinderAiClient,
  createJobFinderAiClientFromEnvironment,
} from "./index";
import type { ProfileCopilotRelevantReviewItem } from "@unemployed/contracts";
import {
  createEnvironment,
  createJobPosting,
  createPreferences,
  createProfile,
  createSettings,
  mockCapturingJsonFetch,
  mockJsonFetch,
} from "./test-fixtures";

describe("openai-compatible chat and draft behavior", () => {
  test("ignores model tool calls that were not offered in the request", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "unexpected_tool",
                  arguments: "{}",
                },
              },
            ],
          },
        },
      ],
    });

    try {
      const client = createOpenAiCompatibleJobFinderAiClient({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
        label: "AI resume agent",
      });

      const result = await client.chatWithTools(
        [{ role: "user", content: "hello" }],
        [
          {
            type: "function",
            function: {
              name: "expected_tool",
              description: "Expected tool",
              parameters: {
                type: "object",
                properties: {},
                required: [],
              },
            },
          },
        ],
        { maxOutputTokens: 42 },
      );

      expect(result.toolCalls).toBeUndefined();
    } finally {
      restoreFetch();
    }
  });

  test("fills missing structured draft fields with deterministic fallback content", async () => {
    const draftPayload = {
      label: "Tailored Resume",
      coreSkills: ["React"],
      notes: ["Model draft partial"],
    };
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify(draftPayload),
          },
        },
      ],
    });

    try {
      const client = createOpenAiCompatibleJobFinderAiClient({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      });

      const input = {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: "Resume text",
        evidence: {
          summary: ["Grounded summary"],
          candidateSummary: ["Candidate summary"],
          experience: ["Built reliable interfaces"],
          skills: ["React"],
          keywords: ["TypeScript"],
        },
        researchContext: {
          companyNotes: ["Company note"],
          domainVocabulary: ["workflow"],
          priorityThemes: ["systems"],
        },
      } satisfies Parameters<typeof client.createResumeDraft>[0];

      const result = await client.createResumeDraft(input);
      const deterministicFallback =
        buildDeterministicStructuredResumeDraft(input);

      expect(result.label).toBe("Tailored Resume");
      expect(result.summary).toBe(deterministicFallback.summary);
      expect(result.experienceHighlights).toEqual(
        deterministicFallback.experienceHighlights,
      );
      expect(result.experienceEntries).toEqual(
        deterministicFallback.experienceEntries,
      );
      expect(result.educationEntries).toEqual(
        deterministicFallback.educationEntries,
      );
      expect(result.additionalSkills).toEqual(
        deterministicFallback.additionalSkills,
      );
      expect(result.fullText).toContain(result.label ?? "");
      expect(result.fullText).toContain(result.summary);
      expect(result.fullText).toContain("Core skills: React");
      expect(result.fullText).toContain(
        "Targeted keywords: TypeScript, workflow, systems, React",
      );
      expect(result.compatibilityScore).toBe(
        deterministicFallback.compatibilityScore,
      );
      expect(result.notes).toEqual(
        expect.arrayContaining([
          "Model draft partial",
          ...deterministicFallback.notes,
        ]),
      );
    } finally {
      restoreFetch();
    }
  });

  test("backfills profile metadata on model-supplied experience entries", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              label: "Tailored Resume",
              summary: "Tailored summary",
              experienceHighlights: ["Tailored highlight"],
              experienceEntries: [
                {
                  summary: "Tailored platform ownership summary",
                  bullets: ["Tailored platform ownership impact"],
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client = createOpenAiCompatibleJobFinderAiClient({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      });
      const input = {
        profile: {
          ...createProfile(),
          experiences: [
            {
              id: "experience_acme",
              companyName: "Acme Labs",
              companyUrl: null,
              title: "Senior Frontend Engineer",
              employmentType: null,
              location: "Remote",
              workMode: ["remote"],
              startDate: "2020-01",
              endDate: null,
              isCurrent: true,
              isDraft: false,
              summary: "Built platform foundations.",
              achievements: ["Improved deployment reliability."],
              skills: [],
              domainTags: [],
              peopleManagementScope: null,
              ownershipScope: null,
            },
          ],
        },
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: "Resume text",
        evidence: {
          summary: ["Grounded summary"],
          candidateSummary: ["Candidate summary"],
          experience: ["Built reliable interfaces"],
          skills: ["React"],
          keywords: ["TypeScript"],
        },
        researchContext: {
          companyNotes: [],
          domainVocabulary: [],
          priorityThemes: [],
        },
      } satisfies Parameters<typeof client.createResumeDraft>[0];

      const result = await client.createResumeDraft(input);
      const deterministicFallback =
        buildDeterministicStructuredResumeDraft(input);

      expect(result.experienceEntries[0]).toEqual({
        ...deterministicFallback.experienceEntries[0],
        summary: "Tailored platform ownership summary",
        bullets: ["Tailored platform ownership impact"],
      });
      expect(result.fullText).toContain("Senior Frontend Engineer");
      expect(result.fullText).toContain("Acme Labs");
      expect(result.fullText).toContain(
        deterministicFallback.experienceEntries[0]?.dateRange ?? "",
      );
    } finally {
      restoreFetch();
    }
  });

  test("compacts oversized resume assistant payloads before sending them to the model", async () => {
    const fetchMock = mockCapturingJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: "No changes applied.",
              patches: [],
            }),
          },
        },
      ],
    });

    try {
      const client = createOpenAiCompatibleJobFinderAiClient({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      });
      const oversizedRequest = `please improve this draft ${"grounded request detail ".repeat(5000)}`;

      await client.reviseResumeDraft({
        draft: {
          id: "draft_1",
          jobId: "job_1",
          status: "draft",
          templateId: "classic_ats",
          identity: null,
          sections: Array.from({ length: 12 }, (_, sectionIndex) => ({
            id: `section_${sectionIndex + 1}`,
            kind: "experience",
            label: `Section ${sectionIndex + 1}`,
            text: null,
            bullets: Array.from({ length: 12 }, (_, bulletIndex) => ({
              id: `section_bullet_${sectionIndex + 1}_${bulletIndex + 1}`,
              text: `Section bullet ${bulletIndex + 1} ${"resume detail ".repeat(120)}`,
              origin: "ai_generated",
              locked: false,
              included: true,
              sourceRefs: [],
              updatedAt: "2026-03-20T10:00:00.000Z",
            })),
            entries: Array.from({ length: 10 }, (_, entryIndex) => ({
              id: `entry_${sectionIndex + 1}_${entryIndex + 1}`,
              entryType: "experience",
              title: `Entry ${entryIndex + 1}`,
              subtitle: `Company ${entryIndex + 1}`,
              location: "Remote",
              dateRange: "2020 - Present",
              summary: `Entry summary ${"grounded detail ".repeat(160)}`,
              bullets: Array.from({ length: 10 }, (_, nestedBulletIndex) => ({
                id: `entry_bullet_${sectionIndex + 1}_${entryIndex + 1}_${nestedBulletIndex + 1}`,
                text: `Nested bullet ${nestedBulletIndex + 1} ${"impact detail ".repeat(120)}`,
                origin: "ai_generated",
                locked: false,
                included: true,
                sourceRefs: [],
                updatedAt: "2026-03-20T10:00:00.000Z",
              })),
              origin: "ai_generated",
              locked: false,
              included: true,
              sortOrder: entryIndex,
              profileRecordId: null,
              sourceRefs: [],
              updatedAt: "2026-03-20T10:00:00.000Z",
            })),
            origin: "ai_generated",
            locked: false,
            included: true,
            sortOrder: sectionIndex,
            profileRecordId: null,
            sourceRefs: [],
            updatedAt: "2026-03-20T10:00:00.000Z",
          })),
          targetPageCount: 2,
          generationMethod: "ai",
          approvedAt: null,
          approvedExportId: null,
          staleReason: null,
          createdAt: "2026-03-20T10:00:00.000Z",
          updatedAt: "2026-03-20T10:00:00.000Z",
        },
        job: createJobPosting(),
        request: oversizedRequest,
        validationIssues: Array.from(
          { length: 20 },
          (_, index) => `Validation issue ${index + 1} ${"detail ".repeat(80)}`,
        ),
        researchContext: {
          companyNotes: Array.from(
            { length: 20 },
            (_, index) => `Company note ${index + 1} ${"context ".repeat(80)}`,
          ),
          domainVocabulary: Array.from(
            { length: 20 },
            (_, index) => `Vocabulary ${index + 1} ${"term ".repeat(40)}`,
          ),
          priorityThemes: Array.from(
            { length: 20 },
            (_, index) => `Theme ${index + 1} ${"priority ".repeat(40)}`,
          ),
        },
      });

      const body = JSON.parse(fetchMock.getCapturedBody()) as {
        messages?: Array<{ content?: string }>;
      };
      const userPayload = JSON.parse(body.messages?.[1]?.content ?? "{}") as {
        request?: string;
        draft?: { sections?: unknown[] };
        validationIssues?: unknown[];
      };

      expect(userPayload.request?.length ?? 0).toBeLessThan(
        oversizedRequest.length,
      );
      expect(userPayload.request).toContain("please improve this draft");
      expect(userPayload.request).toContain("[truncated");
      expect(userPayload.draft?.sections?.length).toBeLessThan(12);
      expect(userPayload.validationIssues?.length ?? 0).toBeLessThanOrEqual(12);
    } finally {
      fetchMock.restore();
    }
  });

  test("compacts oversized draft-creation payloads before sending them to the model", async () => {
    const fetchMock = mockCapturingJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              label: "Tailored Resume",
              summary: "Short summary",
              experienceHighlights: ["Highlight"],
            }),
          },
        },
      ],
    });

    try {
      const client = createOpenAiCompatibleJobFinderAiClient({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      });

      await client.createResumeDraft({
        profile: {
          ...createProfile(),
          summary: `Profile summary ${"experience ".repeat(5000)}`,
        },
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: {
          ...createJobPosting(),
          description: `Job description ${"requirement ".repeat(5000)}`,
          responsibilities: Array.from(
            { length: 20 },
            (_, index) => `Responsibility ${index + 1} ${"detail ".repeat(80)}`,
          ),
          minimumQualifications: Array.from(
            { length: 20 },
            (_, index) =>
              `Minimum qualification ${index + 1} ${"detail ".repeat(80)}`,
          ),
          preferredQualifications: Array.from(
            { length: 20 },
            (_, index) =>
              `Preferred qualification ${index + 1} ${"detail ".repeat(80)}`,
          ),
        },
        resumeText: `Resume text ${"history ".repeat(8000)}`,
        evidence: {
          summary: Array.from(
            { length: 20 },
            (_, index) =>
              `Summary evidence ${index + 1} ${"detail ".repeat(80)}`,
          ),
          candidateSummary: Array.from(
            { length: 20 },
            (_, index) =>
              `Candidate summary ${index + 1} ${"detail ".repeat(80)}`,
          ),
          experience: Array.from(
            { length: 20 },
            (_, index) =>
              `Experience evidence ${index + 1} ${"detail ".repeat(80)}`,
          ),
          skills: Array.from(
            { length: 20 },
            (_, index) => `Skill ${index + 1} ${"detail ".repeat(40)}`,
          ),
          keywords: Array.from(
            { length: 20 },
            (_, index) => `Keyword ${index + 1} ${"detail ".repeat(40)}`,
          ),
        },
        researchContext: {
          companyNotes: Array.from(
            { length: 20 },
            (_, index) => `Company note ${index + 1} ${"detail ".repeat(80)}`,
          ),
          domainVocabulary: Array.from(
            { length: 20 },
            (_, index) => `Vocabulary ${index + 1} ${"detail ".repeat(40)}`,
          ),
          priorityThemes: Array.from(
            { length: 20 },
            (_, index) => `Theme ${index + 1} ${"detail ".repeat(40)}`,
          ),
        },
      });

      const body = JSON.parse(fetchMock.getCapturedBody()) as {
        messages?: Array<{ content?: string }>;
      };
      const userPayload = JSON.parse(body.messages?.[1]?.content ?? "{}") as {
        resumeText?: string;
        evidence?: { summary?: unknown[] };
        researchContext?: { companyNotes?: unknown[] };
        job?: { description?: string };
      };

      expect(userPayload.resumeText?.length ?? 0).toBeLessThan(
        `Resume text ${"history ".repeat(8000)}`.length,
      );
      expect(userPayload.resumeText).toContain("[truncated");
      expect(Array.isArray(userPayload.evidence?.summary)).toBe(true);
      expect(Array.isArray(userPayload.researchContext?.companyNotes)).toBe(
        true,
      );
      expect(userPayload.job?.description?.length ?? 0).toBeLessThan(
        `Job description ${"requirement ".repeat(5000)}`.length,
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("compacts oversized profile copilot payloads before sending them to the model", async () => {
    const fetchMock = mockCapturingJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: "No profile edits proposed.",
              patchGroups: [],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());
      const request = `change my experience to only 5 years ${"conversation fact ".repeat(5000)}`;

      await client.reviseCandidateProfile({
        profile: {
          ...createProfile(),
          summary: `Candidate summary ${"background ".repeat(4000)}`,
        },
        searchPreferences: {
          ...createPreferences(),
          targetRoles: Array.from(
            { length: 20 },
            (_, index) => `Role ${index + 1} ${"detail ".repeat(40)}`,
          ),
          locations: Array.from(
            { length: 20 },
            (_, index) => `Location ${index + 1} ${"detail ".repeat(40)}`,
          ),
        },
        context: { surface: "profile", section: "preferences" },
        relevantReviewItems: Array.from({ length: 20 }, (_, index) => ({
          id: `review_${index + 1}`,
          step: "essentials",
          target: { domain: "identity", key: "headline", recordId: null },
          label: `Review item ${index + 1}`,
          reason: `Reason ${index + 1} ${"detail ".repeat(60)}`,
          severity: "recommended",
          status: "pending",
          proposedValue: `Proposed ${index + 1}`,
          sourceSnippet: `Snippet ${index + 1} ${"source ".repeat(40)}`,
          sourceCandidateId: `candidate_${index + 1}`,
          sourceRunId: `run_${index + 1}`,
          createdAt: "2026-04-14T10:00:00.000Z",
          resolvedAt: null,
        })),
        request,
        conversationFacts: Array.from(
          { length: 20 },
          (_, index) => `Fact ${index + 1} ${"detail ".repeat(80)}`,
        ),
      });

      const body = JSON.parse(fetchMock.getCapturedBody()) as {
        messages?: Array<{ content?: string }>;
      };
      const userPayload = JSON.parse(body.messages?.[1]?.content ?? "{}") as {
        request?: string;
        conversationFacts?: unknown[];
        relevantReviewItems?: unknown[];
      };

      expect(userPayload.request?.length ?? 0).toBeLessThan(request.length);
      expect(userPayload.request).toContain(
        "change my experience to only 5 years",
      );
      expect(Array.isArray(userPayload.conversationFacts)).toBe(true);
      expect(Array.isArray(userPayload.relevantReviewItems)).toBe(true);
    } finally {
      fetchMock.restore();
    }
  });

  test("compacts 200k-token-class profile copilot payloads before provider submission", async () => {
    const fetchMock = mockCapturingJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: "Large request accepted.",
              patchGroups: [],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());
      const massiveContext = "very long context detail ".repeat(70_000);
      const request = `change my experience to only 5 years ${massiveContext}`;
      const conversationFacts = Array.from(
        { length: 120 },
        (_, index) => `Fact ${index + 1} ${"supporting detail ".repeat(120)}`,
      );
      const relevantReviewItems: ProfileCopilotRelevantReviewItem[] =
        Array.from({ length: 120 }, (_, index) => ({
          id: `review_extreme_${index + 1}`,
          step: "essentials",
          target: { domain: "identity", key: "headline", recordId: null },
          label: `Extreme review item ${index + 1}`,
          reason: `Reason ${index + 1} ${"detail ".repeat(120)}`,
          severity: "recommended",
          status: "pending",
          proposedValue: `Proposed ${index + 1}`,
          sourceSnippet: `Snippet ${index + 1} ${"source ".repeat(80)}`,
          sourceCandidateId: `candidate_extreme_${index + 1}`,
          sourceRunId: `run_extreme_${index + 1}`,
          createdAt: "2026-04-14T10:00:00.000Z",
          resolvedAt: null,
        }));
      const largePayload = {
        profile: {
          ...createProfile(),
          summary: `Candidate summary ${"background ".repeat(80_000)}`,
        },
        searchPreferences: {
          ...createPreferences(),
          targetRoles: Array.from(
            { length: 120 },
            (_, index) => `Role ${index + 1} ${"detail ".repeat(80)}`,
          ),
          locations: Array.from(
            { length: 120 },
            (_, index) => `Location ${index + 1} ${"detail ".repeat(80)}`,
          ),
        },
        context: { surface: "profile", section: "preferences" },
        relevantReviewItems,
        request,
        conversationFacts,
      } satisfies Parameters<typeof client.reviseCandidateProfile>[0];
      const originalPayloadSize = JSON.stringify(largePayload).length;

      expect(originalPayloadSize).toBeGreaterThan(1_000_000);

      await client.reviseCandidateProfile(largePayload);

      const body = JSON.parse(fetchMock.getCapturedBody()) as {
        messages?: Array<{ content?: string }>;
      };
      const providerUserContent = body.messages?.[1]?.content ?? "";
      const compactedPayload = JSON.parse(providerUserContent) as {
        request?: string;
        conversationFacts?: unknown[];
        relevantReviewItems?: unknown[];
      };

      expect(providerUserContent.length).toBeLessThan(500_000);
      expect(providerUserContent.length).toBeLessThan(originalPayloadSize);
      expect(compactedPayload.request).toContain(
        "change my experience to only 5 years",
      );
      expect(compactedPayload.request).toContain("[truncated");
      expect(Array.isArray(compactedPayload.conversationFacts)).toBe(true);
      expect(Array.isArray(compactedPayload.relevantReviewItems)).toBe(true);
    } finally {
      fetchMock.restore();
    }
  });
});
