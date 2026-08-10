import { describe, expect, test } from "vitest";

import {
  createAiClient,
  createDocumentManager,
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";
import {
  createStageCandidate,
  createTestBundle,
  listLatestRunCandidates,
} from "./workspace-service.resume-analysis.shared";

describe("createJobFinderWorkspaceService resume import resilience", () => {
  test.each(["rejects asynchronously", "throws synchronously"] as const)(
    "keeps successful text stages when one resume import stage $failureMode",
    async (failureMode) => {
      const seed = createSeed();
      const baseClient = createAiClient();
      const fullText = [
        "Stage Recovery Candidate",
        "Reliability Engineer",
        "Built resilient import pipelines at Recovery Labs from 2022 to present.",
        "TypeScript PostgreSQL",
      ].join("\n");
      const { repository, workspaceService } = createWorkspaceServiceHarness({
        seed,
        aiClient: {
          ...baseClient,
          extractResumeImportStage(input) {
            if (input.stage === "shared_memory") {
              if (failureMode === "throws synchronously") {
                throw new Error(
                  "shared-memory extraction provider unavailable",
                );
              }

              return Promise.reject(
                new Error("shared-memory extraction provider unavailable"),
              );
            }

            if (input.stage === "identity_summary") {
              return Promise.resolve({
                stage: input.stage,
                analysisProviderKind: "openai_compatible",
                analysisProviderLabel: "Partial-stage test AI",
                candidates: [
                  createStageCandidate({
                    target: {
                      section: "identity",
                      key: "fullName",
                      recordId: null,
                    },
                    label: "Full name",
                    value: "Stage Recovery Candidate",
                    sourceBlockIds: ["page_1_block_1"],
                    confidence: 0.9,
                  }),
                ],
                notes: ["identity stage completed"],
              });
            }

            if (input.stage === "experience") {
              return Promise.resolve({
                stage: input.stage,
                analysisProviderKind: "openai_compatible",
                analysisProviderLabel: "Partial-stage test AI",
                candidates: [
                  createStageCandidate({
                    target: {
                      section: "experience",
                      key: "record",
                      recordId: "experience_stage_recovery",
                    },
                    label: "Reliability Engineer at Recovery Labs",
                    value: {
                      companyName: "Recovery Labs",
                      companyUrl: null,
                      title: "Reliability Engineer",
                      employmentType: null,
                      location: null,
                      workMode: [],
                      startDate: "2022",
                      endDate: null,
                      isCurrent: true,
                      isDraft: false,
                      summary: "Built resilient import pipelines.",
                      achievements: [
                        "Kept successful extraction stages available for review.",
                      ],
                      skills: ["TypeScript", "PostgreSQL"],
                      domainTags: [],
                      peopleManagementScope: null,
                      ownershipScope: null,
                    },
                    sourceBlockIds: ["page_1_block_3"],
                    confidence: 0.88,
                  }),
                ],
                notes: ["experience stage completed"],
              });
            }

            return Promise.resolve({
              stage: input.stage,
              analysisProviderKind: "openai_compatible",
              analysisProviderLabel: "Partial-stage test AI",
              candidates: [
                createStageCandidate({
                  target: { section: "skill", key: "skills", recordId: null },
                  label: "Skills",
                  value: ["TypeScript", "PostgreSQL"],
                  sourceBlockIds: ["page_1_block_4"],
                  confidence: 0.86,
                }),
              ],
              notes: ["background stage completed"],
            });
          },
        },
        documentManager: createDocumentManager(),
      });

      const snapshot = await workspaceService.runResumeImport({
        baseResume: {
          ...seed.profile.baseResume,
          id: "resume_partial_stage_recovery",
          fileName: "partial-stage-recovery.pdf",
          textContent: fullText,
        },
        documentBundle: createTestBundle({ fullText }),
      });
      const candidates = await listLatestRunCandidates(repository);
      const diagnostic =
        "Resume import shared_memory stage failed; other text stages continued. shared-memory extraction provider unavailable";
      const identityCandidate = candidates.find(
        (candidate) =>
          candidate.sourceKind === "model_identity_summary" &&
          candidate.target.section === "identity" &&
          candidate.target.key === "fullName",
      );
      const experienceCandidate = candidates.find(
        (candidate) =>
          candidate.sourceKind === "model_experience" &&
          candidate.target.section === "experience" &&
          candidate.target.key === "record",
      );
      const skillsCandidate = candidates.find(
        (candidate) =>
          candidate.sourceKind === "model_background" &&
          candidate.target.section === "skill" &&
          candidate.target.key === "skills",
      );

      expect(identityCandidate?.value).toBe("Stage Recovery Candidate");
      expect(experienceCandidate?.value).toEqual(
        expect.objectContaining({
          companyName: "Recovery Labs",
          title: "Reliability Engineer",
        }),
      );
      expect(skillsCandidate?.value).toEqual(["TypeScript", "PostgreSQL"]);
      expect(snapshot.latestResumeImportRun?.status).not.toBe("failed");
      expect(snapshot.latestResumeImportRun?.modelRoles?.text).toEqual(
        expect.objectContaining({
          status: "completed",
          warning: diagnostic,
        }),
      );
      expect(snapshot.latestResumeImportRun?.warnings).toContain(diagnostic);
      expect(snapshot.profile.baseResume.analysisWarnings).toContain(
        diagnostic,
      );
      expect(
        snapshot.latestResumeImportRun?.timing?.totalMs,
      ).toBeGreaterThanOrEqual(0);
      expect(
        snapshot.latestResumeImportRun?.timing?.textBranchMs,
      ).toBeGreaterThanOrEqual(0);
      expect(
        snapshot.latestResumeImportRun?.timing?.literalExtractionMs,
      ).toBeGreaterThanOrEqual(0);
      expect(
        snapshot.latestResumeImportRun?.timing?.reconciliationMs,
      ).toBeGreaterThanOrEqual(0);
      expect(
        snapshot.latestResumeImportRun?.timing?.finalizationMs,
      ).toBeGreaterThanOrEqual(0);
      expect(snapshot.latestResumeImportRun?.timing?.textStages).toHaveLength(
        4,
      );
      expect(
        snapshot.latestResumeImportRun?.timing?.textStages.find(
          (stage) => stage.stage === "identity_summary",
        ),
      ).toEqual(
        expect.objectContaining({
          providerKind: "openai_compatible",
          providerLabel: "Partial-stage test AI",
          candidateCount: 1,
        }),
      );
    },
  );
});
