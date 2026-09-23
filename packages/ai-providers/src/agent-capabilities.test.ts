import { describe, expect, test, vi } from "vitest";
import { ResumeDraftSchema } from "@unemployed/contracts";

import {
  runProfileCopilotAgentTask,
  runResumeEditAgentTask,
  runResumeGenerationAgentTask,
  runResumeImportStageAgentTask,
} from "./agent-capabilities";
import type { AgentCapableJobFinderAiClient } from "./shared";
import {
  createJobPosting,
  createPreferences,
  createProfile,
  createSettings,
} from "./test-fixtures";
import { createDeterministicJobFinderAiClient } from "./deterministic";

function createToolClient(
  replies: Array<{
    content?: string;
    toolCalls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  }>,
): AgentCapableJobFinderAiClient {
  const deterministic = createDeterministicJobFinderAiClient();
  let index = 0;
  return {
    ...deterministic,
    chatWithTools() {
      return Promise.resolve(replies[index++] ?? { toolCalls: [] });
    },
  };
}

describe("tool-using AI capabilities", () => {
  test("resume generation exposes exact grounding ids and listing-requested skills to the model", async () => {
    const deterministic = createDeterministicJobFinderAiClient();
    let visiblePayload: Record<string, unknown> | null = null;
    let turn = 0;
    const client: AgentCapableJobFinderAiClient = {
      ...deterministic,
      chatWithTools(messages) {
        turn += 1;
        const userMessage = messages.find((message) => message.role === "user");
        visiblePayload = JSON.parse(userMessage?.content ?? "{}") as Record<
          string,
          unknown
        >;
        const evidence = visiblePayload.groundingEvidence as {
          items: Array<{ id: string; text: string }>;
        };
        const summaryEvidence =
          evidence.items.find((item) =>
            item.id.startsWith("profile:summary"),
          ) ?? evidence.items[0]!;
        return Promise.resolve(
          turn > 1
            ? {
                toolCalls: [
                  {
                    id: "finish",
                    type: "function" as const,
                    function: { name: "finish_task", arguments: "{}" },
                  },
                ],
              }
            : {
                toolCalls: [
                  {
                    id: "compose",
                    type: "function" as const,
                    function: {
                      name: "compose_resume_proposal",
                      arguments: JSON.stringify({
                        proposal: {
                          summary: {
                            text: summaryEvidence.text,
                            evidenceRefs: [summaryEvidence.id],
                          },
                        },
                      }),
                    },
                  },
                  {
                    id: "render",
                    type: "function" as const,
                    function: {
                      name: "render_resume_preview",
                      arguments: "{}",
                    },
                  },
                ],
              },
        );
      },
    };
    const job = {
      ...createJobPosting(),
      minimumQualifications: ["Hands-on Kubernetes experience"],
    };
    const result = await runResumeGenerationAgentTask({
      client,
      substantivePrompt: "Aggressive mode substantive resume instructions.",
      request: {
        profile: createProfile(),
        searchPreferences: {
          ...createPreferences(),
          tailoringMode: "aggressive",
        },
        settings: createSettings(),
        job,
        resumeText: "Saved base resume text",
      },
    });

    const capturedPayload = visiblePayload as unknown as {
      groundingEvidence: { items: unknown[] };
      targetJob: { listingRequestedSkills: string[] };
    };
    expect(capturedPayload.groundingEvidence.items.length).toBeGreaterThan(0);
    expect(capturedPayload.targetJob.listingRequestedSkills).toContain(
      "Kubernetes",
    );
    expect(result.summary).toContain("Builds reliable automation");
  });

  test("resume generation composes and inspects a usable full draft before finishing", async () => {
    const client = createToolClient([
      {
        toolCalls: [
          {
            id: "read",
            type: "function",
            function: {
              name: "read_resume_generation_context",
              arguments: "{}",
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: "compose",
            type: "function",
            function: {
              name: "compose_resume_proposal",
              arguments: JSON.stringify({
                proposal: {
                  summary: {
                    text: "Builds reliable automation.",
                    evidenceRefs: ["profile:summary"],
                  },
                },
              }),
            },
          },
          {
            id: "inspect",
            type: "function",
            function: { name: "render_resume_preview", arguments: "{}" },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: "finish",
            type: "function",
            function: { name: "finish_task", arguments: "{}" },
          },
        ],
      },
    ]);

    const result = await runResumeGenerationAgentTask({
      client,
      substantivePrompt: "Balanced mode substantive resume instructions.",
      request: {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: "Saved base resume text",
      },
    });

    expect(result.summary).toContain("Builds reliable automation");
    expect(result.fullText).toContain("Builds reliable automation");
  });

  test("resume generation renders legacy JSON content before finishing", async () => {
    const client = createToolClient([
      {
        content: JSON.stringify({
          summary: {
            text: "Builds reliable automation.",
            evidenceRefs: ["profile:summary"],
          },
        }),
      },
    ]);

    const result = await runResumeGenerationAgentTask({
      client,
      substantivePrompt: "Balanced mode substantive resume instructions.",
      request: {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: "Saved base resume text",
      },
    });

    expect(result.summary).toContain("Builds reliable automation");
    expect(result.fullText).toContain("Builds reliable automation");
  });

  test("resume generation records a completed empty proposal as an unchanged AI review", async () => {
    const client = createToolClient([{ content: "{}" }]);

    const result = await runResumeGenerationAgentTask({
      client,
      substantivePrompt: "Balanced mode substantive resume instructions.",
      request: {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: "Saved base resume text",
      },
    });

    expect(result.generationQuality).toEqual(
      expect.objectContaining({
        proposedRewriteCount: 0,
        acceptedRewriteCount: 0,
      }),
    );
    expect(result.generationProvenance).toEqual({
      method: "ai",
      reason: null,
      detail:
        "AI completed the review without proposing wording changes, so your wording stayed unchanged.",
    });
    expect(result.notes).not.toContain(
      "Used the built-in deterministic resume tailorer.",
    );
  });

  test("resume generation exposes the authoritative phase after inspection and recomposition", async () => {
    const proposal = {
      summary: {
        text: "Builds reliable automation.",
        evidenceRefs: ["profile:summary"],
      },
    };
    const phases: Array<{
      proposalComposed: boolean;
      previewRenderedForCurrentProposal: boolean;
      previewInspectedForCurrentProposal: boolean;
      readyToFinish: boolean;
      validationIssues: Array<{ code: string }>;
    }> = [];
    const deterministic = createDeterministicJobFinderAiClient();
    let turn = 0;
    let repairGuidanceSeen = false;
    const client: AgentCapableJobFinderAiClient = {
      ...deterministic,
      chatWithTools(messages) {
        const currentContext = messages.find(
          (message) => message.role === "user",
        );
        const payload = JSON.parse(currentContext?.content ?? "{}") as {
          resumeGenerationPhase: (typeof phases)[number];
        };
        phases.push(payload.resumeGenerationPhase);
        turn += 1;
        if (turn === 1) {
          return Promise.resolve({
            toolCalls: [
              {
                id: "compose-first",
                type: "function" as const,
                function: {
                  name: "compose_resume_proposal",
                  arguments: JSON.stringify({ proposal }),
                },
              },
              {
                id: "render-first",
                type: "function" as const,
                function: { name: "render_resume_preview", arguments: "{}" },
              },
              {
                id: "inspect-first",
                type: "function" as const,
                function: {
                  name: "inspect_completed_resume",
                  arguments: "{}",
                },
              },
            ],
          });
        }
        if (turn === 2) {
          return Promise.resolve({
            toolCalls: [
              {
                id: "compose-revision",
                type: "function" as const,
                function: {
                  name: "compose_resume_proposal",
                  arguments: JSON.stringify({ proposal }),
                },
              },
            ],
          });
        }
        if (turn === 3) {
          repairGuidanceSeen = messages.some(
            (message) =>
              message.role === "tool" &&
              message.content.includes("call finish_task") &&
              message.content.includes("reasonForRevision"),
          );
          return Promise.resolve({
            toolCalls: [
              {
                id: "compose-reasoned-revision",
                type: "function" as const,
                function: {
                  name: "compose_resume_proposal",
                  arguments: JSON.stringify({
                    proposal,
                    reasonForRevision:
                      "The inspected opening sentence was too vague.",
                  }),
                },
              },
            ],
          });
        }
        if (turn === 4) {
          return Promise.resolve({
            toolCalls: [
              {
                id: "render-revision",
                type: "function" as const,
                function: {
                  name: "render_resume_preview",
                  arguments: "{}",
                },
              },
              {
                id: "inspect-revision",
                type: "function" as const,
                function: {
                  name: "inspect_completed_resume",
                  arguments: "{}",
                },
              },
            ],
          });
        }
        return Promise.resolve({
          toolCalls: [
            {
              id: "finish",
              type: "function" as const,
              function: { name: "finish_task", arguments: "{}" },
            },
          ],
        });
      },
    };

    const result = await runResumeGenerationAgentTask({
      client,
      substantivePrompt: "Aggressive mode substantive resume instructions.",
      request: {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: "Saved base resume text",
      },
    });

    expect(result.summary).toContain("Builds reliable automation");
    expect(repairGuidanceSeen).toBe(true);
    expect(phases).toEqual([
      expect.objectContaining({
        proposalComposed: false,
        previewRenderedForCurrentProposal: false,
        previewInspectedForCurrentProposal: false,
        readyToFinish: false,
        validationIssues: expect.arrayContaining([
          expect.objectContaining({ code: "resume_proposal_required" }),
          expect.objectContaining({ code: "resume_preview_required" }),
        ]),
      }),
      expect.objectContaining({
        proposalComposed: true,
        previewRenderedForCurrentProposal: true,
        previewInspectedForCurrentProposal: true,
        readyToFinish: true,
        validationIssues: [],
      }),
      expect.objectContaining({
        proposalComposed: true,
        previewRenderedForCurrentProposal: true,
        previewInspectedForCurrentProposal: true,
        readyToFinish: true,
        validationIssues: [],
      }),
      expect.objectContaining({
        proposalComposed: true,
        previewRenderedForCurrentProposal: false,
        previewInspectedForCurrentProposal: false,
        readyToFinish: false,
        validationIssues: [
          expect.objectContaining({ code: "resume_preview_required" }),
        ],
      }),
      expect.objectContaining({
        proposalComposed: true,
        previewRenderedForCurrentProposal: true,
        previewInspectedForCurrentProposal: true,
        readyToFinish: true,
        validationIssues: [],
      }),
    ]);
  });

  test("resume generation rejects an incomplete agent task instead of grading an empty draft", async () => {
    const client = createToolClient(
      Array.from({ length: 8 }, () => ({ toolCalls: [] })),
    );

    await expect(
      runResumeGenerationAgentTask({
        client,
        substantivePrompt: "Balanced mode substantive resume instructions.",
        request: {
          profile: createProfile(),
          searchPreferences: createPreferences(),
          settings: createSettings(),
          job: createJobPosting(),
          resumeText: "Saved base resume text",
        },
      }),
    ).rejects.toThrow(
      "Resume generation agent stopped before completing (no_progress).",
    );
  });

  test("resume generation repairs blocking preview validation without erasing person confirmations", async () => {
    const proposal = {
      summary: {
        text: "Builds reliable automation.",
        evidenceRefs: ["profile:summary"],
      },
    };
    let renderCount = 0;
    let repairIssueSeen = false;
    let personConfirmationCountSeen = false;
    const renderPreview = vi.fn(() => {
      renderCount += 1;
      return Promise.resolve({
        templateId: "classic_ats",
        pageCount: 1,
        warnings: [],
        fileName: "preview.pdf",
        requiredModelRepairs:
          renderCount === 1
            ? [
                {
                  id: "issue_claim_grounding_summary",
                  severity: "error" as const,
                  category: "unsupported_claim" as const,
                  sectionId: "summary",
                  entryId: null,
                  bulletId: null,
                  message: "Saved evidence does not back this wording.",
                  flaggedText: "Unsupported summary wording.",
                },
              ]
            : [],
        personConfirmationCount: 2,
      });
    });
    const deterministic = createDeterministicJobFinderAiClient();
    let turn = 0;
    const client: AgentCapableJobFinderAiClient = {
      ...deterministic,
      chatWithTools(messages) {
        const currentContext = messages.find(
          (message) => message.role === "user",
        );
        const payload = JSON.parse(currentContext?.content ?? "{}") as {
          resumeGenerationPhase: {
            formattedArtifact?: {
              personConfirmationCount?: number;
            } | null;
            validationIssues: Array<{ code: string }>;
          };
        };
        turn += 1;
        if (turn === 1) {
          return Promise.resolve({
            toolCalls: [
              {
                id: "compose",
                type: "function" as const,
                function: {
                  name: "compose_resume_proposal",
                  arguments: JSON.stringify({ proposal }),
                },
              },
              {
                id: "render",
                type: "function" as const,
                function: { name: "render_resume_preview", arguments: "{}" },
              },
              {
                id: "inspect",
                type: "function" as const,
                function: {
                  name: "inspect_completed_resume",
                  arguments: "{}",
                },
              },
            ],
          });
        }
        if (turn === 2) {
          repairIssueSeen = payload.resumeGenerationPhase.validationIssues.some(
            (issue) =>
              issue.code === "resume_preview_issue_claim_grounding_summary",
          );
          personConfirmationCountSeen =
            payload.resumeGenerationPhase.formattedArtifact
              ?.personConfirmationCount === 2;
          return Promise.resolve({
            toolCalls: [
              {
                id: "repair",
                type: "function" as const,
                function: {
                  name: "compose_resume_proposal",
                  arguments: JSON.stringify({
                    proposal,
                    reasonForRevision:
                      "The preview reported unsupported summary wording.",
                  }),
                },
              },
            ],
          });
        }
        if (turn === 3) {
          return Promise.resolve({
            toolCalls: [
              {
                id: "render-repair",
                type: "function" as const,
                function: { name: "render_resume_preview", arguments: "{}" },
              },
              {
                id: "inspect-repair",
                type: "function" as const,
                function: {
                  name: "inspect_completed_resume",
                  arguments: "{}",
                },
              },
            ],
          });
        }
        return Promise.resolve({
          toolCalls: [
            {
              id: "finish",
              type: "function" as const,
              function: { name: "finish_task", arguments: "{}" },
            },
          ],
        });
      },
    };

    await runResumeGenerationAgentTask({
      client,
      substantivePrompt: "Aggressive mode substantive resume instructions.",
      request: {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: "Saved base resume text",
        renderPreview,
      },
    });

    expect(repairIssueSeen).toBe(true);
    expect(personConfirmationCountSeen).toBe(true);
    expect(renderPreview).toHaveBeenCalledTimes(2);
  });

  test("resume generation can choose an unlocked template and inspects the real rendered artifact", async () => {
    const renderPreview = vi.fn(() =>
      Promise.resolve({
        templateId: "compact_exec",
        pageCount: 2,
        warnings: [],
        fileName: "preview-compact-exec.pdf",
      }),
    );
    const client = createToolClient([
      {
        toolCalls: [
          {
            id: "select",
            type: "function",
            function: {
              name: "select_resume_template",
              arguments: JSON.stringify({ templateId: "compact_exec" }),
            },
          },
          {
            id: "compose",
            type: "function",
            function: {
              name: "compose_resume_proposal",
              arguments: JSON.stringify({ proposal: {} }),
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: "render",
            type: "function",
            function: { name: "render_resume_preview", arguments: "{}" },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: "finish",
            type: "function",
            function: { name: "finish_task", arguments: "{}" },
          },
        ],
      },
    ]);
    const request = {
      profile: createProfile(),
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job: createJobPosting(),
      resumeText: "Saved base resume text",
      selectedTemplateId: "classic_ats",
      templateSelectionLocked: false,
      availableTemplates: [
        {
          id: "classic_ats" as const,
          label: "Chronology Classic",
          description: "General apply-safe layout.",
          bestFor: ["General applications"],
          density: "balanced" as const,
          applyEligible: true,
        },
        {
          id: "compact_exec" as const,
          label: "Senior Brief",
          description: "Compact apply-safe layout.",
          bestFor: ["Experienced candidates"],
          density: "compact" as const,
          applyEligible: true,
        },
      ],
      renderPreview,
    };

    const result = await runResumeGenerationAgentTask({
      client,
      substantivePrompt: "Balanced mode substantive resume instructions.",
      request,
    });

    expect(result.recommendedTemplateId).toBe("compact_exec");
    expect(renderPreview).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "compact_exec" }),
    );
  });

  test("a changed template is reported immediately and must be rendered again", async () => {
    const deterministic = createDeterministicJobFinderAiClient();
    const renderPreview = vi.fn(({ templateId }: { templateId: string }) =>
      Promise.resolve({
        templateId,
        pageCount: 1,
        warnings: [],
        fileName: `preview-${templateId}.pdf`,
      }),
    );
    let turn = 0;
    let templateReadContent = "";
    const client: AgentCapableJobFinderAiClient = {
      ...deterministic,
      chatWithTools(messages) {
        turn += 1;
        if (turn === 4) {
          templateReadContent = messages.at(-1)?.content ?? "";
        }
        const calls =
          [
            [
              {
                id: "compose",
                name: "compose_resume_proposal",
                args: { proposal: {} },
              },
              { id: "render-a", name: "render_resume_preview", args: {} },
            ],
            [
              {
                id: "select-b",
                name: "select_resume_template",
                args: { templateId: "compact_exec" },
              },
            ],
            [{ id: "read-b", name: "read_resume_templates", args: {} }],
            [{ id: "finish-too-soon", name: "finish_task", args: {} }],
            [{ id: "render-b", name: "render_resume_preview", args: {} }],
            [{ id: "finish", name: "finish_task", args: {} }],
          ][turn - 1] ?? [];
        return Promise.resolve({
          toolCalls: calls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        });
      },
    };

    const result = await runResumeGenerationAgentTask({
      client,
      substantivePrompt: "Balanced mode substantive resume instructions.",
      request: {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: "Saved base resume text",
        selectedTemplateId: "classic_ats",
        templateSelectionLocked: false,
        availableTemplates: [
          {
            id: "classic_ats" as const,
            label: "Chronology Classic",
            description: "General apply-safe layout.",
            bestFor: ["General applications"],
            density: "balanced" as const,
            applyEligible: true,
          },
          {
            id: "compact_exec" as const,
            label: "Senior Brief",
            description: "Compact apply-safe layout.",
            bestFor: ["Experienced candidates"],
            density: "compact" as const,
            applyEligible: true,
          },
        ],
        renderPreview,
      },
    });

    expect(templateReadContent).toContain("compact_exec");
    expect(renderPreview).toHaveBeenCalledTimes(2);
    expect(renderPreview).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ templateId: "compact_exec" }),
    );
    expect(result.recommendedTemplateId).toBe("compact_exec");
  });

  test("resume import exposes layout inspection and stage-specific typed candidates", async () => {
    const deterministic = createDeterministicJobFinderAiClient();
    let calls = 0;
    let toolNames: string[] = [];
    let sectionValues: string[] = [];
    const client: AgentCapableJobFinderAiClient = {
      ...deterministic,
      chatWithTools(_messages, tools) {
        toolNames = tools.map((tool) => tool.function.name);
        const record = tools.find(
          (tool) => tool.function.name === "record_import_candidates",
        );
        const parameters = record?.function.parameters as unknown as {
          properties?: {
            candidates?: {
              items?: {
                properties?: {
                  target?: { properties?: { section?: { enum?: string[] } } };
                };
              };
            };
          };
        };
        sectionValues =
          parameters.properties?.candidates?.items?.properties?.target
            ?.properties?.section?.enum ?? [];
        calls += 1;
        return Promise.resolve({
          toolCalls: [
            {
              id: `import_${calls}`,
              type: "function" as const,
              function: {
                name: calls === 1 ? "inspect_document_layout" : "finish_task",
                arguments: "{}",
              },
            },
          ],
        });
      },
    };

    const result = await runResumeImportStageAgentTask({
      client,
      request: {
        stage: "identity_summary",
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        documentBundle: {
          id: "bundle_1",
          runId: "run_1",
          sourceResumeId: "resume_1",
          sourceFileKind: "pdf",
          primaryParserKind: "pdfjs_text",
          parserKinds: ["pdfjs_text"],
          createdAt: "2026-09-14T10:00:00.000Z",
          languageHints: ["en"],
          warnings: [],
          pages: [],
          blocks: [],
          fullText: "Robin Ashford\nPlatform engineer",
        },
      },
    });

    expect(toolNames).toContain("inspect_document_layout");
    expect(sectionValues).toEqual([
      "identity",
      "contact",
      "location",
      "search_preferences",
    ]);
    expect(result).toMatchObject({
      stage: "identity_summary",
      candidates: [],
    });
  });

  test("Profile Copilot repairs an invalid patch group before finishing", async () => {
    const client = createToolClient([
      {
        toolCalls: [
          {
            id: "invalid",
            type: "function",
            function: {
              name: "propose_profile_operations",
              arguments: JSON.stringify({
                summary: "Update headline",
                operations: [{ operation: "replace_identity_fields" }],
              }),
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: "content",
            type: "function",
            function: {
              name: "set_response_content",
              arguments: JSON.stringify({
                content: "I prepared a grounded headline update for review.",
              }),
            },
          },
          {
            id: "patch",
            type: "function",
            function: {
              name: "propose_profile_operations",
              arguments: JSON.stringify({
                summary: "Update headline",
                operations: [
                  {
                    operation: "replace_identity_fields",
                    value: { headline: "Product-focused software engineer" },
                  },
                ],
              }),
            },
          },
          {
            id: "finish",
            type: "function",
            function: { name: "finish_task", arguments: "{}" },
          },
        ],
      },
    ]);

    const reply = await runProfileCopilotAgentTask({
      client,
      request: {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        context: { surface: "profile", section: "basics" },
        relevantReviewItems: [],
        request: "Make my headline clearer",
      },
    });

    expect(reply.patchGroups).toHaveLength(1);
    expect(reply.patchGroups[0]?.operations).toEqual([
      {
        operation: "replace_identity_fields",
        value: { headline: "Product-focused software engineer" },
      },
    ]);
    expect(reply.executionReceipt?.stopReason).toBe("completed");
    expect(reply.executionReceipt?.repairAttempts).toBe(1);
  });

  test("Profile Copilot strips model-supplied proposal metadata on the set_* path so id, apply mode, and timestamp stay runtime-owned", async () => {
    const client = createToolClient([
      {
        toolCalls: [
          {
            id: "content",
            type: "function",
            function: {
              name: "set_response_content",
              arguments: JSON.stringify({
                content: "I prepared the requested headline for review.",
              }),
            },
          },
          {
            id: "headline",
            type: "function",
            function: {
              name: "set_identity_fields",
              arguments: JSON.stringify({
                summary: "Update headline",
                id: "model_group_id",
                applyMode: "applied",
                createdAt: "1999-01-01T00:00:00.000Z",
                fields: {
                  headline: "Product-minded Frontend Engineer",
                  id: "model_field_id",
                  applyMode: "rejected",
                  createdAt: "1999-01-01T00:00:00.000Z",
                },
              }),
            },
          },
          {
            id: "finish",
            type: "function",
            function: { name: "finish_task", arguments: "{}" },
          },
        ],
      },
    ]);

    const reply = await runProfileCopilotAgentTask({
      client,
      request: {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        context: { surface: "profile", section: "basics" },
        relevantReviewItems: [],
        request: "Set my headline to Product-minded Frontend Engineer.",
      },
    });

    expect(reply.executionReceipt?.stopReason).toBe("completed");
    expect(reply.patchGroups).toHaveLength(1);
    const group = reply.patchGroups[0];
    expect(group?.id).toMatch(/^profile_proposal_/);
    expect(group?.applyMode).toBe("needs_review");
    expect(group?.createdAt).not.toBe("1999-01-01T00:00:00.000Z");
    expect(Number.isNaN(Date.parse(group?.createdAt ?? ""))).toBe(false);
    expect(group?.operations).toEqual([
      {
        operation: "replace_identity_fields",
        value: { headline: "Product-minded Frontend Engineer" },
      },
    ]);
  });

  test("Profile Copilot lets the model set simple fields without manufacturing contract metadata", async () => {
    const client = createToolClient([
      {
        toolCalls: [
          {
            id: "content",
            type: "function",
            function: {
              name: "set_response_content",
              arguments: JSON.stringify({
                content: "I prepared the requested headline for review.",
              }),
            },
          },
          {
            id: "headline",
            type: "function",
            function: {
              name: "set_identity_fields",
              arguments: JSON.stringify({
                summary: "Update headline",
                fields: { headline: "Product-minded Frontend Engineer" },
              }),
            },
          },
          {
            id: "finish",
            type: "function",
            function: { name: "finish_task", arguments: "{}" },
          },
        ],
      },
    ]);

    const reply = await runProfileCopilotAgentTask({
      client,
      request: {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        context: { surface: "profile", section: "basics" },
        relevantReviewItems: [],
        request: "Set my headline to Product-minded Frontend Engineer.",
      },
    });

    expect(reply.patchGroups[0]).toEqual(
      expect.objectContaining({
        summary: "Update headline",
        applyMode: "needs_review",
        operations: [
          {
            operation: "replace_identity_fields",
            value: { headline: "Product-minded Frontend Engineer" },
          },
        ],
      }),
    );
    expect(reply.patchGroups[0]?.id).toMatch(/^profile_proposal_/);
    expect(reply.executionReceipt?.stopReason).toBe("completed");
  });

  test("Guided Edits creates a validated temporary proposal", async () => {
    const client = createToolClient([
      {
        toolCalls: [
          {
            id: "content",
            type: "function",
            function: {
              name: "set_response_content",
              arguments: JSON.stringify({
                content:
                  "The current draft is already grounded, so I recommend no edit.",
              }),
            },
          },
          {
            id: "finish",
            type: "function",
            function: { name: "finish_task", arguments: "{}" },
          },
        ],
      },
    ]);
    const draft = ResumeDraftSchema.parse({
      id: "draft_1",
      jobId: "job_1",
      templateId: "classic_ats",
      status: "draft",
      identity: null,
      sections: [],
      targetPageCount: 2,
      generationMethod: null,
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
      approvedAt: null,
      approvedExportId: null,
      staleReason: null,
    });

    const reply = await runResumeEditAgentTask({
      client,
      request: {
        draft,
        job: createJobPosting(),
        request: "Improve the summary without adding facts",
      },
    });

    expect(reply.patches).toEqual([]);
    expect(reply.executionReceipt?.stopReason).toBe("completed");
  });

  test("Guided Edits lets the model replace section text without manufacturing patch metadata", async () => {
    const client = createToolClient([
      {
        toolCalls: [
          {
            id: "content",
            type: "function",
            function: {
              name: "set_response_content",
              arguments: JSON.stringify({
                content:
                  "I tightened the summary using only its saved evidence.",
              }),
            },
          },
          {
            id: "summary",
            type: "function",
            function: {
              name: "replace_resume_section_text",
              arguments: JSON.stringify({
                sectionId: "summary",
                newText:
                  "Builds accessible React workflows for internal teams.",
              }),
            },
          },
          {
            id: "finish",
            type: "function",
            function: { name: "finish_task", arguments: "{}" },
          },
        ],
      },
    ]);
    const draft = ResumeDraftSchema.parse({
      id: "draft_1",
      jobId: "job_1",
      templateId: "classic_ats",
      status: "draft",
      identity: null,
      sections: [
        {
          id: "summary",
          kind: "summary",
          label: "Summary",
          text: "Built accessible React workflows for internal teams.",
          origin: "user_edited",
          locked: false,
          included: true,
          sortOrder: 0,
          updatedAt: "2026-08-12T12:00:00.000Z",
        },
      ],
      targetPageCount: 2,
      generationMethod: null,
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
      approvedAt: null,
      approvedExportId: null,
      staleReason: null,
    });

    const reply = await runResumeEditAgentTask({
      client,
      request: {
        draft,
        job: createJobPosting(),
        request: "Make the summary sharper without new facts.",
      },
    });

    expect(reply.patches[0]).toEqual(
      expect.objectContaining({
        draftId: "draft_1",
        operation: "replace_section_text",
        targetSectionId: "summary",
        newText: "Builds accessible React workflows for internal teams.",
        origin: "assistant",
      }),
    );
    expect(reply.executionReceipt?.stopReason).toBe("completed");
  });

  test("Guided Edits can show an existing hidden skill without creating a new fact", async () => {
    const client = createToolClient([
      {
        toolCalls: [
          {
            id: "content",
            type: "function",
            function: {
              name: "set_response_content",
              arguments: JSON.stringify({
                content: "I restored the existing saved Design Systems skill.",
              }),
            },
          },
          {
            id: "show-skill",
            type: "function",
            function: {
              name: "set_resume_bullet_included",
              arguments: JSON.stringify({
                sectionId: "skills",
                bulletId: "design-systems",
                included: true,
              }),
            },
          },
          {
            id: "finish",
            type: "function",
            function: { name: "finish_task", arguments: "{}" },
          },
        ],
      },
    ]);
    const draft = ResumeDraftSchema.parse({
      id: "draft_1",
      jobId: "job_1",
      templateId: "classic_ats",
      status: "draft",
      identity: null,
      sections: [
        {
          id: "skills",
          kind: "skills",
          label: "Core Skills",
          bullets: [
            {
              id: "design-systems",
              text: "Design Systems",
              origin: "user_edited",
              locked: false,
              included: false,
              updatedAt: "2026-08-12T12:00:00.000Z",
            },
          ],
          origin: "user_edited",
          locked: false,
          included: true,
          sortOrder: 0,
          updatedAt: "2026-08-12T12:00:00.000Z",
        },
      ],
      targetPageCount: 2,
      generationMethod: null,
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
      approvedAt: null,
      approvedExportId: null,
      staleReason: null,
    });

    const reply = await runResumeEditAgentTask({
      client,
      request: {
        draft,
        job: createJobPosting(),
        request: "Add Design Systems to the skills line.",
      },
    });

    expect(reply.patches[0]).toEqual(
      expect.objectContaining({
        draftId: "draft_1",
        operation: "toggle_include",
        targetSectionId: "skills",
        targetBulletId: "design-systems",
        newIncluded: true,
        origin: "assistant",
      }),
    );
    expect(reply.executionReceipt?.stopReason).toBe("completed");
  });

  test("Guided Edits refuses locked and unknown top-level bullet targets", async () => {
    const client = createToolClient([
      {
        toolCalls: [
          {
            id: "locked-skill",
            type: "function",
            function: {
              name: "set_resume_bullet_included",
              arguments: JSON.stringify({
                sectionId: "skills",
                bulletId: "locked-skill",
                included: true,
              }),
            },
          },
          {
            id: "unknown-keyword",
            type: "function",
            function: {
              name: "set_resume_bullet_included",
              arguments: JSON.stringify({
                sectionId: "keywords",
                bulletId: "missing-keyword",
                included: true,
              }),
            },
          },
        ],
      },
      {
        toolCalls: [
          {
            id: "content",
            type: "function",
            function: {
              name: "set_response_content",
              arguments: JSON.stringify({
                content: "I could not change the locked or missing items.",
              }),
            },
          },
          {
            id: "finish",
            type: "function",
            function: { name: "finish_task", arguments: "{}" },
          },
        ],
      },
    ]);
    const draft = ResumeDraftSchema.parse({
      id: "draft_1",
      jobId: "job_1",
      templateId: "classic_ats",
      status: "draft",
      identity: null,
      sections: [
        {
          id: "skills",
          kind: "skills",
          label: "Core Skills",
          bullets: [
            {
              id: "locked-skill",
              text: "Design Systems",
              origin: "user_edited",
              locked: true,
              included: false,
              updatedAt: "2026-08-12T12:00:00.000Z",
            },
          ],
          origin: "user_edited",
          locked: false,
          included: true,
          sortOrder: 0,
          updatedAt: "2026-08-12T12:00:00.000Z",
        },
        {
          id: "keywords",
          kind: "keywords",
          label: "Keywords",
          bullets: [],
          origin: "user_edited",
          locked: false,
          included: true,
          sortOrder: 1,
          updatedAt: "2026-08-12T12:00:00.000Z",
        },
      ],
      targetPageCount: 2,
      generationMethod: null,
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
      approvedAt: null,
      approvedExportId: null,
      staleReason: null,
    });

    const reply = await runResumeEditAgentTask({
      client,
      request: {
        draft,
        job: createJobPosting(),
        request: "Show both items.",
      },
    });

    expect(reply.patches).toEqual([]);
    expect(reply.executionReceipt?.stopReason).toBe("permanent_failure");
  });
});
