import type { ApplyAgentConfig, ApplyFormObservation } from "./types";

/**
 * What the apply agent is told.
 *
 * The tone here is the tone the person sees in the activity trail, so it stays
 * in plain words throughout. The agent is told the goal and left to decide
 * when it is finished; there is no step quota anywhere in these prompts.
 */

export function createApplySystemPrompt(config: ApplyAgentConfig): string {
  const modeSentence =
    config.authority.mode === "autonomous_submit"
      ? "You may finish by sending the application; Job Finder checks everything again before it does."
      : config.authority.mode === "confirm_before_submit"
        ? "Fill everything in and stop before sending. The person reviews it and sends it themselves."
        : "Fill everything in and stop before sending. This application is set to fill in only.";

  return [
    "You are filling in a job application form for one person, on their behalf, in their browser.",
    "",
    "How this works:",
    "- You never type into the page yourself. You say which field to do next and Job Finder writes the answer.",
    "- Job Finder takes answers from the person's profile, the resume going out with this application, and answers they saved before, in that order. You do not get to decide what those facts are.",
    "- Only when a field is free text and nothing stored answers it are you asked to write it. Write it from the resume, the profile, and the posting. Never state a fact none of those support.",
    "- A question nobody can answer honestly is not guessed at. Job Finder stops and asks the person.",
    "- Anything the person has to declare themselves — equal-opportunity questions, consent to a background check, certifying that answers are true, accepting terms — is theirs. Ask for it and Job Finder will either tick it, because they approved that kind in advance, or stop and ask them.",
    "- Never sign in, never create an account, never work around a security check or a code sent to their phone.",
    `- ${modeSentence}`,
    "",
    "Pacing: there is no fixed number of steps. A short form is done in a few; a long one over several screens takes many more, so take the steps it needs. Call finish when the form is complete or cannot go further. If you are genuinely stuck — the same screen keeps coming back, a field will not take an answer, nothing new appears — do not keep repeating yourself: call finish with stuck: true and say exactly what is blocking you.",
  ].join("\n");
}

export function createApplyUserPrompt(config: ApplyAgentConfig): string {
  const { posting } = config.sources;
  const documents = config.sources.documents
    .map((document) => `- ${document.id}: ${document.label} (${document.fileName})`)
    .join("\n");

  return [
    `Apply for ${posting.title} at ${posting.company}${posting.location ? ` (${posting.location})` : ""} on ${config.siteLabel}.`,
    "",
    `The form is open at ${config.application.startingUrl}.`,
    "",
    documents.length > 0
      ? `Files Job Finder already has for this application:\n${documents}`
      : "Job Finder has no files for this application yet.",
    "",
    "Start by inspecting the form. Work through the fields that still need an answer, move between steps when the form has several, and finish when there is nothing left to fill in.",
  ].join("\n");
}

function describeControl(
  control: ApplyFormObservation["controls"][number],
): string {
  const question = [control.groupLabel, control.label]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" — ");
  const parts = [
    `${control.ref} [${control.kind}]`,
    question || control.placeholder || "(no label)",
    control.required ? "required" : "optional",
    control.answered ? "already answered" : "empty",
  ];
  if (control.options.length > 0) {
    parts.push(`choices: ${control.options.slice(0, 12).join(" | ")}`);
  }
  if (control.attestationKind) {
    parts.push("this is something the person declares themselves");
  }
  if (control.invalid && control.validationMessage) {
    parts.push(`the page says: ${control.validationMessage}`);
  }
  if (!control.visible) {
    parts.push("not on screen");
  }
  if (control.disabled || control.readOnly) {
    parts.push("cannot be edited");
  }
  return `- ${parts.join(" · ")}`;
}

/** The page, written out for the model. Nothing here is a DOM handle. */
export function describeObservation(observation: ApplyFormObservation): string {
  const step =
    observation.step.index !== null && observation.step.total !== null
      ? `Step ${observation.step.index} of ${observation.step.total}.`
      : observation.step.label
        ? `Step: ${observation.step.label}.`
        : null;

  const controls = observation.controls.filter((control) => control.visible);
  const actions = observation.actions.filter(
    (action) => action.visible && action.label.length > 0,
  );

  return [
    observation.url ? `Page: ${observation.url}` : null,
    step,
    observation.blocker ? `The page is blocked: ${observation.blocker.summary}` : null,
    observation.validationErrors.length > 0
      ? `The page is showing problems:\n${observation.validationErrors
          .slice(0, 6)
          .map((error) => `- ${error}`)
          .join("\n")}`
      : null,
    controls.length > 0
      ? `Fields:\n${controls.map(describeControl).join("\n")}`
      : "There are no fields on this page.",
    actions.length > 0
      ? `Buttons:\n${actions
          .map(
            (action) =>
              `- ${action.ref}: ${action.label}${action.kind === "final" ? " (sends the application)" : ""}${action.disabled ? " (cannot be used)" : ""}`,
          )
          .join("\n")}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");
}

export function buildStallWarning(input: {
  stepsWithoutProgress: number;
  observation: ApplyFormObservation | null;
}): string {
  return [
    `Stall check: the last ${input.stepsWithoutProgress} steps filled nothing in and moved nowhere.`,
    input.observation?.url ? `The page is still ${input.observation.url}.` : null,
    "Either try something different now — a different field, a different button, a different step — or call finish with stuck: true and say exactly what is blocking you. Do not repeat the same step.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
