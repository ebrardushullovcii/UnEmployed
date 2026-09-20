import {
  parseToolArguments,
  runAgentLoop,
  type AgentLoopFinish,
  type AgentLoopModel,
  type AgentLoopTool,
  type AgentLoopToolOutcome,
} from "@unemployed/agent-runtime";
import {
  describeBrowserError,
  type ApplicationAttemptQuestion,
} from "@unemployed/contracts";

import type { LLMClient } from "../agent/contracts";
import { createPageTools } from "../page-tools";
import {
  createApplySystemPrompt,
  createApplyUserPrompt,
  describeObservation,
} from "./apply-prompts";
import { getApplyToolDefinitions, parseApplyProposal } from "./apply-tools";
import {
  createApplyGuardState,
  executeApplyProposal,
  type ApplyExecutionOutcome,
} from "./policy-executor";
import { buildCoverLetterRequest } from "./cover-letter";
import type {
  ApplyAgentConfig,
  ApplyAgentResult,
  ApplyAttachedDocument,
  ApplyFilledControl,
  ApplyFormObservation,
  ApplyDocument,
  ApplyPause,
  ApplyProposal,
} from "./types";

const DEFAULT_MAX_STEPS = 200;
// Long forms on a slow model took 16 minutes to reach the review step;
// 15 minutes cut them off just before it.
const DEFAULT_TIME_BUDGET_MS = 30 * 60_000;
const DEFAULT_NO_PROGRESS_STEP_LIMIT = 12;

const PAGE_TOOL_NAMES = new Set([
  "observe",
  "read_text",
  "navigate",
  "follow_link",
  "scroll",
  "wait",
  "go_back",
]);

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
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
    filledCount === 1
      ? "filled in 1 answer"
      : `filled in ${filledCount} answers`;
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

function browserFailureKind(toolName: string): "browser" | "tool" {
  return [
    "click",
    "type",
    "select",
    "set_checkbox",
    "submit_application",
  ].includes(toolName)
    ? "browser"
    : "tool";
}

