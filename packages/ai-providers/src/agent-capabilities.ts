import { runAgentTask, type AgentTaskModel } from "@unemployed/agent-runtime";
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
  type AgentTaskValidationIssue,
  type ProfileCopilotPatchGroup,
  type ProfileCopilotPatchOperation,
  type ProfileCopilotReply,
  type ResumeDraftPatch,
} from "@unemployed/contracts";
import { z } from "zod";

import {
  ResumeAssistantReplySchema,
  type AgentCapableJobFinderAiClient,
  type ResumeAssistantReply,
  type ReviseCandidateProfileInput,
  type ReviseResumeDraftInput,
} from "./shared";
import { compactOpenAiCompatibleUserPayload } from "./openai-compatible-request-compaction";

const EmptyInputSchema = z.object({});
const ContentInputSchema = z.object({ content: z.string().trim().min(1) });
const ResumePatchInputSchema = z.object({ patch: ResumeDraftPatchSchema });
const ResumeSectionTextInputSchema = z.object({
  sectionId: z.string().trim().min(1),
  newText: z.string().trim().min(1),
});

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
): AgentTaskModel {
  const status = client.getStatus();
  return {
    model: status.model,
    reasoningEffort: null,
    async chat(input) {
      return client.chatWithTools(
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
        input.signal ? { signal: input.signal } : undefined,
      );
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
      "Use propose_profile_operations for profile edits: it is the universal path that accepts every schema-valid operation kind and wraps them into one needs_review group per call with runtime-assigned id, apply mode, and timestamp. The dedicated set_* tools remain as conveniences.",
      "Answer grounded questions directly. For edits, set helpful response content and add one or more bounded patch groups.",
      "Never invent experience, credentials, dates, compensation currency, or metrics. Broad or ambiguous edits need review.",
      "Call validate_profile_draft, repair every issue, then finish_task.",
    ].join(" "),
    state: input.request,
    initialDraft,
    model: createModelAdapter(input.client),
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
                "Each entry carries an operation discriminator (for example replace_identity_fields, upsert_experience_record, remove_link_record, resolve_review_items) plus its payload: value, record, recordId, or reviewItemIds with resolutionStatus.",
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
    timeBudgetMs: 90_000,
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
      "Prefer replace_resume_section_text for ordinary section prose changes; use add_resume_patch only when no dedicated tool fits.",
      "Set a useful response and add only bounded patches supported by the supplied draft and job evidence.",
      "Never invent facts, dates, metrics, credentials, or outcomes. Do not touch locked content.",
      "Validate the draft, repair every issue, then finish_task.",
    ].join(" "),
    state: input.request,
    initialDraft,
    model: createModelAdapter(input.client),
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
    timeBudgetMs: 90_000,
    noProgressLimit: 4,
  });

  return ResumeAssistantReplySchema.parse({
    ...result.draft,
    executionReceipt: result.receipt,
  });
}
