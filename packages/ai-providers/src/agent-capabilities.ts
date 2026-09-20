import {
  AgentTaskNonRetryableProviderError,
  runAgentTask,
  type AgentTaskModel,
} from "@unemployed/agent-runtime";
import {
  ProfileCopilotPatchGroupSchema,
  ProfileCopilotPatchOperationSchema,
  ProfileCompensationPreferencePatchFieldsSchema,
  ProfileCoreListPatchFieldsSchema,
  ProfileIdentityPatchFieldsSchema,
  ProfileProfessionalSummaryPatchFieldsSchema,
  ProfileSearchPreferencesPatchFieldsSchema,
  ProfileCopilotReplySchema,
  ResumeDraftPatchSchema,
  ResumeImportFieldCandidateDraftSchema,
  type AgentTaskValidationIssue,
  type ProfileCopilotPatchGroup,
  type ProfileCopilotPatchOperation,
  type ProfileCopilotReply,
  type ResumeDraftPatch,
  type ResumeImportFieldCandidateDraft,
  type ToolCall,
} from "@unemployed/contracts";
import { z } from "zod";

import {
  ResumeAssistantReplySchema,
  TailoredResumeDraftSchema,
  type AgentCapableJobFinderAiClient,
  type ResumeAssistantReply,
  type CreateResumeDraftInput,
  type ReviseCandidateProfileInput,
  type ReviseResumeDraftInput,
  type TailoredResumeDraft,
  type ExtractResumeImportStageTransportInput,
  describeProfileAssistantBehavior,
} from "./shared";
import { completeTailoredResumeDraft } from "./openai-compatible-shared";
import {
  buildGroundedResumeRewriteModelPayload,
  describeAggressiveResumeEditPolicy,
} from "./resume-generation-grounding";
import { compactOpenAiCompatibleUserPayload } from "./openai-compatible-request-compaction";
import { modelConversationKeys } from "./model-request-identity";
import {
  ResumeImportStageExtractionResultSchema,
  sanitizeStageCandidates,
  type ResumeImportStageExtractionResult,
} from "./resume-import";

const EmptyInputSchema = z.object({});
const ContentInputSchema = z.object({ content: z.string().trim().min(1) });
const ResumePatchInputSchema = z.object({ patch: ResumeDraftPatchSchema });
const ResumeSectionTextInputSchema = z.object({
  sectionId: z.string().trim().min(1),
  newText: z.string().trim().min(1),
});
const ResumeBulletTextInputSchema = z.object({
  sectionId: z.string().trim().min(1),
  entryId: z.string().trim().min(1),
  bulletId: z.string().trim().min(1),
  newText: z.string().trim().min(1),
});
const ResumeGenerationProposalInputSchema = z.object({
  proposal: z.record(z.string(), z.unknown()),
});
const ResumeImportCandidateSetInputSchema = z.object({
  candidates: z.array(ResumeImportFieldCandidateDraftSchema),
  notes: z.array(z.string().trim().min(1)).default([]),
});

const resumeImportTargetSectionsByStage = {
  identity_summary: ["identity", "contact", "location", "search_preferences"],
  experience: ["experience"],
  background: [
    "education",
    "certification",
    "link",
    "project",
    "language",
    "skill",
  ],
  shared_memory: [
    "narrative",
    "proof_point",
    "answer_bank",
    "application_identity",
  ],
} as const;

/**
 * What each patch operation must carry to be appliable. The patch schema
 * leaves the target ids nullable because different operations need different
 * ones; a model that omits the bullet id used to sail through the schema and
 * fail at apply time with a message the user saw verbatim. Rejecting it here
 * hands the model an exact repair instead.
 */
function describeMissingPatchFields(patch: ResumeDraftPatch): string | null {
  const needs = (fields: Array<keyof ResumeDraftPatch>): string | null => {
    const missing = fields.filter((field) => {
      const value = patch[field];
      return value === null || value === undefined || value === "";
    });
    return missing.length > 0
      ? `${patch.operation} requires ${missing.join(", ")}. Read the draft with read_resume_context to find the exact ids.`
      : null;
  };
  switch (patch.operation) {
    case "update_bullet":
      return needs(["targetEntryId", "targetBulletId", "newText"]);
    case "replace_entry_summary":
      return needs(["targetEntryId", "newText"]);
    case "replace_section_text":
      return needs(["newText"]);
    default:
      return null;
  }
}

function profileOperationInputSchema<T extends z.ZodTypeAny>(fields: T) {
  return z.object({
    summary: z.string().trim().min(1),
    fields,
  });
}

const IdentityFieldsInputSchema = profileOperationInputSchema(
  ProfileIdentityPatchFieldsSchema,
);
const ProfessionalSummaryFieldsInputSchema = profileOperationInputSchema(
  ProfileProfessionalSummaryPatchFieldsSchema,
);
const ProfileListFieldsInputSchema = profileOperationInputSchema(
  ProfileCoreListPatchFieldsSchema,
);
const SearchPreferenceFieldsInputSchema = profileOperationInputSchema(
  ProfileSearchPreferencesPatchFieldsSchema,
);
const CompensationFieldsInputSchema = profileOperationInputSchema(
  ProfileCompensationPreferencePatchFieldsSchema,
);
const ProfileOperationsInputSchema = z.object({
  summary: z.string().trim().min(1),
  operations: z.array(ProfileCopilotPatchOperationSchema).min(1),
});

