import { describe, expect, test } from "vitest";
import { z } from "zod";

import { runAgentTask } from "./runtime";

describe("agent task runtime", () => {
  test("repairs a rejected tool call and finishes a valid draft", async () => {
    let call = 0;
    const result = await runAgentTask({
      taskId: "task_1",
      capability: "profile_copilot",
      systemPrompt: "Update the draft.",
      state: { saved: "old" },
      initialDraft: { value: "" },
      model: {
        model: "test-model",
        reasoningEffort: "high",
        chat() {
          call += 1;
          return Promise.resolve(
            call === 1
              ? {
                  toolCalls: [
                    {
                      id: "bad",
                      type: "function",
                      function: { name: "set_value", arguments: "{}" },
                    },
                  ],
                }
              : {
                  toolCalls: [
                    {
                      id: "set",
                      type: "function",
                      function: {
                        name: "set_value",
                        arguments: JSON.stringify({ value: "ready" }),
                      },
                    },
                    {
                      id: "finish",
                      type: "function",
                      function: { name: "finish_task", arguments: "{}" },
                    },
                  ],
                },
          );
        },
      },
      tools: [
        {
          name: "set_value",
          description: "Set the value",
          inputSchema: z.object({ value: z.string().min(1) }),
          parameters: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
          },
          permission: "draft_write",
          execute(input: { value: string }, context) {
            return {
              draft: { ...context.draft, value: input.value },
              summary: "Value set",
              progressMade: true,
            };
          },
        },
        {
          name: "finish_task",
          description: "Finish",
          inputSchema: z.object({}),
          parameters: { type: "object", properties: {} },
          permission: "read",
          execute() {
            return { summary: "Finish requested", finish: true };
          },
        },
      ],
      validate: (draft) =>
        draft.value
          ? []
          : [{ code: "required", message: "Value required", path: ["value"] }],
      buildContext: ({ state, draft, validationIssues }) => ({
        state,
        draft,
        validationIssues,
      }),
    });

    expect(result.draft.value).toBe("ready");
    expect(result.receipt.stopReason).toBe("completed");
    expect(result.receipt.repairAttempts).toBe(1);
  });

  test("rejects external-action tools without executing them", async () => {
    let executed = false;
    const result = await runAgentTask({
      taskId: "task_2",
      capability: "safe_boundary",
      systemPrompt: "Do not submit.",
      state: {},
      initialDraft: {},
      model: {
        chat() {
          return Promise.resolve({
            toolCalls: [
              {
                id: "submit",
                type: "function",
                function: { name: "submit_application", arguments: "{}" },
              },
            ],
          });
        },
      },
      tools: [
        {
          name: "submit_application",
          description: "Submit",
          inputSchema: z.object({}),
          parameters: { type: "object", properties: {} },
          permission: "external_action",
          execute() {
            executed = true;
            return { summary: "submitted" };
          },
        },
      ],
      validate: () => [],
      buildContext: () => ({}),
      noProgressLimit: 1,
    });

    expect(executed).toBe(false);
    expect(result.receipt.stopReason).toBe("safety_boundary");
    expect(result.receipt.toolReceipts[0]?.failureKind).toBe("safety_boundary");
  });

  test("stops on its provider-call cost guard without pretending it completed", async () => {
    const result = await runAgentTask({
      taskId: "task_cost_guard",
      capability: "bounded_task",
      systemPrompt: "Use a tool.",
      state: {},
      initialDraft: {},
      model: {
        chat() {
          return Promise.resolve({ content: "still thinking" });
        },
      },
      tools: [],
      validate: () => [],
      buildContext: () => ({}),
      providerCallBudget: 1,
      noProgressLimit: 5,
    });

    expect(result.receipt.providerCalls).toBe(1);
    expect(result.receipt.stopReason).toBe("cost_budget");
  });
});
