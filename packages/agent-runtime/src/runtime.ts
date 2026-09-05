import {
  AgentTaskExecutionReceiptSchema,
  AgentTaskProgressSchema,
  AgentTaskToolReceiptSchema,
  type AgentTaskCheckpoint,
  type AgentTaskExecutionReceipt,
  type AgentTaskFailureKind,
  type AgentTaskProgress,
  type AgentTaskStopReason,
  type AgentTaskValidationIssue,
  type AgentToolPermission,
  type Tool,
  type ToolCall,
} from "@unemployed/contracts";
import type { z } from "zod";

import { AgentTaskResultStore } from "./result-store";

export interface AgentTaskMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface AgentTaskModel {
  readonly model?: string | null;
  readonly reasoningEffort?: string | null;
  chat(input: {
    messages: readonly AgentTaskMessage[];
    tools: readonly Tool[];
    signal?: AbortSignal;
  }): Promise<{ content?: string; toolCalls?: ToolCall[] }>;
}

export interface AgentTaskToolContext<TState, TDraft> {
  readonly state: TState;
  draft: TDraft;
  readonly results: AgentTaskResultStore;
  readonly signal?: AbortSignal;
}

export interface AgentTaskTool<TState, TDraft, TInput> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly parameters: Record<string, unknown>;
  readonly permission: AgentToolPermission;
  readonly parallelSafe?: boolean;
  execute(
    input: TInput,
    context: AgentTaskToolContext<TState, TDraft>,
  ):
    | Promise<{
        draft?: TDraft;
        value?: unknown;
        summary: string;
        progressMade?: boolean;
        validationIssues?: readonly AgentTaskValidationIssue[];
        finish?: boolean;
      }>
    | {
        draft?: TDraft;
        value?: unknown;
        summary: string;
        progressMade?: boolean;
        validationIssues?: readonly AgentTaskValidationIssue[];
        finish?: boolean;
      };
}

export interface AgentTaskCheckpointStore {
  load(taskId: string): Promise<AgentTaskCheckpoint | null>;
  save(checkpoint: AgentTaskCheckpoint): Promise<void>;
}

export interface AgentTaskRunOptions<TState, TDraft> {
  readonly taskId: string;
  readonly capability: string;
  readonly systemPrompt: string;
  readonly state: TState;
  readonly initialDraft: TDraft;
  readonly model: AgentTaskModel;
  readonly tools: readonly AgentTaskTool<TState, TDraft, unknown>[];
  readonly validate: (draft: TDraft) => readonly AgentTaskValidationIssue[];
  readonly buildContext: (input: {
    state: TState;
    draft: TDraft;
    validationIssues: readonly AgentTaskValidationIssue[];
  }) => unknown;
  readonly signal?: AbortSignal;
  readonly timeBudgetMs?: number;
  /** A provider-call ceiling used as the deterministic cost guard. */
  readonly providerCallBudget?: number;
  readonly noProgressLimit?: number;
  readonly emergencyCeiling?: number;
  readonly checkpointStore?: AgentTaskCheckpointStore;
  readonly onProgress?: (progress: AgentTaskProgress) => void;
}

export interface AgentTaskRunResult<TDraft> {
  readonly draft: TDraft;
  readonly receipt: AgentTaskExecutionReceipt;
}

export function classifyAgentTaskFailure(error: unknown): AgentTaskFailureKind {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "cancelled";
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/timeout|timed out|429|rate limit|overload|temporar/.test(message)) {
    return "transient_provider";
  }
  if (/fetch failed|network|econn|socket|dns/.test(message)) {
    return "transient_network";
  }
  if (/validation|invalid|schema|parse/.test(message)) return "validation";
  if (/stale|detached|page closed|context destroyed/.test(message)) {
    return "stale_state";
  }
  if (/sign.?in|login|captcha|mfa|credential/.test(message)) {
    return "user_action_required";
  }
  if (/unsafe|forbidden|permission|policy/.test(message)) {
    return "safety_boundary";
  }
  return error instanceof Error ? "permanent" : "unknown";
}

function shouldRetry(kind: AgentTaskFailureKind): boolean {
  return kind === "transient_provider" || kind === "transient_network";
}

async function waitForBackoff(attempt: number, signal?: AbortSignal) {
  const delayMs = Math.min(4_000, 300 * 2 ** attempt) + attempt * 37;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

function issueFromZod(error: z.ZodError): AgentTaskValidationIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path,
  }));
}

