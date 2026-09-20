import type { ApplicationPreparationProgress } from "@unemployed/browser-runtime";
import { ApplyJobResultSchema } from "@unemployed/contracts";
import type { JobFinderRepository } from "@unemployed/db";

/**
 * Turns an agent/tool note into a safe sentence for durable UI state.
 *
 * Tool notes may include a field label or the value written to it. Those
 * details belong in the final review card, not in a progress banner or log.
 */
export function describeApplicationPreparationProgress(note: string): string {
  if (note === "asking the assistant what to do next") {
    return "Thinking about the next form step";
  }
  if (note.startsWith("suggest_answer")) return "Checking a form answer";
  if (note.startsWith("observe")) return "Reading the application form";
  if (note.startsWith("fill_text")) return "Filling a text field";
  if (note.startsWith("choose_option")) return "Choosing a form option";
  if (note.startsWith("set_toggle")) return "Setting a form choice";
  if (note.startsWith("upload")) return "Attaching an approved document";
  if (note.startsWith("finished")) return "Finishing the review checkpoint";
  if (note.includes("time limit")) return "The assistant response timed out";
  if (note.includes("failure")) return "A form step needs another approach";
  return "Working through the application form";
}

const ACTIVE_PREPARATION_STATES = new Set([
  "planned",
  "question_capture",
  "filling",
]);

/**
 * Keeps the Applications screen truthful during a long form run.
 *
 * A compare-and-swap prevents a late progress event from replacing a final
 * outcome written by cancellation, review, or submission handling.
 */
export async function persistApplicationPreparationProgress(input: {
  repository: Pick<
    JobFinderRepository,
    "listApplyJobResults" | "compareAndSwapApplyJobResult"
  >;
  resultId: string;
  runId: string;
  jobId: string;
  progress: ApplicationPreparationProgress;
  now?: () => Date;
}): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = (
      await input.repository.listApplyJobResults({
        runId: input.runId,
        jobId: input.jobId,
      })
    ).find((result) => result.id === input.resultId);

    if (!current || !ACTIVE_PREPARATION_STATES.has(current.state)) return;

    const now = (input.now ?? (() => new Date()))().toISOString();
    const next = ApplyJobResultSchema.parse({
      ...current,
      state: "filling",
      summary: `Preparing application · Step ${input.progress.step}`,
      detail: describeApplicationPreparationProgress(input.progress.note),
      updatedAt: now,
      completedAt: null,
    });
    if (
      await input.repository.compareAndSwapApplyJobResult({
        expected: current,
        result: next,
      })
    ) {
      return;
    }
  }
}
