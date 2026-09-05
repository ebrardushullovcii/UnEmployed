import {
  CandidateProfileSchema,
  ResumeImportModelRoleStateSchema,
  ResumeImportRunSchema,
  type CandidateProfile,
  type ResumeImportRun,
} from "@unemployed/contracts";

const deferredVisionWarningPattern =
  /^Visual scan is still running(?: after text import completed;|\.)/;

export const interruptedVisionMessage =
  "Visual scan stopped when the app closed. Your text import is ready; choose Refresh from resume to retry the visual scan.";

export function recoverInterruptedDeferredVisionRun(input: {
  run: ResumeImportRun;
  isActiveInCurrentProcess: boolean;
  now?: string;
}): ResumeImportRun {
  const run = ResumeImportRunSchema.parse(input.run);
  const modelRoles = ResumeImportModelRoleStateSchema.parse(
    run.modelRoles ?? {},
  );

  if (
    modelRoles.vision.status !== "running" ||
    input.isActiveInCurrentProcess
  ) {
    return run;
  }

  const now = input.now ?? new Date().toISOString();
  return ResumeImportRunSchema.parse({
    ...run,
    warnings: [
      ...run.warnings.filter(
        (warning) => !deferredVisionWarningPattern.test(warning),
      ),
      interruptedVisionMessage,
    ],
    modelRoles: {
      ...modelRoles,
      vision: {
        ...modelRoles.vision,
        status: "failed",
        completedAt: now,
        warning: interruptedVisionMessage,
        errorMessage: interruptedVisionMessage,
      },
    },
  });
}

export function clearSettledVisionDeferredWarnings(input: {
  profile: CandidateProfile;
  run: ResumeImportRun | null;
}): CandidateProfile {
  const visionStatus = input.run?.modelRoles?.vision.status;
  const currentWarnings = input.profile.baseResume.analysisWarnings;

  if (
    !visionStatus ||
    visionStatus === "running" ||
    !currentWarnings.some((warning) =>
      deferredVisionWarningPattern.test(warning),
    )
  ) {
    return input.profile;
  }

  return CandidateProfileSchema.parse({
    ...input.profile,
    baseResume: {
      ...input.profile.baseResume,
      analysisWarnings: currentWarnings.filter(
        (warning) => !deferredVisionWarningPattern.test(warning),
      ),
    },
  });
}
