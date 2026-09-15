/**
 * The one loop every Job Finder agent runs on.
 *
 * The model is told the goal, given tools, and left to decide. This loop does
 * the small set of things that must not depend on a model being right, and
 * nothing else:
 *
 * - it hands each tool's answer back, including a browser failure, as a fact
 *   the model can act on rather than as the end of the run
 * - it warns once when nothing has moved for a while, and only ends the run
 *   if nothing moves after that either
 * - it keeps the run inside a time and step ceiling far above what an honest
 *   run needs, so a broken site cannot hold it forever
 * - it trims a long conversation so a run that takes hundreds of steps keeps
 *   fitting, and says what it trimmed
 *
 * Deciding where to go, what to press, when the goal is met, and what to tell
 * the person is the model's. See ADR 0023.
 */

export type AgentLoopMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AgentLoopToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface AgentLoopToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** The shape the model is handed for one tool. */
export interface AgentLoopToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface AgentLoopModel {
  chatWithTools: (
    messages: AgentLoopMessage[],
    tools: AgentLoopToolDefinition[],
    options?: { signal?: AbortSignal; maxOutputTokens?: number },
  ) => Promise<{
    content?: string;
    toolCalls?: AgentLoopToolCall[];
  }>;
}

/** What the model said when it finished, in its own words plus typed extras. */
export interface AgentLoopFinish {
  reason: string;
  stuck: boolean;
  needsPerson: boolean;
  data: Record<string, unknown>;
}

export type AgentLoopToolOutcome =
  /** The tool did its work, or refused with a reason. Either way the model reads it. */
  | { kind: "ok"; content: string; progress?: boolean }
  /** The model finished. */
  | { kind: "finish"; finish: AgentLoopFinish }
  /** A safety rule ended the run. The person reads `reason`. */
  | { kind: "stop"; reason: string; data?: unknown };

export interface AgentLoopToolContext {
  step: number;
  signal?: AbortSignal;
}

export interface AgentLoopTool {
  definition: AgentLoopToolDefinition;
  /** Only page tools count repeated thrown failures as a dead browser. */
  failureKind?: "browser" | "tool";
  /** Converts a page-library exception into safe, plain words for the model. */
  describeError?: (error: unknown) => string;
  /** Receives the raw JSON the model sent; the tool parses and validates it. */
  execute: (
    rawArguments: string,
    context: AgentLoopToolContext,
  ) => Promise<AgentLoopToolOutcome>;
}

export interface AgentLoopCeilings {
  /** Safety only. Far above an honest run. */
  maxSteps?: number;
  timeBudgetMs?: number;
  /** Steps without progress before the one stall warning; the same again ends the run. */
  noProgressStepLimit?: number;
  /** Browser failures in a row that end the run. */
  browserFailureLimit?: number;
}

export interface AgentLoopOptions {
  /** System prompt, opening messages, and anything a resumed run already had. */
  messages: AgentLoopMessage[];
  model: AgentLoopModel;
  tools: AgentLoopTool[];
  /** What the run is on, in the person's words: "the careers site". */
  subjectLabel: string;
  ceilings?: AgentLoopCeilings;
  /** Called after every step with the loop's own one-line note. */
  onStep?: (info: {
    step: number;
    note: string;
    progressSteps: number;
    elapsedMs: number;
  }) => void;
  /** Extra lines for the stall warning, such as where the run is. */
  describeStall?: () => string | null;
  /** Rough size at which older turns are trimmed. */
  compactionMaxChars?: number;
  signal?: AbortSignal;
  now?: () => Date;
}

export type AgentLoopEnding =
  | "finished"
  | "stopped"
  | "stalled"
  | "timed_out"
  | "ceiling"
  | "aborted"
  | "browser_failed";

export interface AgentLoopResult {
  ending: AgentLoopEnding;
  /** One plain sentence about how the run ended. Shown to the person as-is. */
  reason: string;
  finish: AgentLoopFinish | null;
  stop: { reason: string; data?: unknown } | null;
  steps: number;
  progressSteps: number;
  /** One line per turn: what the model asked for and what came of it. */
  turnNotes: string[];
  messages: AgentLoopMessage[];
  timing: { totalMs: number; modelMs: number; toolMs: number; modelTurns: number };
}

const DEFAULT_MAX_STEPS = 300;
const DEFAULT_TIME_BUDGET_MS = 20 * 60_000;
const DEFAULT_NO_PROGRESS_STEP_LIMIT = 12;
const DEFAULT_BROWSER_FAILURE_LIMIT = 3;
const DEFAULT_COMPACTION_MAX_CHARS = 360_000;
const COMPACTION_KEEP_RECENT = 14;

export function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function endSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function messageChars(message: AgentLoopMessage): number {
  const base = message.content.length;
  return message.role === "assistant" && message.toolCalls
    ? base + JSON.stringify(message.toolCalls).length
    : base;
}