function jsonObject(
  properties: Record<string, unknown>,
  required: string[] = [],
) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function createModelAdapter(
  client: AgentCapableJobFinderAiClient,
  conversationKey?: string,
  options?: {
    contentToToolCalls?: (content: string) => ToolCall[] | null;
    preventRuntimeRetries?: boolean;
  },
): AgentTaskModel {
  const status = client.getStatus();
  return {
    model: status.model,
    reasoningEffort: null,
    async chat(input) {
      try {
        const response = await client.chatWithTools(
          input.messages.map((message) => {
            if (message.role === "tool") {
              return {
                role: "tool" as const,
                toolCallId: message.toolCallId ?? "missing_tool_call_id",
                content: message.content,
              };
            }
            if (message.role === "assistant") {
              return {
                role: "assistant" as const,
                content: message.content,
                ...(message.toolCalls ? { toolCalls: message.toolCalls } : {}),
              };
            }
            return { role: message.role, content: message.content };
          }),
          [...input.tools],
          {
            ...(input.signal ? { signal: input.signal } : {}),
            ...(conversationKey ? { conversationKey } : {}),
          },
        );
        if (
          (!response.toolCalls || response.toolCalls.length === 0) &&
          response.content &&
          options?.contentToToolCalls
        ) {
          const toolCalls = options.contentToToolCalls(response.content);
          if (toolCalls) return { ...response, toolCalls };
        }
        return response;
      } catch (error) {
        if (!options?.preventRuntimeRetries) throw error;
        throw new AgentTaskNonRetryableProviderError(
          error instanceof Error ? error.message : "Provider request failed",
          { cause: error },
        );
      }
    },
  };
}

function zodIssues(error: z.ZodError): AgentTaskValidationIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path,
  }));
}

/**
 * Gives resume generation a bounded working loop instead of treating the
 * model as a one-shot JSON endpoint. The model owns the useful writing work;
 * the existing completion layer still owns identity, chronology, and the
 * final typed draft contract.
 */
