import { acceptsWrittenAnswer, resolveApplyAnswer } from "./answer-sourcing";
import type {
  ApplyAgentConfig,
  ApplyFormObservation,
  ApplyProposal,
} from "./types";

/**
 * The fields nobody needs to think about.
 *
 * A name, an email, a phone and the country it belongs to, a location, a
 * profile link, the resume — these are already known before the page is
 * opened. Asking a model what to put in each of them costs a turn per field
 * and adds nothing: the answer comes from the person's own profile either way.
 *
 * So they are planned here, deterministically, from the observation and the
 * same sourcing rules the executor uses. The executor still binds every one of
 * these proposals to the page and the saved authority before anything is
 * written (ADR 0021) — what changes is only who proposed them. The model is
 * left the work that needs judgement: a question none of the sources answer,
 * and where the form goes next.
 */
export function planSourceAnsweredFills(
  observation: ApplyFormObservation,
  config: ApplyAgentConfig,
  /** Controls this run has already worked, so none is written twice. */
  alreadyDone: ReadonlySet<string> = new Set<string>(),
): ApplyProposal[] {
  const proposals: ApplyProposal[] = [];
  const resume = config.sources.documents.find(
    (document) => document.kind === "resume",
  );

  for (const control of observation.controls) {
    if (
      !control.visible ||
      control.disabled ||
      control.readOnly ||
      control.answered ||
      alreadyDone.has(control.ref)
    ) {
      continue;
    }
    // Anything the person has to declare about themselves stays theirs.
    // A voluntary one is left blank without a word to anyone; a required one
    // the saved policy does not cover is proposed so the executor can stop on
    // it with the declaration blocker (ADR 0012, ADR 0021).
    if (control.attestationKind !== null) {
      const preApproved =
        config.authority.preApprovedAttestationKinds.includes(
          control.attestationKind,
        );
      if (preApproved || control.required) {
        proposals.push({ tool: "answer_control", ref: control.ref });
      }
      continue;
    }

    if (control.kind === "file") {
      if (resume && control.questionKind === "resume") {
        proposals.push({
          tool: "attach_document",
          ref: control.ref,
          documentId: resume.id,
        });
      }
      continue;
    }

    const resolution = resolveApplyAnswer({
      control,
      sources: config.sources,
      salaryDisclosure: config.authority.salaryDisclosure,
    });
    if (resolution.status === "answered") {
      // A field already holding exactly this answer is finished, whatever the
      // page says about whether it counts as answered. Writing it again is a
      // second of the person's time for nothing.
      const shown = `${control.value} ${control.selectedOptionLabel}`
        .toLowerCase()
        .trim();
      if (shown.includes(resolution.answer.value.toLowerCase().trim())) {
        continue;
      }
      proposals.push({ tool: "answer_control", ref: control.ref });
      continue;
    }
    // A list of choices nothing can answer is the person's, and a model turn
    // spent on it can only end the same way — it must not invent an answer to
    // a question about the person. Sending it costs half a minute of their
    // time per field, so it is collected here instead. Free text is different:
    // the model genuinely writes that, so it is left to the loop.
    if (resolution.status === "needs_you" && !acceptsWrittenAnswer(control)) {
      proposals.push({ tool: "answer_control", ref: control.ref });
    }
  }

  return proposals;
}