export async function runAgentTask<TState, TDraft>(
  options: AgentTaskRunOptions<TState, TDraft>,
): Promise<AgentTaskRunResult<TDraft>> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const timeBudgetMs = Math.max(1_000, options.timeBudgetMs ?? 90_000);
  const noProgressLimit = Math.max(1, options.noProgressLimit ?? 4);
  const providerCallBudget = Math.max(1, options.providerCallBudget ?? 24);
  const emergencyCeiling = Math.max(4, options.emergencyCeiling ?? 32);
  const results = new AgentTaskResultStore();
  const toolsByName = new Map(options.tools.map((tool) => [tool.name, tool]));
  let draft = options.initialDraft;
  let providerCalls = 0;
  let repairAttempts = 0;
  let revision = 0;
  let consecutiveNoProgress = 0;
  let validationIssues = [...options.validate(draft)];
  let stopReason: AgentTaskStopReason = "emergency_ceiling";
  const toolReceipts: AgentTaskExecutionReceipt["toolReceipts"][number][] = [];
  const recentMessages: AgentTaskMessage[] = [];

  const emitProgress = (phase: string, message: string) => {
    const progress = AgentTaskProgressSchema.parse({
      phase,
      message,
      distinctResults: toolReceipts.filter((receipt) => receipt.progressMade)
        .length,
      validationIssuesRemaining: validationIssues.length,
      elapsedMs: Date.now() - startedAtMs,
      updatedAt: new Date().toISOString(),
    });
    options.onProgress?.(progress);
    return progress;
  };

  const saveCheckpoint = async (progress: AgentTaskProgress) => {
    if (!options.checkpointStore) return;
    await options.checkpointStore.save({
      taskId: options.taskId,
      capability: options.capability,
      revision: ++revision,
      updatedAt: new Date().toISOString(),
      state: options.state,
      draft,
      progress,
      toolReceipts,
    });
  };

  for (let cycle = 0; cycle < emergencyCeiling; cycle += 1) {
    if (options.signal?.aborted) {
      stopReason = "cancelled";
      break;
    }
    if (Date.now() - startedAtMs >= timeBudgetMs) {
      stopReason = "time_budget";
      break;
    }
    if (providerCalls >= providerCallBudget) {
      stopReason = "cost_budget";
      break;
    }
    if (consecutiveNoProgress >= noProgressLimit) {
      stopReason = "no_progress";
      break;
    }

    const context = options.buildContext({
      state: options.state,
      draft,
      validationIssues,
    });
    const taskPayload =
      context && typeof context === "object" && !Array.isArray(context)
        ? {
            ...(context as Record<string, unknown>),
            instruction:
              "Use the available tools to update the task draft. Validate it, repair any reported issues, then call finish_task. The typed task state below is authoritative; chat history is not.",
          }
        : {
            task: context,
            instruction:
              "Use the available tools to update the task draft. Validate it, repair any reported issues, then call finish_task. The typed task state below is authoritative; chat history is not.",
          };
    const messages: AgentTaskMessage[] = [
      { role: "system", content: options.systemPrompt },
      {
        role: "user",
        content: JSON.stringify(taskPayload),
      },
      ...recentMessages.slice(-8),
    ];

    emitProgress("thinking", "Working on the next useful change");
    let response: Awaited<ReturnType<AgentTaskModel["chat"]>> | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (providerCalls >= providerCallBudget) {
        stopReason = "cost_budget";
        break;
      }
      try {
        providerCalls += 1;
        response = await options.model.chat({
          messages,
          tools: options.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        break;
      } catch (error) {
        const failureKind = classifyAgentTaskFailure(error);
        if (!shouldRetry(failureKind) || attempt === 2) throw error;
        await waitForBackoff(attempt, options.signal);
      }
    }
    if (!response) {
      if (stopReason !== "cost_budget") stopReason = "permanent_failure";
      break;
    }
    recentMessages.push({
      role: "assistant",
      content: response.content ?? "",
      ...(response.toolCalls ? { toolCalls: response.toolCalls } : {}),
    });

    const calls = response.toolCalls ?? [];
    if (calls.length === 0) {
      consecutiveNoProgress += 1;
      recentMessages.push({
        role: "user",
        content:
          "No tool was called. Use the tools to change or validate the draft, or call finish_task only when it is valid.",
      });
      continue;
    }

    const parallelReads = calls.filter(
      (call) => toolsByName.get(call.function.name)?.parallelSafe === true,
    );
    const orderedCalls = calls.filter(
      (call) => toolsByName.get(call.function.name)?.parallelSafe !== true,
    );
    let finishRequested = false;

    const executeCall = async (call: ToolCall) => {
      const started = Date.now();
      const tool = toolsByName.get(call.function.name);
      let outcome: "succeeded" | "rejected" | "failed" = "succeeded";
      let failureKind: AgentTaskFailureKind | null = null;
      let progressMade = false;
      let resultHandle: string | null = null;
      let issues: readonly AgentTaskValidationIssue[] = [];
      let toolContent: unknown;

      if (!tool || tool.permission === "external_action") {
        outcome = "rejected";
        failureKind = "safety_boundary";
        toolContent = {
          ok: false,
          error: tool
            ? "External actions are outside the agent task boundary."
            : "Unknown tool.",
        };
      } else {
        try {
          const rawArgs: unknown = JSON.parse(call.function.arguments || "{}");
          const parsed = tool.inputSchema.safeParse(rawArgs);
          if (!parsed.success) {
            outcome = "rejected";
            failureKind = "validation";
            issues = issueFromZod(parsed.error);
            repairAttempts += 1;
            toolContent = { ok: false, validationIssues: issues };
          } else {
            const execution = await tool.execute(parsed.data, {
              state: options.state,
              draft,
              results,
              ...(options.signal ? { signal: options.signal } : {}),
            });
            if (execution.draft !== undefined) draft = execution.draft;
            progressMade = execution.progressMade ?? false;
            issues = execution.validationIssues ?? [];
            finishRequested ||= execution.finish ?? false;
            if (execution.value !== undefined) {
              const stored = results.put({
                summary: execution.summary,
                value: execution.value,
              });
              resultHandle = stored.reference.handle;
              toolContent = {
                ok: true,
                result: stored.reference,
                inlineItems: stored.inlineItems,
                validationIssues: issues,
              };
            } else {
              toolContent = {
                ok: true,
                summary: execution.summary,
                validationIssues: issues,
              };
            }
          }
        } catch (error) {
          outcome = "failed";
          failureKind = classifyAgentTaskFailure(error);
          toolContent = {
            ok: false,
            failureKind,
            error: error instanceof Error ? error.message : "Tool failed",
          };
        }
      }

      toolReceipts.push(
        AgentTaskToolReceiptSchema.parse({
          toolCallId: call.id,
          toolName: call.function.name,
          permission: tool?.permission ?? "read",
          startedAt: new Date(started).toISOString(),
          durationMs: Date.now() - started,
          outcome,
          failureKind,
          progressMade,
          resultHandle,
          validationIssues: issues,
        }),
      );
      recentMessages.push({
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify(toolContent),
      });
      return progressMade;
    };

    const receiptStart = toolReceipts.length;
    const readProgress = await Promise.all(parallelReads.map(executeCall));
    const orderedProgress: boolean[] = [];
    for (const call of orderedCalls)
      orderedProgress.push(await executeCall(call));
    const madeProgress = [...readProgress, ...orderedProgress].some(Boolean);
    validationIssues = [...options.validate(draft)];
    consecutiveNoProgress = madeProgress ? 0 : consecutiveNoProgress + 1;
    const progress = emitProgress(
      validationIssues.length === 0 ? "ready" : "repairing",
      validationIssues.length === 0
        ? "Draft is valid"
        : `${validationIssues.length} validation issue${validationIssues.length === 1 ? "" : "s"} still need repair`,
    );
    await saveCheckpoint(progress);

    const terminalFailure = toolReceipts
      .slice(receiptStart)
      .find((receipt) =>
        [
          "user_action_required",
          "safety_boundary",
          "permanent",
          "cancelled",
        ].includes(receipt.failureKind ?? ""),
      );
    if (terminalFailure) {
      stopReason =
        terminalFailure.failureKind === "user_action_required"
          ? "user_action_required"
          : terminalFailure.failureKind === "safety_boundary"
            ? "safety_boundary"
            : terminalFailure.failureKind === "cancelled"
              ? "cancelled"
              : "permanent_failure";
      break;
    }

    if (finishRequested) {
      if (validationIssues.length === 0) {
        stopReason = "completed";
        break;
      }
      repairAttempts += 1;
      recentMessages.push({
        role: "user",
        content: JSON.stringify({
          finishRejected: true,
          validationIssues,
          instruction: "Repair these issues before finishing.",
        }),
      });
    }
  }

  const completedAtMs = Date.now();
  return {
    draft,
    receipt: AgentTaskExecutionReceiptSchema.parse({
      taskId: options.taskId,
      capability: options.capability,
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: completedAtMs - startedAtMs,
      model: options.model.model ?? null,
      reasoningEffort: options.model.reasoningEffort ?? null,
      providerCalls,
      repairAttempts,
      fallbackUsed: false,
      stopReason,
      finalValidationIssues: validationIssues,
      toolReceipts,
    }),
  };
}