export async function runResumeGenerationAgentTask(input: {
  client: AgentCapableJobFinderAiClient;
  request: CreateResumeDraftInput;
  substantivePrompt: string;
}): Promise<TailoredResumeDraft> {
  let selectedTemplateId =
    input.request.selectedTemplateId ?? input.request.settings.resumeTemplateId;
  let hasComposedProposal = false;
  let hasRenderedPreview = false;
  const groundedResumePayload = buildGroundedResumeRewriteModelPayload(
    input.request,
  );
  const result = await runAgentTask({
    taskId: `resume_generation_${Date.now()}`,
    capability: "resume_generation",
    systemPrompt: [
      input.substantivePrompt,
      "Work through the task tools instead of returning a final JSON object.",
      "Read the complete context and template options, compose a material proposal, render and inspect the resulting full-text preview, revise the proposal when the inspection exposes a weak result, then finish.",
      "The runtime preserves identity, chronology, selected strategy, and the final typed resume shape. Your job is to do the actual job-targeted writing within the mode-specific instructions above.",
    ].join(" "),
    state: input.request,
    initialDraft: {} as Record<string, unknown>,
    model: createModelAdapter(
      input.client,
      modelConversationKeys.resumeForJob(input.request.job),
      {
        preventRuntimeRetries: true,
        contentToToolCalls(content) {
          try {
            const proposal = JSON.parse(content) as unknown;
            if (
              !proposal ||
              typeof proposal !== "object" ||
              Array.isArray(proposal)
            )
              return null;
            return [
              {
                id: `resume_proposal_${Date.now()}`,
                type: "function",
                function: {
                  name: "compose_resume_proposal",
                  arguments: JSON.stringify({ proposal }),
                },
              },
              {
                id: `resume_preview_${Date.now()}`,
                type: "function",
                function: {
                  name: "render_resume_preview",
                  arguments: "{}",
                },
              },
              {
                id: `resume_finish_${Date.now()}`,
                type: "function",
                function: { name: "finish_task", arguments: "{}" },
              },
            ];
          } catch {
            return null;
          }
        },
      },
    ),
    tools: [
      {
        name: "read_resume_generation_context",
        description:
          "Read the complete target job, candidate profile, selected base resume text, saved preferences, strategy, and settings.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        parallelSafe: true,
        execute(_toolInput, context) {
          return {
            summary: "Resume generation context read",
            value: {
              ...context.state,
              ...groundedResumePayload,
            },
            progressMade: false,
          };
        },
      },
      {
        name: "read_resume_templates",
        description:
          "Read the available resume templates and the template already selected by saved strategy, existing draft, or settings. Template selection stays governed by that saved policy.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        parallelSafe: true,
        execute(_toolInput, context) {
          return {
            summary: "Resume template options read",
            value: {
              selectedTemplateId,
              selectionLocked: context.state.templateSelectionLocked === true,
              availableTemplates: context.state.availableTemplates ?? [],
            },
            progressMade: false,
          };
        },
      },
      {
        name: "select_resume_template",
        description:
          "Choose the best eligible template for this job and content when the person has not locked a template through an existing draft or saved strategy. An explicit choice is never overridden.",
        inputSchema: z.object({ templateId: z.string().trim().min(1) }),
        parameters: jsonObject({ templateId: { type: "string" } }, [
          "templateId",
        ]),
        permission: "draft_write",
        execute(toolInput, context) {
          const templateId = z
            .object({ templateId: z.string().trim().min(1) })
            .parse(toolInput).templateId;
          if (context.state.templateSelectionLocked) {
            return {
              summary: "Explicit template choice preserved",
              value: { selectedTemplateId },
              progressMade: false,
            };
          }
          const template = context.state.availableTemplates?.find(
            (candidate) => candidate.id === templateId,
          );
          if (!template || template.applyEligible === false) {
            throw new Error(
              `Template '${templateId}' is unavailable or not eligible for application use.`,
            );
          }
          const changed = selectedTemplateId !== templateId;
          selectedTemplateId = templateId;
          if (changed) hasRenderedPreview = false;
          return {
            summary: `Resume template selected: ${template.label}`,
            value: { selectedTemplateId },
            progressMade: changed,
          };
        },
      },
      {
        name: "compose_resume_proposal",
        description:
          "Write or revise the sparse job-targeted resume proposal. Use the exact proposal shape described in the task instructions. Calling this again replaces the working proposal so you can improve it after inspection.",
        inputSchema: ResumeGenerationProposalInputSchema,
        parameters: jsonObject(
          {
            proposal: {
              type: "object",
              additionalProperties: true,
              description:
                "Sparse summary, experienceEntries, projectEntries, and optional coreSkills proposal from the task instructions.",
            },
          },
          ["proposal"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ResumeGenerationProposalInputSchema.parse(toolInput);
          hasComposedProposal = true;
          hasRenderedPreview = false;
          return {
            draft: parsed.proposal,
            summary: "Resume proposal composed",
            progressMade:
              JSON.stringify(context.draft) !== JSON.stringify(parsed.proposal),
          };
        },
      },
      {
        name: "render_resume_preview",
        description:
          "Render the current proposal into the complete typed, full-text resume preview using the selected base resume and saved generation strategy. Inspect all sections and revise before finishing when needed.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        execute(_toolInput, context) {
          const preview = completeTailoredResumeDraft(
            context.draft,
            context.state,
          );
          return Promise.resolve(
            context.state.renderPreview
              ? context.state.renderPreview({
                  draft: preview,
                  templateId: selectedTemplateId,
                })
              : null,
          ).then((rendered) => {
            hasRenderedPreview = true;
            return {
              summary: rendered
                ? "Formatted resume preview rendered"
                : "Resume content preview rendered",
              value: {
                selectedTemplateId,
                formattedArtifact: rendered,
                label: preview.label,
                fullText: preview.fullText,
                summary: preview.summary,
                experienceEntries: preview.experienceEntries,
                projectEntries: preview.projectEntries,
                educationEntries: preview.educationEntries,
                certificationEntries: preview.certificationEntries,
                coreSkills: preview.coreSkills,
                targetedKeywords: preview.targetedKeywords,
                coverageMetadata: preview.coverageMetadata,
                generationQuality: preview.generationQuality,
                notes: preview.notes,
              },
              progressMade: false,
            };
          });
        },
      },
      {
        name: "inspect_completed_resume",
        description:
          "Inspect the complete typed resume that the current writing proposal produces, including notes, coverage metadata, provenance, and every rendered content section. Use this feedback to revise weak or incomplete writing before finishing.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        execute(_toolInput, context) {
          return {
            summary: "Completed resume inspected",
            value: completeTailoredResumeDraft(context.draft, context.state),
            progressMade: false,
          };
        },
      },
      {
        name: "finish_task",
        description:
          "Finish after composing and inspecting a useful resume proposal.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        execute() {
          return { summary: "Resume generation finished", finish: true };
        },
      },
    ],
    validate: () => [
      ...(!hasComposedProposal
        ? [
            {
              code: "resume_proposal_required",
              message: "Compose a resume proposal before finishing.",
              path: ["proposal"],
            },
          ]
        : []),
      ...(!hasRenderedPreview
        ? [
            {
              code: "resume_preview_required",
              message:
                "Render and inspect the current resume preview before finishing.",
              path: ["preview"],
            },
          ]
        : []),
    ],
    buildContext: ({ state, draft }) =>
      compactOpenAiCompatibleUserPayload({
        operation: "createResumeDraft",
        modelContextWindowTokens: 196_000,
        systemPrompt: input.substantivePrompt,
        userPayload: jsonSafe({
          ...groundedResumePayload,
          fullTargetJob: state.job,
          candidateProfile: state.profile,
          selectedBaseResumeText: state.resumeText,
          searchPreferences: state.searchPreferences,
          generationStrategy: state.strategy ?? null,
          settings: state.settings,
          workingProposal: draft,
        }),
      }),
    timeBudgetMs: 600_000,
    providerCallBudget: 40,
    noProgressLimit: 6,
    emergencyCeiling: 24,
  });

  // A stopped agent task is not model output. Returning its partial (or still
  // empty) draft made a provider timeout look like writing that had been
  // evaluated and rejected as `provider_output_unverified`. Keep that label
  // for completed model work only so the outer provider boundary can record
  // the real timeout/failure provenance.
  if (result.receipt.stopReason !== "completed") {
    if (result.receipt.stopReason === "time_budget") {
      const seconds = Math.max(
        1,
        Math.ceil(result.receipt.durationMs / 1_000),
      );
      throw new Error(
        `Resume generation agent timed out after ${seconds}s before completing.`,
      );
    }
    throw new Error(
      `Resume generation agent stopped before completing (${result.receipt.stopReason}).`,
    );
  }

  return TailoredResumeDraftSchema.parse({
    ...completeTailoredResumeDraft(result.draft, input.request),
    recommendedTemplateId: selectedTemplateId,
  });
}

