import type { LLMClient } from "../agent/contracts";
import type { AgentMessage } from "../types";

import { getApplyToolDefinitions, parseApplyProposal } from "./apply-tools";
import {
  buildStallWarning,
  createApplySystemPrompt,
  createApplyUserPrompt,
  describeObservation,
} from "./apply-prompts";
import {
  createApplyGuardState,
  executeApplyProposal,
} from "./policy-executor";
import type {
  ApplyAgentConfig,
  ApplyAgentResult,
  ApplyAttachedDocument,
  ApplyFilledControl,
  ApplyFormObservation,
  ApplyPause,
} from "./types";

/**
 * The loop that fills in one application.
 *
 * It is the same shape as the discovery loop: the agent is told the goal and
 * decides when it is done, a stall gets one warning before the run ends, and
 * the agent can stop itself by finishing as stuck. The numbers below are
 * safety ceilings, far above what an honest application needs — they are not
 * a budget the agent is meant to spend.
 */

const DEFAULT_MAX_STEPS = 120;
const DEFAULT_TIME_BUDGET_MS = 8 * 60_000;
const DEFAULT_NO_PROGRESS_STEP_LIMIT = 8;

function defaultOutcomeFor(
  config: ApplyAgentConfig,
): "prepared" | "awaiting_your_review" {
  return config.authority.mode === "confirm_before_submit"
    ? "awaiting_your_review"
    : "prepared";
}

function describePrepared(
  config: ApplyAgentConfig,
  filledCount: number,
  attachmentCount: number,
): string {
  const filledPart =
    filledCount === 1 ? "filled in 1 answer" : `filled in ${filledCount} answers`;
  const attachmentPart =
    attachmentCount === 0
      ? ""
      : attachmentCount === 1
        ? " and attached 1 file"
        : ` and attached ${attachmentCount} files`;
  const ending =
    config.authority.mode === "confirm_before_submit"
      ? "It is ready for you to look over and send."
      : "It is filled in and waiting; nothing was sent.";
  return `Job Finder ${filledPart}${attachmentPart} on ${config.siteLabel}. ${ending}`;
}

