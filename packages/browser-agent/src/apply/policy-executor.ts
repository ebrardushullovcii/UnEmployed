import type { ApplicationAttemptQuestion } from "@unemployed/contracts";

import {
  acceptsWrittenAnswer,
  matchOption,
  resolveApplyAnswer,
} from "./answer-sourcing";
import { attemptKey, judgeBlockedAttempt } from "./blocked-attempts";
import {
  buildCoverLetterRequest,
  coverLetterDeliveryFor,
  isCoverLetterControl,
  looksLikeUsableLetter,
  requiredLetterFileType,
} from "./cover-letter";
import { runSubmitPreflight } from "./submit-preflight";
import type {
  ApplyAgentConfig,
  ApplyAnswer,
  ApplyDocument,
  ApplyAttachedDocument,
  ApplyFilledControl,
  ApplyFormControl,
  ApplyFormObservation,
  ApplyPause,
  ApplyProposal,
} from "./types";

/**
 * The deterministic step between the model and the page (ADR 0012).
 *
 * The model may say which control to work on next and may write prose for a
 * free-text question. It can never decide what a stored fact is, whether a
 * declaration may be ticked, or whether an application may be sent. Every one
 * of those is settled here, against the page as it is right now, the exact
 * application this run belongs to, and the saved authority document.
 */

export type ApplyExecutionOutcome =
  | { kind: "observed"; observation: ApplyFormObservation }
  | { kind: "filled"; filled: ApplyFilledControl; observation: ApplyFormObservation }
  | { kind: "attached"; attachment: ApplyAttachedDocument; observation: ApplyFormObservation }
  | { kind: "moved"; actionLabel: string; observation: ApplyFormObservation }
  | { kind: "paused"; pause: ApplyPause }
  /** The proposal did not fit the page. The loop tells the model why and carries on. */
  | { kind: "refused"; reason: string; observation: ApplyFormObservation }
  /**
   * The form is complete and the send button is the one named here. Nobody has
   * pressed anything: the single irreversible click belongs to the submission
   * path, which owns idempotency and the record of what happened.
   */
  | {
      kind: "ready_to_send";
      finalActionRef: string;
      finalActionLabel: string;
      observation: ApplyFormObservation;
    }
  | { kind: "finished"; reason: string; stuck: boolean };

export interface ApplyExecutorDeps {
  config: ApplyAgentConfig;
  now: () => Date;
  /**
   * What the guard has already stopped and been forgiven for, and whether this
   * run has touched the page yet. Carried across steps by the loop.
   */
  guardState: ApplyGuardState;
}

export interface ApplyGuardState {
  acknowledged: Set<string>;
  hasWritten: boolean;
  lastFieldLabel: string | null;
  /** Plain notes about traffic that was blocked and safely ignored. */
  notes: string[];
}

export function createApplyGuardState(): ApplyGuardState {
  return {
    acknowledged: new Set<string>(),
    hasWritten: false,
    lastFieldLabel: null,
    notes: [],
  };
}