export async function runResumeImportStageAgentTask(input: {
  client: AgentCapableJobFinderAiClient;
  request: ExtractResumeImportStageTransportInput;
}): Promise<ResumeImportStageExtractionResult> {
  type Draft = {
    candidates: ResumeImportFieldCandidateDraft[];
    notes: string[];
  };
  const initialDraft: Draft = { candidates: [], notes: [] };
  const result = await runAgentTask({
    taskId: `resume_import_${input.request.stage}_${Date.now()}`,
    capability: "resume_import",
    systemPrompt: [
      `You are importing the ${input.request.stage} portion of a resume into typed profile candidates.`,
      "Use the tools to inspect the parsed document blocks and any layout or vision evidence. Populate candidates only from evidence in the document, with exact source block ids, confidence, alternatives, and review notes when ambiguity remains.",
      "Resolve ambiguity by inspecting more document evidence before finishing. Do not overwrite the saved profile directly; the reconciliation layer will keep genuinely uncertain candidates available for user review.",
    ].join(" "),
    state: input.request,
    initialDraft,
    model: createModelAdapter(
      input.client,
      modelConversationKeys.resumeImport(
        input.request.documentBundle.fullText ??
          input.request.documentBundle.blocks
            .map((block) => block.text)
            .join("\n"),
      ),
      {
        preventRuntimeRetries: true,
        contentToToolCalls(content) {
          try {
            const parsed = JSON.parse(content) as Record<string, unknown>;
            const candidateSet = {
              candidates: Array.isArray(parsed.candidates)
                ? parsed.candidates
                : [],
              notes: Array.isArray(parsed.notes) ? parsed.notes : [],
            };
            return [
              {
                id: `resume_import_candidates_${Date.now()}`,
                type: "function",
                function: {
                  name: "record_import_candidates",
                  arguments: JSON.stringify(candidateSet),
                },
              },
              {
                id: `resume_import_finish_${Date.now()}`,
                type: "function",
                function: { name: "finish_task", arguments: "{}" },
              },
            ];
          } catch {
            return null;
          }
        },
      },
    ),
    tools: [
      {
        name: "read_resume_document",
        description:
          "Read the complete parsed resume bundle, including normalized text, structured blocks, pages, parser warnings, and visual evidence references.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        parallelSafe: true,
        execute(_toolInput, context) {
          return {
            summary: "Resume document evidence read",
            value: context.state.documentBundle,
            progressMade: false,
          };
        },
      },
      {
        name: "inspect_document_layout",
        description:
          "Inspect page dimensions, ordered blocks, bounding boxes, parser lineage, OCR and quality warnings, and the document route used to decide whether separate vision evidence is required.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        parallelSafe: true,
        execute(_toolInput, context) {
          const bundle = context.state.documentBundle;
          return {
            summary: "Resume layout evidence inspected",
            value: {
              pages: bundle.pages,
              blocks: bundle.blocks.map((block) => ({
                id: block.id,
                pageNumber: block.pageNumber,
                readingOrder: block.readingOrder,
                kind: block.kind,
                sectionHint: block.sectionHint,
                bbox: block.bbox,
                sourceParserKinds: block.sourceParserKinds,
                sourceConfidence: block.sourceConfidence,
                parserLineage: block.parserLineage,
                readingOrderConfidence: block.readingOrderConfidence,
              })),
              parserManifest: bundle.parserManifest,
              route: bundle.route,
              quality: bundle.quality,
              warnings: [...bundle.warnings, ...(bundle.qualityWarnings ?? [])],
            },
            progressMade: false,
          };
        },
      },
      {
        name: "read_existing_profile",
        description:
          "Read the existing profile and search preferences so imported values can be marked as new, conflicting, or ambiguous without silently replacing saved data.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        parallelSafe: true,
        execute(_toolInput, context) {
          return {
            summary: "Existing profile context read",
            value: {
              profile: context.state.existingProfile,
              searchPreferences: context.state.existingSearchPreferences,
            },
            progressMade: false,
          };
        },
      },
      {
        name: "record_import_candidates",
        description:
          "Write or revise the typed candidates extracted for this stage. Every candidate must cite real source block ids from the document.",
        inputSchema: ResumeImportCandidateSetInputSchema,
        parameters: jsonObject(
          {
            candidates: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  target: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      section: {
                        type: "string",
                        enum: [
                          ...resumeImportTargetSectionsByStage[
                            input.request.stage
                          ],
                        ],
                      },
                      key: { type: "string" },
                      recordId: { type: ["string", "null"] },
                    },
                    required: ["section", "key"],
                  },
                  label: { type: "string" },
                  value: {},
                  normalizedValue: {},
                  valuePreview: { type: ["string", "null"] },
                  evidenceText: { type: ["string", "null"] },
                  sourceBlockIds: {
                    type: "array",
                    items: { type: "string" },
                  },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  notes: { type: "array", items: { type: "string" } },
                  alternatives: { type: "array", items: {} },
                  visualEvidence: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        branch: {
                          type: "string",
                          enum: ["text", "vision", "adjudication"],
                        },
                        sourceFileKind: { type: "string" },
                        pageNumber: { type: ["integer", "null"], minimum: 1 },
                        regionHint: { type: ["string", "null"] },
                        confidence: {
                          type: ["number", "null"],
                          minimum: 0,
                          maximum: 1,
                        },
                        uncertaintyNotes: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                },
                required: [
                  "target",
                  "label",
                  "value",
                  "sourceBlockIds",
                  "confidence",
                ],
              },
            },
            notes: { type: "array", items: { type: "string" } },
          },
          ["candidates"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ResumeImportCandidateSetInputSchema.parse(toolInput);
          return {
            draft: parsed,
            summary: `${parsed.candidates.length} import candidate(s) recorded`,
            progressMade:
              JSON.stringify(context.draft) !== JSON.stringify(parsed),
          };
        },
      },
      {
        name: "inspect_import_candidates",
        description:
          "Inspect the current candidate set after stage and source-block validation. Revise candidates that lost evidence or target the wrong section.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        execute(_toolInput, context) {
          const candidateResult = ResumeImportStageExtractionResultSchema.parse(
            {
              stage: context.state.stage,
              analysisProviderKind: "openai_compatible",
              analysisProviderLabel: input.client.getStatus().label,
              candidates: context.draft.candidates,
              notes: context.draft.notes,
            },
          );
          return {
            summary: "Import candidates inspected",
            value: sanitizeStageCandidates(context.state, candidateResult),
            progressMade: false,
          };
        },
      },
      {
        name: "finish_task",
        description:
          "Finish after document inspection and candidate validation are complete.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        execute() {
          return { summary: "Resume import stage finished", finish: true };
        },
      },
    ],
    validate: () => [],
    buildContext: ({ state, draft }) =>
      compactOpenAiCompatibleUserPayload({
        operation: "extractResumeImportStage",
        modelContextWindowTokens: 196_000,
        systemPrompt: `Resume import ${state.stage} tool task`,
        userPayload: jsonSafe({
          stage: state.stage,
          existingProfile: state.existingProfile,
          existingSearchPreferences: state.existingSearchPreferences,
          documentBundle: state.documentBundle,
          currentCandidates: draft,
        }),
      }),
    timeBudgetMs: 600_000,
    providerCallBudget: 40,
    noProgressLimit: 6,
    emergencyCeiling: 24,
  });

  return sanitizeStageCandidates(
    input.request,
    ResumeImportStageExtractionResultSchema.parse({
      stage: input.request.stage,
      analysisProviderKind: "openai_compatible",
      analysisProviderLabel: input.client.getStatus().label,
      candidates: result.draft.candidates,
      notes: result.draft.notes,
    }),
  );
}