export async function runApplyAgent(
  config: ApplyAgentConfig,
  llmClient: LLMClient,
): Promise<ApplyAgentResult> {
  const now = config.now ?? (() => new Date());
  const startedAtMs = now().getTime();
  const maxSteps = Math.max(1, config.runControl?.maxSteps ?? DEFAULT_MAX_STEPS);
  const timeBudgetMs = Math.max(
    1,
    config.runControl?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS,
  );
  const noProgressStepLimit = Math.max(
    3,
    config.runControl?.noProgressStepLimit ?? DEFAULT_NO_PROGRESS_STEP_LIMIT,
  );

  const filled: ApplyFilledControl[] = [];
  const attachments: ApplyAttachedDocument[] = [];
  const pauses: ApplyPause[] = [];
  const notes: string[] = [];

  const messages: AgentMessage[] = [
    { role: "system", content: createApplySystemPrompt(config) },
    { role: "user", content: createApplyUserPrompt(config) },
  ];

  const guardState = createApplyGuardState();
  let observation: ApplyFormObservation | null = null;
  let readyToSend: ApplyAgentResult["readyToSend"] = null;
  let steps = 0;
  let lastProgressStep = 0;
  let stallWarningStep: number | null = null;

  const finish = (
    outcome: ApplyAgentResult["outcome"],
    reason: string,
  ): ApplyAgentResult => ({
    outcome,
    reason,
    steps,
    finalUrl: observation?.url ?? null,
    filled,
    attachments,
    pauses,
    // Traffic the guard blocked and safely ignored belongs in the same trail
    // as everything else that happened.
    notes: [...notes, ...guardState.notes],
    readyToSend,
  });

  try {
    observation = await config.hands.observe();
    if (observation.blocker) {
      const pause: ApplyPause = {
        code: "page_blocked",
        summary: observation.blocker.summary,
        question: null,
        blocker: observation.blocker,
      };
      pauses.push(pause);
      notes.push(observation.blocker.summary);
      return finish("paused", `${observation.blocker.summary} ${observation.blocker.detail}`);
    }
    messages.push({
      role: "user",
      content: `The form as it is now:\n\n${describeObservation(observation)}`,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "the page did not open";
    notes.push("The application page did not open.");
    return finish(
      "paused",
      `Job Finder could not open the application page on ${config.siteLabel}, so nothing was filled in.${detail ? "" : ""}`,
    );
  }

  while (steps < maxSteps) {
    if (config.signal?.aborted) {
      return finish(
        defaultOutcomeFor(config),
        `Job Finder stopped work on ${config.siteLabel} before the form was finished.`,
      );
    }
    if (now().getTime() - startedAtMs >= timeBudgetMs) {
      return finish(
        "stuck",
        `Job Finder ran out of time on ${config.siteLabel} before the form was finished. Everything it filled in is saved.`,
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
        content: buildStallWarning({ stepsWithoutProgress, observation }),
      });
    } else if (
      stallWarningStep !== null &&
      lastProgressStep < stallWarningStep &&
      steps - stallWarningStep >= noProgressStepLimit
    ) {
      return finish(
        "stuck",
        `Job Finder stopped on ${config.siteLabel} because the form stopped responding: nothing new happened after several tries, even after changing approach.`,
      );
    }

    steps += 1;

    const response = await llmClient.chatWithTools(
      messages,
      getApplyToolDefinitions(),
      config.signal ? { signal: config.signal } : {},
    );

    const toolCalls = response.toolCalls ?? [];
    if (toolCalls.length === 0) {
      messages.push({
        role: "assistant",
        content: response.content ?? "",
      });
      messages.push({
        role: "user",
        content:
          "Answer with one of the tools. Inspect the form if you need to see it again, or finish if there is nothing left to do.",
      });
      continue;
    }

    messages.push({
      role: "assistant",
      content: response.content ?? "",
      toolCalls,
    });

    for (const toolCall of toolCalls) {
      const parsed = parseApplyProposal(
        toolCall.function.name,
        toolCall.function.arguments,
      );
      if (!parsed.ok) {
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: parsed.error,
        });
        continue;
      }

      const outcome = await executeApplyProposal(
        parsed.proposal,
        observation?.signature ?? "",
        { config, now, guardState },
      );

      switch (outcome.kind) {
        case "observed": {
          observation = outcome.observation;
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: describeObservation(outcome.observation),
          });
          break;
        }
        case "filled": {
          filled.push(outcome.filled);
          observation = outcome.observation;
          lastProgressStep = steps;
          stallWarningStep = null;
          notes.push(
            `Answered "${outcome.filled.label}" from ${outcome.filled.answer.provenanceLabel}.`,
          );
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: `Filled in "${outcome.filled.label}". The form now looks like this:\n\n${describeObservation(outcome.observation)}`,
          });
          break;
        }
        case "attached": {
          attachments.push(outcome.attachment);
          observation = outcome.observation;
          lastProgressStep = steps;
          stallWarningStep = null;
          notes.push(
            `Attached ${outcome.attachment.label} to "${outcome.attachment.controlLabel}".`,
          );
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: `Attached ${outcome.attachment.label}. The form now looks like this:\n\n${describeObservation(outcome.observation)}`,
          });
          break;
        }
        case "moved": {
          observation = outcome.observation;
          lastProgressStep = steps;
          stallWarningStep = null;
          notes.push(`Moved on with "${outcome.actionLabel}".`);
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: `Pressed "${outcome.actionLabel}". The form now looks like this:\n\n${describeObservation(outcome.observation)}`,
          });
          break;
        }
        case "refused": {
          observation = outcome.observation;
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: `${outcome.reason}\n\nThe form as it is now:\n\n${describeObservation(outcome.observation)}`,
          });
          break;
        }
        case "paused": {
          pauses.push(outcome.pause);
          notes.push(outcome.pause.summary);
          return finish("paused", outcome.pause.summary);
        }
        case "ready_to_send": {
          observation = outcome.observation;
          readyToSend = {
            actionRef: outcome.finalActionRef,
            actionLabel: outcome.finalActionLabel,
          };
          lastProgressStep = steps;
          stallWarningStep = null;
          notes.push("The form is complete and ready to send.");
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content:
              "The form is complete and everything checks out. Nothing has been sent: call finish now.",
          });
          break;
        }
        case "finished": {
          if (outcome.stuck) {
            const reason = outcome.reason.replace(/\.?$/u, ".");
            notes.push(`Job Finder got stuck: ${reason}`);
            return finish(
              "stuck",
              `Job Finder stopped on ${config.siteLabel} because it got stuck: ${reason}`,
            );
          }
          notes.push(outcome.reason);
          if (readyToSend && config.authority.mode === "autonomous_submit") {
            return finish(
              "ready_to_send",
              `Job Finder filled this application in on ${config.siteLabel} and it is ready to send.`,
            );
          }
          return finish(
            defaultOutcomeFor(config),
            describePrepared(config, filled.length, attachments.length),
          );
        }
        default: {
          const exhaustive: never = outcome;
          throw new Error(`Unhandled apply outcome: ${JSON.stringify(exhaustive)}`);
        }
      }
    }
  }

  return finish(
    "stuck",
    `Job Finder stopped on ${config.siteLabel} after a very long run without finishing the form. Everything it filled in is saved.`,
  );
}
