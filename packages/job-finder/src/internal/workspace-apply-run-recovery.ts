import { ApplyRunSchema, type ApplyRun } from "@unemployed/contracts";

export function recoverInterruptedApplyRun(
  run: ApplyRun,
  completedAt: string,
): ApplyRun {
  if (run.state !== "running") {
    return run;
  }

  return ApplyRunSchema.parse({
    ...run,
    state: "failed",
    updatedAt: completedAt,
    completedAt,
    summary: "Automatic apply stopped because the app closed.",
    detail:
      "The app closed before safe application preparation finished. No final submit action was taken, and any preparation saved before the interruption remains available for review.",
  });
}