function questionIdFor(control: ApplyFormControl, jobId: string): string {
  const slug = `${control.groupLabel} ${control.label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 60);
  return `question_${jobId}_${slug || control.ref}`;
}

function questionPrompt(control: ApplyFormControl): string {
  const prompt = [control.groupLabel, control.label]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" — ");
  return prompt || control.placeholder.trim() || "A question on the application form";
}

export function buildPendingQuestion(input: {
  control: ApplyFormControl;
  jobId: string;
  detectedAt: string;
  suggestion: ApplyAnswer | null;
}): ApplicationAttemptQuestion {
  const { control, suggestion } = input;
  return {
    id: questionIdFor(control, input.jobId),
    prompt: questionPrompt(control),
    kind: control.questionKind,
    answerControlType: control.answerControlType,
    isRequired: control.required,
    detectedAt: input.detectedAt,
    answerOptions: control.options.slice(0, 40),
    suggestedAnswers: suggestion
      ? [
          {
            id: `${questionIdFor(control, input.jobId)}_suggestion`,
            text: suggestion.value,
            sourceKind: suggestion.sourceKind === "answer_library" ? "user" : "profile",
            sourceId: suggestion.sourceId,
            confidenceLabel: null,
            provenance: [],
          },
        ]
      : [],
    submittedAnswer: null,
    status: "detected",
  };
}

/**
 * Performs one write with the guard watching.
 *
 * The value is declared to the guard first, so it can tell a request that
 * carries the answer from one that does not. When the person authorized the
 * site to save fields as they go, the short same-origin window is opened
 * around this one write and closed straight after, whatever happens.
 */
async function writeUnderGuard(
  deps: ApplyExecutorDeps,
  input: {
    declaredValue: string | null;
    write: () => Promise<{ ok: true; observedValue: string } | { ok: false; error: string }>;
  },
): Promise<{ ok: true; observedValue: string } | { ok: false; error: string }> {
  const safety = deps.config.safety;
  if (!safety) {
    return input.write();
  }

  if (input.declaredValue) {
    await safety.registerPreparedValue(input.declaredValue);
  }

  let windowOpen = false;
  if (deps.config.intermediateWritesAuthorized === true) {
    try {
      await safety.openIntermediateWriteWindow();
      windowOpen = true;
    } catch {
      // The current origin is outside what the person authorized. The write
      // still happens locally; nothing may leave the page.
      windowOpen = false;
    }
  }

  try {
    return await input.write();
  } finally {
    if (windowOpen) {
      await safety.closeIntermediateWriteWindow().catch(() => undefined);
    }
  }
}

/**
 * Whether the guard stopped something worth ending the run over since the
 * last check. Tolerated traffic is noted and the run carries on.
 */
async function guardStop(
  deps: ApplyExecutorDeps,
  pageUrl: string | null,
): Promise<ApplyPause | null> {
  const safety = deps.config.safety;
  if (!safety) {
    return null;
  }
  const attempt = await safety.readBlockedAttempt();
  const judgement = judgeBlockedAttempt({
    attempt,
    acknowledged: deps.guardState.acknowledged,
    hasWritten: deps.guardState.hasWritten,
    pageUrl,
    lastFieldLabel: deps.guardState.lastFieldLabel,
  });
  if (judgement.stop) {
    return {
      code: "site_tried_to_send",
      summary: judgement.summary,
      question: null,
      blocker: null,
    };
  }
  if (attempt && judgement.tolerated) {
    deps.guardState.acknowledged.add(attemptKey(attempt));
    if (judgement.note) {
      deps.guardState.notes.push(judgement.note);
    }
  }
  return null;
}

type LetterOutcome =
  | {
      kind: "ok";
      letter: {
        text: string;
        document: ApplyDocument | null;
        groundedIn: string[];
      };
    }
  | { kind: "stop"; outcome: ApplyExecutionOutcome };

/**
 * Gets the one letter for this application.
 *
 * The provider writes it the first time and hands back the same words after
 * that, so a form that asks for a file and a form that asks for a box never
 * end up with two different letters.
 */
async function provideApplicationLetter(
  deps: ApplyExecutorDeps,
  control: ApplyFormControl,
): Promise<LetterOutcome> {
  const { config } = deps;
  const letters = config.letters;
  if (!letters) {
    return {
      kind: "stop",
      outcome: {
        kind: "refused",
        reason: "Job Finder has no letter for this application.",
        observation: await config.hands.observe(),
      },
    };
  }

  const request = buildCoverLetterRequest({
    sources: config.sources,
    preference: letters.preference,
  });
  const produced = await letters.provide({
    ...request,
    delivery: coverLetterDeliveryFor(control),
    fileType: requiredLetterFileType(control),
  });

  if (!produced.ok) {
    return {
      kind: "stop",
      outcome: {
        kind: "paused",
        pause: {
          code: "document_needs_you",
          summary: `Job Finder could not write the letter this form asks for. ${produced.reason}`,
          question: buildPendingQuestion({
            control,
            jobId: config.application.jobId,
            detectedAt: deps.now().toISOString(),
            suggestion: null,
          }),
          blocker: null,
        },
      },
    };
  }

  // A letter with a gap in it must never go out; the person is asked instead.
  if (!looksLikeUsableLetter(produced.text)) {
    return {
      kind: "stop",
      outcome: {
        kind: "paused",
        pause: {
          code: "document_needs_you",
          summary:
            "The letter Job Finder wrote for this application did not come out usable, so nothing was attached. Write or attach one here and it will be used.",
          question: buildPendingQuestion({
            control,
            jobId: config.application.jobId,
            detectedAt: deps.now().toISOString(),
            suggestion: null,
          }),
          blocker: null,
        },
      },
    };
  }

  return {
    kind: "ok",
    letter: {
      text: produced.text,
      document: produced.document,
      groundedIn: request.groundedIn,
    },
  };
}

/**
 * Whether the page is still somewhere the person allowed.
 *
 * Allowed origins may be written with a trailing slash, which `URL.origin`
 * never has, so both sides are reduced to the bare origin first. With no list
 * saved, the only allowed place is where the application started.
 */
function originAllowed(
  observation: ApplyFormObservation,
  config: ApplyAgentConfig,
): boolean {
  const bareOrigin = (value: string): string | null => {
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  };
  const allowed = config.authority.allowedOrigins
    .map(bareOrigin)
    .filter((value): value is string => value !== null);
  if (allowed.length === 0) {
    const startingOrigin = bareOrigin(config.application.startingUrl);
    return startingOrigin === null || observation.origin === startingOrigin;
  }
  return observation.origin !== null && allowed.includes(observation.origin);
}

function findControl(
  observation: ApplyFormObservation,
  ref: string,
): ApplyFormControl | null {
  return observation.controls.find((control) => control.ref === ref) ?? null;
}

/**
 * Runs one proposal.
 *
 * `seenSignature` is the page the model was looking at when it proposed. A
 * page that has moved on since then refuses the proposal rather than writing
 * into whatever happens to be in that slot now.
 */
export async function executeApplyProposal(
  proposal: ApplyProposal,
  seenSignature: string,
  deps: ApplyExecutorDeps,
): Promise<ApplyExecutionOutcome> {
  const { config } = deps;
  const at = deps.now().toISOString();

  if (proposal.tool === "finish") {
    return { kind: "finished", reason: proposal.reason, stuck: proposal.stuck === true };
  }

  const observation = await config.hands.observe();

  if (proposal.tool === "inspect_form" || proposal.tool === "read_blockers") {
    return { kind: "observed", observation };
  }

  if (observation.blocker) {
    return {
      kind: "paused",
      pause: {
        code: "page_blocked",
        summary: observation.blocker.summary,
        question: null,
        blocker: observation.blocker,
      },
    };
  }

  if (!originAllowed(observation, config)) {
    return {
      kind: "paused",
      pause: {
        code: "page_blocked",
        summary: `The form moved to ${observation.origin ?? "another site"}, which is outside what you allowed, so Job Finder stopped.`,
        question: null,
        blocker: null,
      },
    };
  }

  if (observation.signature !== seenSignature) {
    return {
      kind: "refused",
      reason:
        "The page changed since you last looked at it, so that step was not taken. Inspect the form again and decide from what is there now.",
      observation,
    };
  }

  switch (proposal.tool) {
    case "answer_control": {
      const control = findControl(observation, proposal.ref);
      if (!control) {
        return { kind: "refused", reason: `There is no ${proposal.ref} on this page.`, observation };
      }
      if (!control.visible || control.disabled || control.readOnly) {
        return {
          kind: "refused",
          reason: `"${questionPrompt(control)}" cannot be edited right now.`,
          observation,
        };
      }

      if (control.attestationKind !== null) {
        if (!config.authority.preApprovedAttestationKinds.includes(control.attestationKind)) {
          return {
            kind: "paused",
            pause: {
              code: "declaration_needs_you",
              summary: `This form asks you to declare something: "${questionPrompt(control)}". Only you can answer that, so Job Finder left it blank.`,
              question: buildPendingQuestion({
                control,
                jobId: config.application.jobId,
                detectedAt: at,
                suggestion: null,
              }),
              blocker: null,
            },
          };
        }
        const write = await writeUnderGuard(deps, {
          declaredValue: null,
          write: () => config.hands.setToggle(control.ref, true),
        });
        if (!write.ok) {
          return { kind: "refused", reason: write.error, observation };
        }
        deps.guardState.hasWritten = true;
        deps.guardState.lastFieldLabel = questionPrompt(control);
        const attestationStop = await guardStop(deps, observation.url);
        if (attestationStop) {
          return { kind: "paused", pause: attestationStop };
        }
        return {
          kind: "filled",
          filled: {
            ref: control.ref,
            label: questionPrompt(control),
            questionKind: control.questionKind,
            answer: {
              value: "Agreed",
              kind: control.questionKind,
              sourceKind: "profile",
              sourceId: `authority.attestation.${control.attestationKind}`,
              provenanceLabel: "a declaration you approved in advance",
              groundedIn: ["a declaration you approved in advance"],
            },
            at,
          },
          observation: await config.hands.observe(),
        };
      }

      if (isCoverLetterControl(control) && config.letters) {
        const letterOutcome = await provideApplicationLetter(deps, control);
        if (letterOutcome.kind !== "ok") {
          return letterOutcome.outcome;
        }
        const { letter } = letterOutcome;

        if (coverLetterDeliveryFor(control) === "file") {
          if (!letter.document) {
            return {
              kind: "paused",
              pause: {
                code: "document_needs_you",
                summary: `This form wants the letter as a file Job Finder cannot produce for "${questionPrompt(control)}". Attach one here and it will be used.`,
                question: buildPendingQuestion({
                  control,
                  jobId: config.application.jobId,
                  detectedAt: at,
                  suggestion: null,
                }),
                blocker: null,
              },
            };
          }
          const bytes = await letter.document.loadBytes();
          const upload = await writeUnderGuard(deps, {
            declaredValue: letter.document.fileName,
            write: () =>
              config.hands.uploadFile(control.ref, {
                name: letter.document!.fileName,
                mimeType: letter.document!.mimeType,
                bytes,
              }),
          });
          if (!upload.ok) {
            return { kind: "refused", reason: upload.error, observation };
          }
          deps.guardState.hasWritten = true;
          deps.guardState.lastFieldLabel = questionPrompt(control);
          const letterStop = await guardStop(deps, observation.url);
          if (letterStop) {
            return { kind: "paused", pause: letterStop };
          }
          return {
            kind: "attached",
            attachment: {
              documentId: letter.document.id,
              fileName: letter.document.fileName,
              label: letter.document.label,
              controlLabel: questionPrompt(control),
              at,
            },
            observation: await config.hands.observe(),
          };
        }

        const typed = await writeUnderGuard(deps, {
          declaredValue: letter.text,
          write: () => config.hands.fillText(control.ref, letter.text),
        });
        if (!typed.ok) {
          return { kind: "refused", reason: typed.error, observation };
        }
        deps.guardState.hasWritten = true;
        deps.guardState.lastFieldLabel = questionPrompt(control);
        const typedStop = await guardStop(deps, observation.url);
        if (typedStop) {
          return { kind: "paused", pause: typedStop };
        }
        return {
          kind: "filled",
          filled: {
            ref: control.ref,
            label: questionPrompt(control),
            questionKind: "cover_letter",
            answer: {
              value: letter.text,
              kind: "cover_letter",
              sourceKind: "generated",
              sourceId: "application.letter",
              provenanceLabel: "the letter written for this application",
              groundedIn: letter.groundedIn,
            },
            at,
          },
          observation: await config.hands.observe(),
        };
      }

      const resolution = resolveApplyAnswer({
        control,
        sources: config.sources,
        salaryDisclosure: config.authority.salaryDisclosure,
      });

      let answer: ApplyAnswer;
      if (resolution.status === "needs_you") {
        return {
          kind: "paused",
          pause: {
            code: "question_needs_you",
            summary: `Job Finder stopped on "${questionPrompt(control)}". ${resolution.reason}`,
            question: buildPendingQuestion({
              control,
              jobId: config.application.jobId,
              detectedAt: at,
              suggestion: resolution.suggestion,
            }),
            blocker: null,
          },
        };
      }
      if (resolution.status === "write_free_text") {
        const written = proposal.freeTextAnswer?.trim() ?? "";
        if (!written) {
          return {
            kind: "refused",
            reason: `"${questionPrompt(control)}" needs an answer written for it. Propose the same control again with the text you want to put there.`,
            observation,
          };
        }
        if (!acceptsWrittenAnswer(control)) {
          return {
            kind: "refused",
            reason: `"${questionPrompt(control)}" is not a free-text field; written text cannot go there.`,
            observation,
          };
        }
        const grounding =
          proposal.groundedIn && proposal.groundedIn.length > 0
            ? proposal.groundedIn
            : resolution.grounding;
        answer = {
          value: written,
          kind: control.questionKind,
          sourceKind: "generated",
          sourceId: `written.${control.ref}`,
          provenanceLabel: "written for this application",
          groundedIn: grounding,
        };
      } else {
        answer = resolution.answer;
      }

      let write;
      if (control.kind === "checkbox" || control.kind === "radio") {
        const wanted = /^(yes|true|agree|agreed|i do)/u.test(answer.value.toLowerCase());
        write = await writeUnderGuard(deps, {
          declaredValue: null,
          write: () => config.hands.setToggle(control.ref, wanted),
        });
      } else if (control.options.length > 0) {
        const option = matchOption(control.options, answer.value);
        if (!option) {
          return {
            kind: "paused",
            pause: {
              code: "question_needs_you",
              summary: `None of the choices under "${questionPrompt(control)}" match your answer.`,
              question: buildPendingQuestion({
                control,
                jobId: config.application.jobId,
                detectedAt: at,
                suggestion: answer,
              }),
              blocker: null,
            },
          };
        }
        write = await writeUnderGuard(deps, {
          declaredValue: option,
          write: () => config.hands.chooseOption(control.ref, option),
        });
        answer = { ...answer, value: option };
      } else if (control.kind === "file") {
        return {
          kind: "refused",
          reason: `"${questionPrompt(control)}" wants a file. Use attach_document for it.`,
          observation,
        };
      } else {
        const value = answer.value;
        write = await writeUnderGuard(deps, {
          declaredValue: value,
          write: () => config.hands.fillText(control.ref, value),
        });
      }

      if (!write.ok) {
        return { kind: "refused", reason: write.error, observation };
      }

      deps.guardState.hasWritten = true;
      deps.guardState.lastFieldLabel = questionPrompt(control);
      const writeStop = await guardStop(deps, observation.url);
      if (writeStop) {
        return { kind: "paused", pause: writeStop };
      }

      return {
        kind: "filled",
        filled: {
          ref: control.ref,
          label: questionPrompt(control),
          questionKind: control.questionKind,
          answer,
          at,
        },
        observation: await config.hands.observe(),
      };
    }

    case "attach_document": {
      const control = findControl(observation, proposal.ref);
      if (!control) {
        return { kind: "refused", reason: `There is no ${proposal.ref} on this page.`, observation };
      }
      if (control.kind !== "file") {
        return {
          kind: "refused",
          reason: `"${questionPrompt(control)}" does not take a file.`,
          observation,
        };
      }
      const document = config.sources.documents.find(
        (candidate) => candidate.id === proposal.documentId,
      );
      if (!document) {
        return {
          kind: "paused",
          pause: {
            code: "document_needs_you",
            summary: `This form asks for a file Job Finder does not have: "${questionPrompt(control)}". Attach it here once and it will be reused.`,
            question: buildPendingQuestion({
              control,
              jobId: config.application.jobId,
              detectedAt: at,
              suggestion: null,
            }),
            blocker: null,
          },
        };
      }
      const bytes = await document.loadBytes();
      if (bytes.byteLength === 0) {
        return {
          kind: "refused",
          reason: `${document.label} came back empty, so nothing was attached.`,
          observation,
        };
      }
      const write = await writeUnderGuard(deps, {
        declaredValue: document.fileName,
        write: () =>
          config.hands.uploadFile(control.ref, {
            name: document.fileName,
            mimeType: document.mimeType,
            bytes,
          }),
      });
      if (!write.ok) {
        return { kind: "refused", reason: write.error, observation };
      }
      deps.guardState.hasWritten = true;
      deps.guardState.lastFieldLabel = questionPrompt(control);
      const attachStop = await guardStop(deps, observation.url);
      if (attachStop) {
        return { kind: "paused", pause: attachStop };
      }
      return {
        kind: "attached",
        attachment: {
          documentId: document.id,
          fileName: document.fileName,
          label: document.label,
          controlLabel: questionPrompt(control),
          at,
        },
        observation: await config.hands.observe(),
      };
    }

    case "go_to_step": {
      const action = observation.actions.find((candidate) => candidate.ref === proposal.ref);
      if (!action) {
        return { kind: "refused", reason: `There is no ${proposal.ref} on this page.`, observation };
      }
      if (action.kind === "final") {
        return {
          kind: "refused",
          reason: `"${action.label}" sends the application. Use submit_application for that.`,
          observation,
        };
      }
      if (!action.visible || action.disabled) {
        return { kind: "refused", reason: `"${action.label}" cannot be used right now.`, observation };
      }
      // A background worker can rewrite the page between screens, so the check
      // happens again immediately before the click that moves.
      const workerFinding = await config.safety?.checkServiceWorker();
      if (workerFinding) {
        return {
          kind: "paused",
          pause: {
            code: "page_blocked",
            summary: workerFinding.summary,
            question: null,
            blocker: null,
          },
        };
      }
      const write = await config.hands.clickAction(action.ref);
      if (!write.ok) {
        return { kind: "refused", reason: write.error, observation };
      }
      deps.guardState.hasWritten = true;
      const moveStop = await guardStop(deps, observation.url);
      if (moveStop) {
        return { kind: "paused", pause: moveStop };
      }
      return {
        kind: "moved",
        actionLabel: action.label,
        observation: await config.hands.observe(),
      };
    }

    case "submit_application": {
      const preflight = runSubmitPreflight({
        observation,
        proposedActionRef: proposal.ref,
        authority: config.authority,
      });
      if (!preflight.ok) {
        return { kind: "refused", reason: preflight.reason, observation };
      }
      const action = observation.actions.find(
        (candidate) => candidate.ref === proposal.ref,
      );
      // Nothing is pressed here. Sending an application is one irreversible
      // act that has to be recorded as it happens, so it belongs to the
      // submission path rather than to this loop.
      return {
        kind: "ready_to_send",
        finalActionRef: proposal.ref,
        finalActionLabel: action?.label ?? "Submit application",
        observation,
      };
    }

    default: {
      const exhaustive: never = proposal;
      return {
        kind: "refused",
        reason: `Unsupported step: ${JSON.stringify(exhaustive)}`,
        observation,
      };
    }
  }
}