/**
 * Trims the middle of a long conversation.
 *
 * The opening (system prompt and the goal) and the most recent turns stay
 * word for word. Everything between is replaced by the loop's own turn notes,
 * so the model still knows what it did and what came of it.
 */
function compactMessages(
  messages: AgentLoopMessage[],
  openingCount: number,
  turnNotes: readonly string[],
  maxChars: number,
): AgentLoopMessage[] {
  const total = messages.reduce((sum, message) => sum + messageChars(message), 0);
  if (total <= maxChars || messages.length <= openingCount + COMPACTION_KEEP_RECENT) {
    return messages;
  }
  // Cut only at an assistant message, so a tool result never loses the call
  // it answers.
  let cut = messages.length - COMPACTION_KEEP_RECENT;
  while (cut > openingCount && messages[cut]?.role !== "assistant") {
    cut -= 1;
  }
  if (cut <= openingCount) {
    return messages;
  }
  const summary = [
    "Earlier turns were trimmed to save room. What happened in them, in order:",
    ...turnNotes.slice(-80).map((note) => `- ${note}`),
    "The most recent turns follow in full.",
  ].join("\n");
  return [
    ...messages.slice(0, openingCount),
    { role: "user", content: summary },
    ...messages.slice(cut),
  ];
}

export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const now = options.now ?? (() => new Date());
  const startedAtMs = now().getTime();
  const maxSteps = Math.max(1, options.ceilings?.maxSteps ?? DEFAULT_MAX_STEPS);
  const timeBudgetMs = Math.max(
    1,
    options.ceilings?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS,
  );
  const noProgressStepLimit = Math.max(
    3,
    options.ceilings?.noProgressStepLimit ?? DEFAULT_NO_PROGRESS_STEP_LIMIT,
  );
  const browserFailureLimit = Math.max(
    1,
    options.ceilings?.browserFailureLimit ?? DEFAULT_BROWSER_FAILURE_LIMIT,
  );
  const compactionMaxChars =
    options.compactionMaxChars ?? DEFAULT_COMPACTION_MAX_CHARS;

  let messages: AgentLoopMessage[] = [...options.messages];
  const openingCount = messages.length;
  const toolsByName = new Map(
    options.tools.map((tool) => [tool.definition.function.name, tool]),
  );
  const definitions = options.tools.map((tool) => tool.definition);
  const turnNotes: string[] = [];

  let steps = 0;
  let progressSteps = 0;
  let lastProgressStep = 0;
  let stallWarningStep: number | null = null;
  let consecutiveBrowserFailures = 0;
  let modelMs = 0;
  let toolMs = 0;
  let modelTurns = 0;

  const elapsed = (): number => now().getTime() - startedAtMs;
  const note = (text: string): void => {
    turnNotes.push(`turn ${steps}: ${text}`);
    options.onStep?.({
      step: steps,
      note: text,
      progressSteps,
      elapsedMs: elapsed(),
    });
  };
  const result = (
    ending: AgentLoopEnding,
    reason: string,
    extra: { finish?: AgentLoopFinish; stop?: { reason: string; data?: unknown } } = {},
  ): AgentLoopResult => ({
    ending,
    reason,
    finish: extra.finish ?? null,
    stop: extra.stop ?? null,
    steps,
    progressSteps,
    turnNotes,
    messages,
    timing: { totalMs: elapsed(), modelMs, toolMs, modelTurns },
  });
  const markProgress = (): void => {
    progressSteps += 1;
    lastProgressStep = steps;
    stallWarningStep = null;
  };

  while (steps < maxSteps) {
    if (options.signal?.aborted) {
      return result(
        "aborted",
        `Job Finder stopped work on ${options.subjectLabel} before it was finished.`,
      );
    }
    if (elapsed() >= timeBudgetMs) {
      return result(
        "timed_out",
        `Job Finder ran out of time on ${options.subjectLabel} before it was finished. Everything it did so far is kept.`,
      );
    }

    const stepsWithoutProgress = steps - lastProgressStep;
    if (
      stallWarningStep === null &&
      steps > 0 &&
      stepsWithoutProgress >= noProgressStepLimit
    ) {
      stallWarningStep = steps;
      messages.push({
        role: "user",
        content: [
          `Stall check: the last ${stepsWithoutProgress} steps changed nothing.`,
          options.describeStall?.() ?? null,
          "Either try something different now, or call finish and say exactly what is blocking you, in words the person can act on. Do not repeat the same step.",
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
      });
    } else if (
      stallWarningStep !== null &&
      lastProgressStep < stallWarningStep &&
      steps - stallWarningStep >= noProgressStepLimit
    ) {
      return result(
        "stalled",
        `Job Finder stopped on ${options.subjectLabel} because nothing new happened after several tries, even after changing approach.`,
      );
    }

    steps += 1;
    const modelStartedAt = now().getTime();
    let response: Awaited<ReturnType<AgentLoopModel["chatWithTools"]>>;
    try {
      response = await options.model.chatWithTools(
        messages,
        definitions,
        options.signal ? { signal: options.signal } : {},
      );
    } finally {
      modelMs += now().getTime() - modelStartedAt;
      modelTurns += 1;
    }

    const toolCalls = response.toolCalls ?? [];
    if (toolCalls.length === 0) {
      messages.push({ role: "assistant", content: response.content ?? "" });
      messages.push({
        role: "user",
        content:
          "Answer with one of the tools. Look at the page again if you need to, or call finish if there is nothing left to do.",
      });
      note("answered without a tool");
      continue;
    }

    messages.push({
      role: "assistant",
      content: response.content ?? "",
      toolCalls,
    });

    let ended: AgentLoopResult | null = null;
    for (const toolCall of toolCalls) {
      if (ended) {
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: "The run ended before this step was reached.",
        });
        continue;
      }
      if (options.signal?.aborted) {
        ended = result(
          "aborted",
          `Job Finder stopped work on ${options.subjectLabel} before it was finished.`,
        );
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: "The run was stopped before this step was reached.",
        });
        continue;
      }
      if (elapsed() >= timeBudgetMs) {
        ended = result(
          "timed_out",
          `Job Finder ran out of time on ${options.subjectLabel} before it was finished. Everything it did so far is kept.`,
        );
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: "The safety time limit was reached before this step was run.",
        });
        continue;
      }
      const tool = toolsByName.get(toolCall.function.name);
      if (!tool) {
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: `There is no tool called ${toolCall.function.name}.`,
        });
        note(`asked for unknown tool ${toolCall.function.name}`);
        continue;
      }

      const toolStartedAt = now().getTime();
      let outcome: AgentLoopToolOutcome;
      try {
        outcome = await tool.execute(toolCall.function.arguments, {
          step: steps,
          ...(options.signal ? { signal: options.signal } : {}),
        });
        if (tool.failureKind === "browser") {
          consecutiveBrowserFailures = 0;
        }
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          options.signal?.aborted
        ) {
          ended = result(
            "aborted",
            `Job Finder stopped work on ${options.subjectLabel} before it was finished.`,
          );
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: "The run was stopped during this step.",
          });
          continue;
        }
        if (tool.failureKind !== "browser") {
          consecutiveBrowserFailures = 0;
          note(`${toolCall.function.name} → tool failure`);
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content:
              "That tool could not complete this step. Try a different approach, or finish and explain what remains.",
          });
          continue;
        }
        // Only a page tool can increment the dead-browser counter. Its own
        // descriptor removes library internals before the model or person sees it.
        consecutiveBrowserFailures += 1;
        const failure = endSentence(
          tool.describeError?.(error) ?? "The browser did not respond.",
        );
        note(`${toolCall.function.name} → browser failure: ${failure}`);
        if (consecutiveBrowserFailures >= browserFailureLimit) {
          ended = result(
            "browser_failed",
            `Job Finder stopped on ${options.subjectLabel} because the browser page stopped responding. ${failure} Everything it did so far is kept.`,
          );
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: `That step did not complete: ${failure}`,
          });
          continue;
        }
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: `That step did not complete: ${failure} Look at the page again before deciding what to do next; if this keeps happening, finish and say what happened.`,
        });
        continue;
      } finally {
        toolMs += now().getTime() - toolStartedAt;
      }

      switch (outcome.kind) {
        case "ok": {
          if (outcome.progress) {
            markProgress();
          }
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: outcome.content,
          });
          note(
            `${toolCall.function.name} → ${outcome.content.split("\n")[0]?.slice(0, 160) ?? "ok"}`,
          );
          break;
        }
        case "finish": {
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: "Finished.",
          });
          note(
            `finished${outcome.finish.stuck ? " as stuck" : ""}${outcome.finish.needsPerson ? " (needs the person)" : ""}: ${outcome.finish.reason}`,
          );
          ended = result("finished", endSentence(outcome.finish.reason), {
            finish: outcome.finish,
          });
          break;
        }
        case "stop": {
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: `Job Finder stopped the run: ${outcome.reason}`,
          });
          note(`stopped: ${outcome.reason}`);
          ended = result("stopped", endSentence(outcome.reason), {
            stop: { reason: outcome.reason, ...(outcome.data !== undefined ? { data: outcome.data } : {}) },
          });
          break;
        }
        default: {
          const exhaustive: never = outcome;
          throw new Error(`Unhandled tool outcome: ${JSON.stringify(exhaustive)}`);
        }
      }
    }
    if (ended) {
      return ended;
    }
    messages = compactMessages(messages, openingCount, turnNotes, compactionMaxChars);
  }

  return result(
    "ceiling",
    `Job Finder stopped on ${options.subjectLabel} after a very long run without finishing. Everything it did so far is kept.`,
  );
}