export async function runApplyAgent(
  config: ApplyAgentConfig,
  llmClient: LLMClient,
): Promise<ApplyAgentResult> {
  const now = config.now ?? (() => new Date());
  const filled: ApplyFilledControl[] = [];
  const attachments: ApplyAttachedDocument[] = [];
  const pauses: ApplyPause[] = [];
  const notes: string[] = [];
  const timeline: { at: string; text: string }[] = [];
  const pendingQuestions = new Map<string, ApplicationAttemptQuestion>();
  const guardState = createApplyGuardState();
  const documentCatalog: ApplyDocument[] = [...config.sources.documents];
  const runConfig: ApplyAgentConfig = {
    ...config,
    sources: { ...config.sources, documents: documentCatalog },
  };
  let readyToSend: ApplyAgentResult["readyToSend"] = null;

  await config.onProgress?.({
    step: 0,
    note: "reading the application form",
    progressSteps: 0,
    elapsedMs: 0,
  });

  const note = (text: string): void => {
    notes.push(text);
    timeline.push({ at: now().toISOString(), text });
  };
  const collectedQuestionsPause = (): ApplyPause | null => {
    const questions = [...pendingQuestions.values()];
    const first = questions[0];
    if (!first) return null;
    return {
      code: "question_needs_you",
      summary:
        questions.length === 1
          ? `Job Finder filled in what it could on ${config.siteLabel} and needs your answer to one question.`
          : `Job Finder filled in what it could on ${config.siteLabel} and needs your answers to ${questions.length} questions.`,
      question: first,
      questions,
      blocker: null,
    };
  };

  const startOrigin = originOf(config.application.startingUrl);
  const pageTools = createPageTools(config.hands, {
    allowUrl: (url) => {
      const origin = originOf(url);
      if (!origin) return null;
      if (config.reviewMove && startOrigin && origin !== startOrigin) {
        return `${origin} is a different site from the listing.`;
      }
      return null;
    },
    ...(config.reviewMove
      ? {
          reviewMove: async (move: {
            url: string;
            reason: string;
            fromUrl: string | null;
          }) => {
            return config.reviewMove!(move);
          },
        }
      : {}),
  });

  const syncObservation = (next: ApplyFormObservation): void => {
    pageTools.state.observation = next;
    if (next.url && !pageTools.state.visitedUrls.includes(next.url)) {
      pageTools.state.visitedUrls.push(next.url);
    }
    for (const [origin, reason] of pageTools.state.approvedOrigins) {
      guardState.approvedOrigins.set(origin, reason);
    }
    for (const [origin, reason] of guardState.approvedOrigins) {
      pageTools.state.approvedOrigins.set(origin, reason);
    }
  };

  let openingMessage: string;
  try {
    syncObservation(await pageTools.observe());
    openingMessage = `The page you have landed on:\n\n${describeObservation(pageTools.state.observation!)}`;
  } catch (error) {
    const detail = describeBrowserError(error, "The page did not open.");
    note(`The application page did not open. ${detail}`);
    openingMessage = `The first attempt to read the application page failed: ${detail} Use the browser tools to recover: wait, navigate to the starting address, or observe again.`;
  }

  const definitions = new Map(
    getApplyToolDefinitions().map((definition) => [
      definition.function.name,
      definition,
    ]),
  );

  const outcomeToLoop = (
    outcome: ApplyExecutionOutcome,
  ): AgentLoopToolOutcome => {
    switch (outcome.kind) {
      case "observed":
        syncObservation(outcome.observation);
        return {
          kind: "ok",
          content: describeObservation(outcome.observation),
        };
      case "read":
        syncObservation(outcome.observation);
        return {
          kind: "ok",
          content: outcome.text.slice(0, 20_000) || "That has no text.",
        };
      case "filled":
        filled.push(outcome.filled);
        pendingQuestions.delete(outcome.filled.ref);
        syncObservation(outcome.observation);
        note(
          `Answered "${outcome.filled.label}" from ${outcome.filled.answer.provenanceLabel}.`,
        );
        return {
          kind: "ok",
          progress: true,
          content: `Filled in "${outcome.filled.label}". The form now looks like this:\n\n${describeObservation(outcome.observation)}`,
        };
      case "attached":
        attachments.push(outcome.attachment);
        syncObservation(outcome.observation);
        note(
          `Attached ${outcome.attachment.label} to "${outcome.attachment.controlLabel}".`,
        );
        return {
          kind: "ok",
          progress: true,
          content: `Attached ${outcome.attachment.label}. The form now looks like this:\n\n${describeObservation(outcome.observation)}`,
        };
      case "moved":
        syncObservation(outcome.observation);
        note(outcome.note);
        return {
          kind: "ok",
          progress: outcome.progress,
          content: `${outcome.note}\n\nThe page now:\n\n${describeObservation(outcome.observation)}`,
        };
      case "suggestion":
        syncObservation(outcome.observation);
        if (outcome.question) {
          pendingQuestions.set(outcome.controlRef, outcome.question);
        }
        return { kind: "ok", content: outcome.note };
      case "refused":
        syncObservation(outcome.observation);
        return {
          kind: "ok",
          content: `${outcome.reason}\n\nThe page now:\n\n${describeObservation(outcome.observation)}`,
        };
      case "paused":
        pauses.push(outcome.pause);
        note(outcome.pause.summary);
        return {
          kind: "stop",
          reason: outcome.pause.summary,
          data: outcome.pause,
        };
      case "ready_to_send":
        syncObservation(outcome.observation);
        readyToSend = {
          actionRef: outcome.finalActionRef,
          actionLabel: outcome.finalActionLabel,
        };
        note("The form is complete and ready to send.");
        return {
          kind: "ok",
          progress: true,
          content:
            "The form is complete and everything checks out. Nothing has been sent: call finish now.",
        };
      case "finished": {
        const finish: AgentLoopFinish = {
          reason: outcome.reason,
          stuck: outcome.stuck,
          needsPerson: outcome.needsPerson,
          data: {},
        };
        return { kind: "finish", finish };
      }
      default: {
        const exhaustive: never = outcome;
        throw new Error(
          `Unhandled apply outcome: ${JSON.stringify(exhaustive)}`,
        );
      }
    }
  };

  const domainTools: AgentLoopTool[] = [];
  const completedControlWrites = new Set<string>();
  const controlWriteKey = (proposal: ApplyProposal): string | null => {
    if (
      proposal.tool !== "type" &&
      proposal.tool !== "select" &&
      proposal.tool !== "set_checkbox" &&
      proposal.tool !== "upload"
    ) {
      return null;
    }
    const observation = pageTools.state.observation;
    const control = observation?.controls.find(
      (candidate) => candidate.ref === proposal.ref,
    );
    return observation && control
      ? `${observation.url ?? ""}|${control.ref}|${control.kind}|${control.groupLabel}|${control.label}`
      : null;
  };
  for (const [name, definition] of definitions) {
    if (PAGE_TOOL_NAMES.has(name)) continue;
    domainTools.push({
      definition,
      failureKind: browserFailureKind(name),
      describeError: (error) =>
        describeBrowserError(error, "The browser did not respond."),
      execute: async (rawArguments) => {
        const parsed = parseApplyProposal(name, rawArguments);
        if (!parsed.ok) return { kind: "ok", content: parsed.error };
        const writeKey = controlWriteKey(parsed.proposal);
        if (writeKey && completedControlWrites.has(writeKey)) {
          return {
            kind: "ok",
            content:
              "That exact field was already completed on this page. Do not write it again; use the latest form observation and continue with a different empty field or finish.",
          };
        }
        const outcome = await executeApplyProposal(
          parsed.proposal,
          pageTools.state.observation?.signature ?? "",
          { config: runConfig, now, guardState },
        );
        if (
          writeKey &&
          (outcome.kind === "filled" || outcome.kind === "attached")
        ) {
          completedControlWrites.add(writeKey);
        }
        return outcomeToLoop(outcome);
      },
    });
  }

  domainTools.push({
    definition: {
      type: "function",
      function: {
        name: "list_application_documents",
        description:
          "List every document currently available for this application, including documents created during this run. Use an id from this list with upload.",
        parameters: { type: "object", properties: {} },
      },
    },
    execute: () =>
      Promise.resolve({
        kind: "ok",
        content:
          documentCatalog.length === 0
            ? "No application documents are available yet."
            : documentCatalog
                .map(
                  (document) =>
                    `- ${document.id}: ${document.label} (${document.fileName}, ${document.mimeType})`,
                )
                .join("\n"),
      }),
  });

  domainTools.push({
    definition: {
      type: "function",
      function: {
        name: "create_application_document",
        description:
          "Create or revise a grounded cover letter, motivation letter, or short supporting statement requested by this application, as a PDF, Word (docx) or plain text (txt) file, whichever the form accepts. The document is rendered locally and added to the application document list; creating it never uploads or submits it. Use it whenever a form wants a file Job Finder does not have yet.",
        parameters: {
          type: "object",
          properties: {
            purpose: {
              type: "string",
              enum: [
                "cover_letter",
                "motivation_letter",
                "supporting_statement",
              ],
            },
            instructions: {
              type: "string",
              description:
                "What the form requests and any revision needed. Do not invent candidate facts.",
            },
            fileType: { type: "string", enum: ["pdf", "docx", "txt"] },
          },
          required: ["purpose", "instructions", "fileType"],
        },
      },
    },
    execute: async (rawArguments) => {
      if (!runConfig.letters) {
        return {
          kind: "ok",
          content:
            "Document generation is unavailable in this run. Leave the field for the person and say what document the site requested.",
        };
      }
      const args = parseToolArguments(rawArguments);
      const purpose =
        args.purpose === "motivation_letter" ||
        args.purpose === "supporting_statement"
          ? args.purpose
          : "cover_letter";
      const instructions =
        typeof args.instructions === "string" ? args.instructions.trim() : "";
      const fileType =
        args.fileType === "docx" || args.fileType === "txt"
          ? args.fileType
          : "pdf";
      if (!instructions) {
        return {
          kind: "ok",
          content:
            "Say what the application requests before creating a document.",
        };
      }
      const grounding = buildCoverLetterRequest({
        sources: runConfig.sources,
        preference: runConfig.letters.preference,
      });
      const created = await runConfig.letters.provide({
        purpose,
        prompt: `${purpose.replace(/_/gu, " ")}: ${instructions}`,
        groundedIn: grounding.groundedIn,
        language: grounding.language,
        delivery: "file",
        fileType,
      });
      if (!created.ok || !created.document) {
        return {
          kind: "ok",
          content: created.ok
            ? "The document text was created, but no attachable file could be rendered."
            : `The document could not be created: ${created.reason}`,
        };
      }
      const existingIndex = documentCatalog.findIndex(
        (document) => document.id === created.document!.id,
      );
      if (existingIndex >= 0) documentCatalog.splice(existingIndex, 1);
      documentCatalog.push(created.document);
      note(
        `Created ${purpose.replace(/_/gu, " ")} ${created.document.fileName} for this application.`,
      );
      return {
        kind: "ok",
        progress: true,
        content: `Created ${created.document.label} (${created.document.fileName}). Use documentId ${created.document.id} with upload after observing the file field.\n\nGenerated text:\n${created.text}`,
      };
    },
  });

  const loop = await runAgentLoop({
    messages: [
      { role: "system", content: createApplySystemPrompt(runConfig) },
      { role: "user", content: createApplyUserPrompt(runConfig) },
      { role: "user", content: openingMessage },
    ],
    model: llmClient as unknown as AgentLoopModel,
    tools: [
      ...pageTools.tools
        .filter((tool) => PAGE_TOOL_NAMES.has(tool.definition.function.name))
        .map<AgentLoopTool>((tool) => ({
          ...tool,
          execute: async (rawArguments, context) => {
            const result = await tool.execute(rawArguments, context);
            const current = pageTools.state.observation;
            if (current) syncObservation(current);
            return result;
          },
        })),
      ...domainTools,
    ],
    subjectLabel: config.siteLabel,
    ceilings: {
      maxSteps: config.runControl?.maxSteps ?? DEFAULT_MAX_STEPS,
      timeBudgetMs: config.runControl?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS,
      noProgressStepLimit:
        config.runControl?.noProgressStepLimit ??
        DEFAULT_NO_PROGRESS_STEP_LIMIT,
    },
    describeStall: () =>
      pageTools.state.observation
        ? `The page is ${pageTools.state.observation.url ?? "open"}.`
        : null,
    modelMaxOutputTokens: 4_096,
    ...(config.onProgress ? { onStep: config.onProgress } : {}),
    ...(config.signal ? { signal: config.signal } : {}),
    now,
  });

  const pending = collectedQuestionsPause();
  let outcome: ApplyAgentResult["outcome"];
  let reason: string;
  if (pauses.length > 0) {
    outcome = "paused";
    reason = pauses[0]?.summary ?? loop.reason;
  } else if (pending) {
    pauses.push(pending);
    outcome = "paused";
    reason = pending.summary;
  } else if (loop.finish?.needsPerson) {
    const pause: ApplyPause = {
      code: "page_blocked",
      summary: loop.finish.reason,
      question: null,
      blocker: pageTools.state.observation?.blocker ?? null,
    };
    pauses.push(pause);
    note(pause.summary);
    outcome = "paused";
    reason = loop.finish.reason;
  } else if (loop.finish?.stuck) {
    outcome = "stuck";
    reason = `Job Finder stopped on ${config.siteLabel} because it got stuck: ${loop.finish.reason.replace(/\.?$/u, ".")}`;
  } else if (loop.ending === "finished") {
    outcome =
      readyToSend && config.authority.mode === "autonomous_submit"
        ? "ready_to_send"
        : defaultOutcomeFor(config);
    reason =
      outcome === "ready_to_send"
        ? `${loop.finish?.reason ?? loop.reason} Job Finder filled this application in on ${config.siteLabel} and it is ready to send.`
        : `${loop.finish?.reason ?? loop.reason} ${describePrepared(config, filled.length, attachments.length)}`;
  } else if (loop.ending === "stalled") {
    outcome = "stuck";
    reason = `Job Finder stopped on ${config.siteLabel} because the form stopped responding: nothing new happened after several tries, even after changing approach.`;
  } else {
    outcome = "stuck";
    reason = loop.reason;
  }

  const timing = `[apply] timing read=0ms entry=0ms fill=${loop.timing.toolMs}ms (${filled.length + attachments.length} writes) model=${loop.timing.modelTurns} turns ${loop.timing.modelMs}ms total=${loop.timing.totalMs}ms`;
  return {
    outcome,
    reason,
    steps: loop.steps,
    finalUrl: pageTools.state.observation?.url ?? null,
    filled,
    attachments,
    pauses,
    notes: [...notes, ...guardState.notes, ...loop.turnNotes, timing],
    timeline,
    modelTurns: loop.timing.modelTurns,
    readyToSend,
  };
}