export async function runProfileCopilotAgentTask(input: {
  client: AgentCapableJobFinderAiClient;
  request: ReviseCandidateProfileInput;
}): Promise<ProfileCopilotReply> {
  const initialDraft: ProfileCopilotReply = {
    content: "I need to inspect the saved profile before proposing a change.",
    patchGroups: [],
  };
  const createRuntimeOwnedPatchGroup = (
    draft: ProfileCopilotReply,
    summary: string,
    operations: readonly ProfileCopilotPatchOperation[],
  ): ProfileCopilotPatchGroup => {
    const takenIds = new Set(draft.patchGroups.map((group) => group.id));
    let index = draft.patchGroups.length + 1;
    while (takenIds.has(`profile_proposal_${index}`)) index += 1;
    return ProfileCopilotPatchGroupSchema.parse({
      id: `profile_proposal_${index}`,
      summary,
      applyMode: "needs_review",
      operations: [...operations],
      createdAt: new Date().toISOString(),
    });
  };
  const addOperation = (
    draft: ProfileCopilotReply,
    summary: string,
    operation: ProfileCopilotPatchOperation,
  ): ProfileCopilotReply => ({
    ...draft,
    patchGroups: [
      ...draft.patchGroups,
      createRuntimeOwnedPatchGroup(draft, summary, [operation]),
    ],
  });
  const result = await runAgentTask({
    taskId: `profile_copilot_${Date.now()}`,
    capability: "profile_copilot",
    systemPrompt: [
      "You are the Profile Copilot. Work through the typed tools instead of returning a final JSON object.",
      ...describeProfileAssistantBehavior(input.request.assistantBehavior),
      "Use propose_profile_operations for profile edits: it is the universal path that accepts every schema-valid operation kind and wraps them into one needs_review group per call with runtime-assigned id, apply mode, and timestamp. The dedicated set_* tools remain as conveniences.",
      "Answer grounded questions directly. For edits, set helpful response content and add one or more bounded patch groups.",
      "Never invent experience, credentials, dates, compensation currency, or metrics. Broad or ambiguous edits need review.",
      "Call validate_profile_draft, repair every issue, then finish_task.",
    ].join(" "),
    state: input.request,
    initialDraft,
    model: createModelAdapter(
      input.client,
      modelConversationKeys.profileCopilot(input.request.profile),
    ),
    tools: [
      {
        name: "read_profile_context",
        description:
          "Read the saved profile, preferences, context, and review items for this task.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        parallelSafe: true,
        execute(_toolInput, context) {
          return {
            summary: "Saved profile context",
            value: context.state,
            progressMade: false,
          };
        },
      },
      {
        name: "set_response_content",
        description: "Set the concise grounded response shown to the user.",
        inputSchema: ContentInputSchema,
        parameters: jsonObject({ content: { type: "string" } }, ["content"]),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ContentInputSchema.parse(toolInput);
          return {
            draft: { ...context.draft, content: parsed.content },
            summary: "Response content updated",
            progressMade: context.draft.content !== parsed.content,
          };
        },
      },
      {
        name: "set_identity_fields",
        description:
          "Propose bounded identity changes such as headline, summary, location, portfolio, GitHub, or website fields. Supply only fields the user requested or evidence supports; proposal metadata is added automatically.",
        inputSchema: IdentityFieldsInputSchema,
        parameters: jsonObject(
          {
            summary: { type: "string" },
            fields: {
              type: "object",
              additionalProperties: true,
              description:
                "Supported examples: headline, summary, currentLocation, githubUrl, portfolioUrl, personalWebsiteUrl, yearsExperience.",
            },
          },
          ["summary", "fields"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = IdentityFieldsInputSchema.parse(toolInput);
          return {
            draft: addOperation(context.draft, parsed.summary, {
              operation: "replace_identity_fields",
              value: parsed.fields,
            }),
            summary: parsed.summary,
            progressMade: true,
          };
        },
      },
      {
        name: "set_professional_summary_fields",
        description:
          "Propose bounded professional-summary fields such as shortValueProposition, fullSummary, strengths, or careerThemes.",
        inputSchema: ProfessionalSummaryFieldsInputSchema,
        parameters: jsonObject(
          {
            summary: { type: "string" },
            fields: { type: "object", additionalProperties: true },
          },
          ["summary", "fields"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ProfessionalSummaryFieldsInputSchema.parse(toolInput);
          return {
            draft: addOperation(context.draft, parsed.summary, {
              operation: "replace_professional_summary_fields",
              value: parsed.fields,
            }),
            summary: parsed.summary,
            progressMade: true,
          };
        },
      },
      {
        name: "set_profile_list_fields",
        description:
          "Propose complete replacements for profile targetRoles, locations, or skills arrays.",
        inputSchema: ProfileListFieldsInputSchema,
        parameters: jsonObject(
          {
            summary: { type: "string" },
            fields: {
              type: "object",
              additionalProperties: false,
              properties: {
                targetRoles: { type: "array", items: { type: "string" } },
                locations: { type: "array", items: { type: "string" } },
                skills: { type: "array", items: { type: "string" } },
              },
            },
          },
          ["summary", "fields"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ProfileListFieldsInputSchema.parse(toolInput);
          return {
            draft: addOperation(context.draft, parsed.summary, {
              operation: "replace_profile_list_fields",
              value: parsed.fields,
            }),
            summary: parsed.summary,
            progressMade: true,
          };
        },
      },
      {
        name: "set_search_preferences",
        description:
          "Propose bounded search-preference changes such as targetRoles, locations, workModes, employmentTypes, or seniorityLevels.",
        inputSchema: SearchPreferenceFieldsInputSchema,
        parameters: jsonObject(
          {
            summary: { type: "string" },
            fields: { type: "object", additionalProperties: true },
          },
          ["summary", "fields"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = SearchPreferenceFieldsInputSchema.parse(toolInput);
          return {
            draft: addOperation(context.draft, parsed.summary, {
              operation: "replace_search_preferences_fields",
              value: parsed.fields,
            }),
            summary: parsed.summary,
            progressMade: true,
          };
        },
      },
      {
        name: "set_compensation_preferences",
        description:
          "Propose compensation fields. Preserve minimum and target ranges separately, use interval hour/day/week/month/year, and never guess currency.",
        inputSchema: CompensationFieldsInputSchema,
        parameters: jsonObject(
          {
            summary: { type: "string" },
            fields: { type: "object", additionalProperties: true },
          },
          ["summary", "fields"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = CompensationFieldsInputSchema.parse(toolInput);
          return {
            draft: addOperation(context.draft, parsed.summary, {
              operation: "replace_compensation_preferences_fields",
              value: parsed.fields,
            }),
            summary: parsed.summary,
            progressMade: true,
          };
        },
      },
      {
        name: "propose_profile_operations",
        description:
          "Universal profile proposal path: submit one or more schema-valid profile patch operations of any kind (scalar or list field replacements, record upserts or removals, review resolutions) and the runtime wraps them into a single review-only patch group, assigning the id, needs_review apply mode, and timestamp itself.",
        inputSchema: ProfileOperationsInputSchema,
        parameters: jsonObject(
          {
            summary: { type: "string" },
            operations: {
              type: "array",
              minItems: 1,
              items: { type: "object", additionalProperties: true },
              description:
                "Each entry carries an operation discriminator (for example replace_identity_fields, upsert_experience_record, remove_link_record, remove_profile_list_entries, resolve_review_items) plus its payload: value, record, recordId, field with values, or reviewItemIds with resolutionStatus. To take one skill, saved location, or target role out of a list, use remove_profile_list_entries with the field and the exact entries to remove; never resend the whole list to drop one item, and never remove an entry the person did not name.",
            },
          },
          ["summary", "operations"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ProfileOperationsInputSchema.parse(toolInput);
          return {
            draft: {
              ...context.draft,
              patchGroups: [
                ...context.draft.patchGroups,
                createRuntimeOwnedPatchGroup(
                  context.draft,
                  parsed.summary,
                  parsed.operations,
                ),
              ],
            },
            summary: parsed.summary,
            progressMade: true,
          };
        },
      },
      {
        name: "validate_profile_draft",
        description:
          "Validate the complete temporary profile proposal and return exact repair errors.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        execute(_toolInput, context) {
          const parsed = ProfileCopilotReplySchema.safeParse(context.draft);
          return {
            summary: parsed.success
              ? "Profile proposal is valid"
              : "Profile proposal needs repair",
            validationIssues: parsed.success ? [] : zodIssues(parsed.error),
            progressMade: false,
          };
        },
      },
      {
        name: "finish_task",
        description: "Finish only after the profile proposal validates.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        execute() {
          return { summary: "Finish requested", finish: true };
        },
      },
    ],
    validate: (draft) => {
      const parsed = ProfileCopilotReplySchema.safeParse(draft);
      return parsed.success ? [] : zodIssues(parsed.error);
    },
    buildContext: ({ state, draft, validationIssues }) =>
      compactOpenAiCompatibleUserPayload({
        operation: "reviseCandidateProfile",
        modelContextWindowTokens: 196_000,
        systemPrompt: "Profile Copilot tool task",
        userPayload: jsonSafe({
          request: state.request,
          conversationFacts: state.conversationFacts ?? [],
          context: state.context,
          profile: state.profile,
          searchPreferences: state.searchPreferences,
          relevantReviewItems: state.relevantReviewItems,
          currentDraft: draft,
          validationIssues,
        }),
      }),
    // Two or three tool turns on a slower model; each turn has its own
    // timeout, this bounds the whole request.
    timeBudgetMs: 150_000,
    noProgressLimit: 4,
  });

  return ProfileCopilotReplySchema.parse({
    ...result.draft,
    executionReceipt: result.receipt,
  });
}

export async function runResumeEditAgentTask(input: {
  client: AgentCapableJobFinderAiClient;
  request: ReviseResumeDraftInput;
}): Promise<ResumeAssistantReply> {
  const initialDraft: ResumeAssistantReply = {
    content:
      "I am reviewing the requested résumé change against the saved evidence.",
    patches: [],
  };
  const result = await runAgentTask({
    taskId: `resume_edit_${Date.now()}`,
    capability: "guided_resume_edits",
    systemPrompt: [
      "You are a grounded résumé editing agent. Work through tools, not a final JSON response.",
      "Prefer replace_resume_section_text for ordinary section prose changes and update_resume_bullet for one bullet in one entry; use add_resume_patch only when no dedicated tool fits.",
      describeAggressiveResumeEditPolicy(input.request.tailoringStrength) ??
        "Never state a fact, metric, employer, tool, or date that the saved evidence does not carry. If part of a request asks for one, do the grounded part and say plainly in the response which part you did not do and why.",
      "Set a useful response and add only bounded patches supported by the supplied draft and job evidence.",
      "Never invent dates, credentials, or outcomes that neither the saved evidence nor — in aggressive tailoring — the job listing itself carries. Do not touch locked content.",
      "Validate the draft, repair every issue, then finish_task.",
    ].join(" "),
    state: input.request,
    initialDraft,
    model: createModelAdapter(
      input.client,
      modelConversationKeys.resumeForJob(input.request.job),
    ),
    tools: [
      {
        name: "read_resume_context",
        description:
          "Read the résumé draft, job, request, validation issues, and research context.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        parallelSafe: true,
        execute(_toolInput, context) {
          return { summary: "Résumé context", value: context.state };
        },
      },
      {
        name: "set_response_content",
        description:
          "Set the concise response explaining the proposed résumé edits.",
        inputSchema: ContentInputSchema,
        parameters: jsonObject({ content: { type: "string" } }, ["content"]),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ContentInputSchema.parse(toolInput);
          return {
            draft: { ...context.draft, content: parsed.content },
            summary: "Response content updated",
            progressMade: context.draft.content !== parsed.content,
          };
        },
      },
      {
        name: "replace_resume_section_text",
        description:
          "Propose a grounded replacement for one unlocked résumé section. The runtime adds patch IDs, timestamps, origin, and null metadata automatically.",
        inputSchema: ResumeSectionTextInputSchema,
        parameters: jsonObject(
          {
            sectionId: { type: "string" },
            newText: { type: "string" },
          },
          ["sectionId", "newText"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ResumeSectionTextInputSchema.parse(toolInput);
          const section = context.state.draft.sections.find(
            (candidate) => candidate.id === parsed.sectionId,
          );
          if (!section)
            throw new Error("The requested résumé section does not exist.");
          if (section.locked)
            throw new Error("The requested résumé section is locked.");
          const patch = ResumeDraftPatchSchema.parse({
            id: `resume_patch_${context.draft.patches.length + 1}`,
            draftId: context.state.draft.id,
            operation: "replace_section_text",
            targetSectionId: parsed.sectionId,
            newText: parsed.newText,
            appliedAt: new Date().toISOString(),
            origin: "assistant",
          });
          return {
            draft: {
              ...context.draft,
              patches: [...context.draft.patches, patch],
            },
            summary: `Proposed a replacement for ${section.label}`,
            progressMade: true,
          };
        },
      },
      {
        name: "update_resume_bullet",
        description:
          "Propose a grounded rewrite of one bullet in one experience or project entry. Use the section, entry and bullet ids from read_resume_context. The runtime adds patch IDs, timestamps and origin automatically.",
        inputSchema: ResumeBulletTextInputSchema,
        parameters: jsonObject(
          {
            sectionId: { type: "string" },
            entryId: { type: "string" },
            bulletId: { type: "string" },
            newText: { type: "string" },
          },
          ["sectionId", "entryId", "bulletId", "newText"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ResumeBulletTextInputSchema.parse(toolInput);
          const section = context.state.draft.sections.find(
            (candidate) => candidate.id === parsed.sectionId,
          );
          if (!section)
            throw new Error("The requested résumé section does not exist.");
          if (section.locked)
            throw new Error("The requested résumé section is locked.");
          const entry = section.entries.find(
            (candidate) => candidate.id === parsed.entryId,
          );
          if (!entry)
            throw new Error(
              `Entry '${parsed.entryId}' is not in section '${section.id}'. Entry ids in this section: ${section.entries.map((candidate) => candidate.id).join(", ") || "none"}.`,
            );
          const bullet = entry.bullets.find(
            (candidate) => candidate.id === parsed.bulletId,
          );
          if (!bullet)
            throw new Error(
              `Bullet '${parsed.bulletId}' is not in entry '${entry.id}'. Bullet ids in this entry: ${entry.bullets.map((candidate) => candidate.id).join(", ") || "none"}.`,
            );
          if (bullet.locked || entry.locked)
            throw new Error("The requested bullet is locked.");
          const patch = ResumeDraftPatchSchema.parse({
            id: `resume_patch_${context.draft.patches.length + 1}`,
            draftId: context.state.draft.id,
            operation: "update_bullet",
            targetSectionId: section.id,
            targetEntryId: entry.id,
            targetBulletId: bullet.id,
            newText: parsed.newText,
            appliedAt: new Date().toISOString(),
            origin: "assistant",
          });
          return {
            draft: {
              ...context.draft,
              patches: [...context.draft.patches, patch],
            },
            summary: `Proposed a rewrite of one bullet in ${entry.title ?? section.label}`,
            progressMade: true,
          };
        },
      },
      {
        name: "add_resume_patch",
        description:
          "Add one validated bounded patch to the temporary résumé proposal.",
        inputSchema: ResumePatchInputSchema,
        parameters: jsonObject(
          { patch: { type: "object", additionalProperties: true } },
          ["patch"],
        ),
        permission: "draft_write",
        execute(toolInput, context) {
          const parsed = ResumePatchInputSchema.parse(toolInput);
          const patch: ResumeDraftPatch = parsed.patch;
          const missing = describeMissingPatchFields(patch);
          if (missing) {
            throw new Error(missing);
          }
          return {
            draft: {
              ...context.draft,
              patches: [...context.draft.patches, patch],
            },
            summary: "Added one résumé patch",
            progressMade: true,
          };
        },
      },
      {
        name: "validate_resume_draft",
        description:
          "Validate the temporary résumé proposal and return exact repair errors.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        execute(_toolInput, context) {
          const parsed = ResumeAssistantReplySchema.safeParse(context.draft);
          return {
            summary: parsed.success
              ? "Résumé proposal is valid"
              : "Résumé proposal needs repair",
            validationIssues: parsed.success ? [] : zodIssues(parsed.error),
          };
        },
      },
      {
        name: "finish_task",
        description: "Finish only after the résumé proposal validates.",
        inputSchema: EmptyInputSchema,
        parameters: jsonObject({}),
        permission: "read",
        execute() {
          return { summary: "Finish requested", finish: true };
        },
      },
    ],
    validate: (draft) => {
      const parsed = ResumeAssistantReplySchema.safeParse(draft);
      return parsed.success ? [] : zodIssues(parsed.error);
    },
    buildContext: ({ state, draft, validationIssues }) =>
      compactOpenAiCompatibleUserPayload({
        operation: "reviseResumeDraft",
        modelContextWindowTokens: 196_000,
        systemPrompt: "Guided résumé edit tool task",
        userPayload: jsonSafe({
          request: state.request,
          draft: state.draft,
          job: state.job,
          priorValidationIssues: state.validationIssues,
          researchContext: state.researchContext,
          currentProposal: draft,
          validationIssues,
        }),
      }),
    // Two or three tool turns on a slower model; each turn has its own
    // timeout, this bounds the whole request.
    timeBudgetMs: 150_000,
    noProgressLimit: 4,
  });

  return ResumeAssistantReplySchema.parse({
    ...result.draft,
    executionReceipt: result.receipt,
  });
}
