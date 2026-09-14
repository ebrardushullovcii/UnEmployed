import type { LLMClient } from "../agent/contracts";
import type { AgentMessage } from "../types";

import { getApplyToolDefinitions, parseApplyProposal } from "./apply-tools";
import { resolveApplyEntry } from "./apply-entry";
import { planSourceAnsweredFills } from "./apply-plan";
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
import type { ApplicationAttemptQuestion } from "@unemployed/contracts";

import type {
  ApplyAgentConfig,
  ApplyProposal,
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

/** What the person is told about the questions that were theirs to skip. */
const VOLUNTARY_NOTE =
  "Left the voluntary self-identification questions blank. They are yours to answer if you want to.";

/** One short line naming what a turn proposed. */
function describeProposal(proposal: ApplyProposal): string {
  switch (proposal.tool) {
    case "answer_control":
      return `proposed answer_control ${proposal.ref}${proposal.freeTextAnswer ? " with written text" : " with no text"}`;
    case "attach_document":
      return `proposed attach_document ${proposal.ref}`;
    case "go_to_step":
      return `proposed go_to_step ${proposal.ref}`;
    case "submit_application":
      return `proposed submit_application ${proposal.ref}`;
    case "inspect_form":
      return "inspected the form";
    case "read_blockers":
      return "read the blockers";
    default:
      return "finish";
  }
}

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

  // How long each part of the run took, in the person's own record. A run
  // that takes minutes has to be able to say where the minutes went.
  const phaseMs = new Map<string, number>();
  const countBy = new Map<string, number>();
  const timed = async <T,>(phase: string, work: () => Promise<T>): Promise<T> => {
    const startedAt = now().getTime();
    try {
      return await work();
    } finally {
      phaseMs.set(phase, (phaseMs.get(phase) ?? 0) + (now().getTime() - startedAt));
      countBy.set(phase, (countBy.get(phase) ?? 0) + 1);
    }
  };
  const readPhase = (phase: string): number => phaseMs.get(phase) ?? 0;

  const guardState = createApplyGuardState();
  // Questions the person has to answer, gathered as the form is worked and
  // asked for once at the end rather than one pause at a time.
  const pendingQuestions = new Map<string, ApplicationAttemptQuestion>();
  const pendingQuestionIds = new Set<string>();
  const pendingOrder: ApplicationAttemptQuestion[] = [];
  /** Controls this run has already written or handed over, so none is redone. */
  const workedControls = new Set<string>();
  /** How many times each control was written, so a lost value gets one retry. */
  const writeCounts = new Map<string, number>();
  /** What each model turn asked for and what came of it. */
  const turnNotes: string[] = [];
  let observation: ApplyFormObservation | null = null;
  let readyToSend: ApplyAgentResult["readyToSend"] = null;
  let steps = 0;
  let lastProgressStep = 0;
  let stallWarningStep: number | null = null;

  /**
   * Writes every field the sources already answer, then hands back the page.
   *
   * Runs once per screen: on arrival, and again after the form moves on. A
   * proposal the page refuses is left for the model rather than retried here.
   */
  const fillWhatTheSourcesAnswer = async (
    from: ApplyFormObservation,
  ): Promise<ApplyFormObservation> => {
    let current = from;
    // Filling a field can reveal another one, and a plan made from the first
    // read would miss it — the person would then answer, wait for a retry, and
    // meet the rest. The page is re-planned until nothing new comes up.
    for (let pass = 0; pass < 4; pass += 1) {
      const before = current.signature;
      current = await fillOnePass(current);
      const replanned = planSourceAnsweredFills(current, config, workedControls);
      if (replanned.length === 0 || current.signature === before) {
        break;
      }
    }
    return current;
  };

  const fillOnePass = async (
    from: ApplyFormObservation,
  ): Promise<ApplyFormObservation> => {
    let current = from;
    let skippedDeclarations = current.controls.filter(
      (control) =>
        control.visible &&
        !control.required &&
        control.attestationKind !== null &&
        !config.authority.preApprovedAttestationKinds.includes(
          control.attestationKind,
        ),
    ).length;
    for (const proposal of planSourceAnsweredFills(
      current,
      config,
      workedControls,
    )) {
      // A page can throw a value away after it was written (a resume upload
      // that re-renders the form is the usual case), so a filled control is
      // allowed one more write when it turns up empty again; anything handed
      // over or written twice is done for this run.
      const ref = "ref" in proposal ? proposal.ref : null;
      if (ref !== null) {
        const writes = (writeCounts.get(ref) ?? 0) + 1;
        writeCounts.set(ref, writes);
        if (writes >= 2) {
          workedControls.add(ref);
        }
      }
      const outcome = await timed("write", () =>
        executeApplyProposal(proposal, current.signature, {
          config,
          now,
          guardState,
          pendingQuestions,
        }),
      );
      if (outcome.kind !== "filled" && outcome.kind !== "attached" && ref !== null) {
        workedControls.add(ref);
      }
      if (outcome.kind === "filled") {
        filled.push(outcome.filled);
        current = outcome.observation;
        notes.push(
          `Answered "${outcome.filled.label}" from ${outcome.filled.answer.provenanceLabel}.`,
        );
        continue;
      }
      if (outcome.kind === "attached") {
        attachments.push(outcome.attachment);
        current = outcome.observation;
        notes.push(
          `Attached ${outcome.attachment.label} to "${outcome.attachment.controlLabel}".`,
        );
        continue;
      }
      if (outcome.kind === "needs_you") {
        const question = outcome.pause.question;
        if (question && !pendingQuestionIds.has(question.id)) {
          pendingQuestionIds.add(question.id);
          pendingQuestions.set(outcome.controlRef, question);
          pendingOrder.push(question);
          notes.push(`Left "${question.prompt}" for you to answer.`);
        }
        current = outcome.observation;
        continue;
      }
      if (outcome.kind === "paused" || outcome.kind === "finished") {
        // Anything that ends the run belongs to the loop below, which reports
        // it from the page it is standing on.
        break;
      }
      if (
        outcome.kind === "refused" &&
        outcome.reason.includes("declares themselves")
      ) {
        skippedDeclarations += 1;
      }
      current = outcome.observation;
    }
    if (skippedDeclarations > 0 && !notes.includes(VOLUNTARY_NOTE)) {
      notes.push(VOLUNTARY_NOTE);
    }
    return current;
  };

  const collectedQuestionsPause = (): ApplyPause | null => {
    const first = pendingOrder[0];
    if (!first) {
      return null;
    }
    const summary =
      pendingOrder.length === 1
        ? `Job Finder filled in what it could on ${config.siteLabel} and needs your answer to one question.`
        : `Job Finder filled in what it could on ${config.siteLabel} and needs your answers to ${pendingOrder.length} questions.`;
    return {
      code: "question_needs_you",
      summary,
      question: first,
      questions: [...pendingOrder],
      blocker: null,
    };
  };

  const describeTiming = (): string => {
    const total = now().getTime() - startedAtMs;
    const parts = [
      `read=${readPhase("read")}ms`,
      `entry=${readPhase("entry")}ms`,
      `fill=${readPhase("fill")}ms (${countBy.get("write") ?? 0} writes)`,
      `model=${countBy.get("model") ?? 0} turns ${readPhase("model")}ms`,
      `total=${total}ms`,
    ];
    return `[apply] timing ${parts.join(" ")}`;
  };

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
    // However the run ends, the questions it gathered go with it: a run that
    // stopped early still knows what it needs from the person.
    pauses:
      pauses.length === 0 && pendingOrder.length > 0
        ? [collectedQuestionsPause()!]
        : pauses,
    // Traffic the guard blocked and safely ignored belongs in the same trail
    // as everything else that happened.
    notes: [...notes, ...guardState.notes, ...turnNotes, describeTiming()],
    readyToSend,
  });

  try {
    observation = await timed("read", () => config.hands.observe());
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
    // The page a run lands on is very often the listing, not the form: the
    // board shows the job and an apply control leads to where it is actually
    // taken. Walk that route before deciding there is nothing to fill in.
    const landedOn = observation;
    const entry = await timed("entry", () => resolveApplyEntry({
      hands: config.hands,
      observation: landedOn,
      ...(config.runControl?.applyEntryMaxHops === undefined
        ? {}
        : { maxHops: config.runControl.applyEntryMaxHops }),
      ...(config.runControl?.applyEntryTimeBudgetMs === undefined
        ? {}
        : { timeBudgetMs: config.runControl.applyEntryTimeBudgetMs }),
      now,
    }));
    observation = entry.observation;
    notes.push(...entry.notes);

    if (entry.outcome !== "form_reached") {
      const summary =
        entry.reason ?? "Job Finder could not reach this application form.";
      pauses.push({
        code: "page_blocked",
        summary,
        question: null,
        blocker: entry.blocker,
      });
      return finish("paused", summary);
    }

    // Everything the person's own profile, resume and saved answers already
    // answer is written now, in one pass, without a model turn each. The
    // executor still binds every one of these to the page and the saved
    // authority before it is written (ADR 0021); only the proposer changed.
    observation = await timed("fill", () => fillWhatTheSourcesAnswer(observation!));

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
      // Running long is not the same as having nothing to say. When the run
      // already knows what it needs from the person, that is the ending they
      // get: the questions, not a shrug about time.
      const collected = collectedQuestionsPause();
      if (collected) {
        pauses.push(collected);
        return finish("paused", collected.summary);
      }
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
      const stalled = collectedQuestionsPause();
      if (stalled) {
        pauses.push(stalled);
        return finish("paused", stalled.summary);
      }
      return finish(
        "stuck",
        `Job Finder stopped on ${config.siteLabel} because the form stopped responding: nothing new happened after several tries, even after changing approach.`,
      );
    }

    steps += 1;

    const response = await timed("model", () =>
      llmClient.chatWithTools(
        messages,
        getApplyToolDefinitions(),
        config.signal ? { signal: config.signal } : {},
      ),
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
        { config, now, guardState, pendingQuestions },
      );
      // One line per turn, so a run that took minutes can say what it spent
      // them on rather than leaving the next person to guess.
      turnNotes.push(
        `turn ${steps}: ${describeProposal(parsed.proposal)} → ${outcome.kind}${
          outcome.kind === "refused" ? `: ${outcome.reason}` : ""
        }`,
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
          // A new screen is a new set of fields the sources may already
          // answer: they are written before the model is asked again.
          observation = await fillWhatTheSourcesAnswer(outcome.observation);
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
        case "needs_you": {
          observation = outcome.observation;
          const question = outcome.pause.question;
          const alreadyPending =
            question !== null && pendingQuestionIds.has(question.id);
          if (question && !alreadyPending) {
            pendingQuestionIds.add(question.id);
            pendingQuestions.set(outcome.controlRef, question);
            pendingOrder.push(question);
            notes.push(`Left "${question.prompt}" for you to answer.`);
            // Recording a new question is progress. Being handed the same one
            // again is not, so the stall rule still ends a run that is only
            // going round the fields it cannot fill in.
            lastProgressStep = steps;
            stallWarningStep = null;
          }
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: alreadyPending
              ? `"${question?.prompt ?? "That question"}" is already on the list for the person. Do not propose it again: move on to a field you can fill in, or finish.`
              : `${outcome.pause.summary} Leave that one blank, carry on with the rest of the form, and finish when there is nothing else you can fill in.`,
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
            // ADR 0022: a run that already collected the questions it could
            // not answer is a hand-over, not a dead end, whatever the model
            // says when it gives up.
            const collectedBeforeStuck = collectedQuestionsPause();
            if (collectedBeforeStuck) {
              notes.push(`Job Finder stopped here: ${reason}`);
              pauses.push(collectedBeforeStuck);
              return finish("paused", collectedBeforeStuck.summary);
            }
            notes.push(`Job Finder got stuck: ${reason}`);
            return finish(
              "stuck",
              `Job Finder stopped on ${config.siteLabel} because it got stuck: ${reason}`,
            );
          }
          notes.push(outcome.reason);
          const collected = collectedQuestionsPause();
          if (collected) {
            pauses.push(collected);
            return finish("paused", collected.summary);
          }
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

  const leftover = collectedQuestionsPause();
  if (leftover) {
    pauses.push(leftover);
    return finish("paused", leftover.summary);
  }
  return finish(
    "stuck",
    `Job Finder stopped on ${config.siteLabel} after a very long run without finishing the form. Everything it filled in is saved.`,
  );
}
