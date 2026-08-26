import { describe, expect, test } from "vitest";
import { ResumeDraftSchema } from "@unemployed/contracts";

import {
  runProfileCopilotAgentTask,
  runResumeEditAgentTask,
} from "./agent-capabilities";
import type { AgentCapableJobFinderAiClient } from "./shared";
import {
  createJobPosting,
  createPreferences,
  createProfile,
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
});
