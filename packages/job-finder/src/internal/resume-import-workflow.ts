import {
  CandidateProfileSchema,
  ResumeDocumentBundleSchema,
  ResumeImportRunSchema,
  type AiProviderKind,
  type CandidateProfile,
  type JobSearchPreferences,
  type ResumeDocumentBundle,
  type ResumeImportFieldCandidate,
  type ResumeImportBranchStatus,
  type ResumeImportModelRoleState,
  type ResumeImportRun,
  type ResumeImportVisionArtifact,
} from "@unemployed/contracts";

import type { WorkspaceServiceContext } from "./workspace-service-context";
export {
  applyResolvedResumeImportCandidatesToWorkspace,
} from "./resume-import-apply";
export {
  countResumeImportCandidates,
  hasBlockingResumeImportCandidates,
  summarizeCandidateWarnings,
} from "./resume-import-candidate-utils";
import { applyResolvedResumeImportCandidatesToWorkspace } from "./resume-import-apply";
import {
  countResumeImportCandidates,
  hasBlockingResumeImportCandidates,
  RESUME_IMPORT_STAGES,
  summarizeCandidateWarnings,
  toCandidate,
} from "./resume-import-candidate-utils";
import { extractLiteralCandidates } from "./resume-import-literal-extraction";
import { enrichExperienceCandidatesFromNearbyMarkers } from "./resume-import-experience-markers";
import {
  ResumeVisionExtractionResultSchema,
  type ResumeVisionExtractionResult,
} from "@unemployed/ai-providers";
import {
  normalizeSharedMemoryCandidates,
  promoteGroundedSharedMemoryCandidates,
  reconcileCandidates,
} from "./resume-import-reconciliation";
import { createUniqueId, uniqueStrings } from "./shared";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeInlineText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function promoteEducationScalarCandidates(
  candidates: readonly ResumeImportFieldCandidate[],
): ResumeImportFieldCandidate[] {
  const promoted: ResumeImportFieldCandidate[] = [];
  const scalarEducationCandidates = candidates.filter(
    (candidate) =>
      candidate.target.section === "education" &&
      candidate.target.key !== "record" &&
      !isObjectRecord(candidate.value),
  );

  for (const candidate of candidates) {
    if (
      candidate.target.section !== "education" ||
      candidate.target.key !== "record" ||
      typeof candidate.value !== "string"
    ) {
      promoted.push(candidate);
      continue;
    }

    const text = normalizeInlineText(candidate.value);
    const relatedScalars = scalarEducationCandidates.filter(
      (entry) => normalizeInlineText(entry.value) && text.includes(normalizeInlineText(entry.value)),
    );
    const schoolScalar = relatedScalars.find((entry) =>
      /institution|school|university|college/i.test(entry.label) || entry.target.key === "institution",
    );
    const degreeScalar = relatedScalars.find((entry) =>
      /degree|bachelor|master|phd/i.test(entry.label),
    );
    const startScalar = relatedScalars.find((entry) => /start/i.test(entry.label));
    const endScalar = relatedScalars.find((entry) => /graduation|end/i.test(entry.label));
    const dateRange = text.match(/((?:[A-Za-z]{3,9}\s+)?\d{4})\s*[–—-]\s*((?:[A-Za-z]{3,9}\s+)?\d{4}|present|current)/i);
    const schoolName = normalizeInlineText(schoolScalar?.value) || null;
    let degree = normalizeInlineText(degreeScalar?.value) || null;
    let fieldOfStudy: string | null = null;

    if (degree) {
      const degreeWithField = degree.match(/^(.*?(?:degree|bachelor|master|phd)(?:\s*\([^)]*\))?)(?:\s+in\s+|,\s+)(.+)$/i);
      if (degreeWithField) {
        degree = normalizeInlineText(degreeWithField[1]);
        fieldOfStudy = normalizeInlineText(degreeWithField[2]) || null;
      }
    }

    if (!schoolName || !degree) {
      promoted.push(candidate);
      continue;
    }

    promoted.push({
      ...candidate,
      value: {
        schoolName,
        degree,
        fieldOfStudy,
        location: null,
        startDate: normalizeInlineText(startScalar?.value) || dateRange?.[1] || null,
        endDate: normalizeInlineText(endScalar?.value) || dateRange?.[2] || null,
        summary: null,
      },
      normalizedValue: null,
      valuePreview: null,
      notes: uniqueStrings([...candidate.notes, "education_scalar_record_promoted"]),
    });
  }

  return promoted;
}

type ResumeImportTrigger = ResumeImportRun["trigger"];

type ResumeImportBranchResult =
  | {
      ok: true;
      literalCandidates: ResumeImportFieldCandidate[];
      stageCandidates: ResumeImportFieldCandidate[];
      providerKind: Extract<AiProviderKind, "deterministic" | "openai_compatible"> | null;
      providerLabel: string | null;
      notes: string[];
    }
  | {
      ok: false;
      message: string;
    };

type ResumeVisionBranchResult =
  | {
      ok: true;
      result: ResumeVisionExtractionResult;
    }
  | {
      ok: false;
      skipped?: true;
      message: string;
    };

type ResumeVisionBranchDeferredResult = {
  ok: false;
  deferred: true;
  message: string;
};

type ResumeVisionBranchResolution = ResumeVisionBranchResult | ResumeVisionBranchDeferredResult;

type PromiseSnapshot<T> =
  | {
      settled: false;
    }
  | {
      settled: true;
      value: T;
    };

function observePromise<T>(promise: Promise<T>): {
  promise: Promise<T>;
  getSnapshot: () => PromiseSnapshot<T>;
} {
  let snapshot: PromiseSnapshot<T> = { settled: false };
  const observedPromise = promise.then((value) => {
    snapshot = { settled: true, value };
    return value;
  });

  return {
    promise: observedPromise,
    getSnapshot: () => snapshot,
  };
}

function isTimeoutLikeMessage(message: string): boolean {
  return /timed out|timeout|aborted/i.test(message);
}

function branchStatusForFailure(message: string): "failed" | "timed_out" {
  return isTimeoutLikeMessage(message) ? "timed_out" : "failed";
}

function messageFromUnknownError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function visionTimeoutMsFor(ctx: WorkspaceServiceContext): number {
  const timeoutMs = ctx.visionProvider?.getStatus().requestTimeoutMs;

  return typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : 600_000;
}

function visionBranchTimeoutMessage(timeoutMs: number): string {
  return `Vision resume import branch timed out after ${timeoutMs}ms; text import continued.`;
}

function visionBranchDeferredMessage(timeoutMs: number): string {
  return `Visual scan is still running after text import completed; text import is ready and visual reconciliation will continue in the background until the ${timeoutMs}ms vision provider deadline.`;
}

function removeVisionDeferredWarnings(
  warnings: readonly string[],
): string[] {
  return warnings.filter(
    (warning) => !/^Visual scan is still running after text import completed;/.test(warning),
  );
}

function createVisionTimeoutResult(ctx: WorkspaceServiceContext, message: string): ResumeVisionExtractionResult {
  const status = ctx.visionProvider?.getStatus();

  return ResumeVisionExtractionResultSchema.parse({
    analysisProviderKind: status?.kind === "openai_compatible_vision" ? "openai_compatible_vision" : "deterministic",
    analysisProviderLabel: status?.label ?? "Resume vision provider",
    candidates: [],
    notes: [],
    warnings: [message],
    primaryErrorMessage: message,
  });
}

function createTimedOutVisionResult(ctx: WorkspaceServiceContext, timeoutMs: number): ResumeVisionExtractionResult {
  return createVisionTimeoutResult(ctx, visionBranchTimeoutMessage(timeoutMs));
}

function withVisionBranchDeadline(
  promise: Promise<ResumeVisionBranchResult>,
  timeoutMs: number,
  ctx: WorkspaceServiceContext,
  options: { unrefTimer?: boolean } = {},
): Promise<ResumeVisionBranchResult> {
  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<ResumeVisionBranchResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: true, result: createTimedOutVisionResult(ctx, timeoutMs) });
    }, timeoutMs);
    if (options.unrefTimer) {
      timer.unref?.();
    }
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function getVisionBranchWithoutBlockingTextCompletion(
  observedVisionBranch: ReturnType<typeof observePromise<ResumeVisionBranchResult>>,
  timeoutMs: number,
): Promise<ResumeVisionBranchResolution> {
  let timer: NodeJS.Timeout | null = null;
  const nextTickPromise = new Promise<{ settled: false }>((resolve) => {
    timer = setTimeout(() => {
      resolve({ settled: false });
    }, 0);
  });

  return Promise.race([
    observedVisionBranch.promise.then((value) => ({ settled: true as const, value })),
    nextTickPromise,
  ]).then((outcome) => {
    if (outcome.settled) {
      return outcome.value;
    }

    return {
      ok: false as const,
      deferred: true as const,
      message: visionBranchDeferredMessage(timeoutMs),
    };
  }).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function isDeferredVisionBranch(
  visionBranch: ResumeVisionBranchResolution,
): visionBranch is ResumeVisionBranchDeferredResult {
  return !visionBranch.ok && "deferred" in visionBranch;
}

function hasExplicitUserDecision(candidate: ResumeImportFieldCandidate): boolean {
  return Boolean(
    candidate.resolvedAt &&
    candidate.resolution !== "needs_review" &&
    candidate.resolutionReason &&
    /setup_|review_/.test(candidate.resolutionReason),
  );
}

function mergeCurrentResolution(
  candidate: ResumeImportFieldCandidate,
  currentCandidate: ResumeImportFieldCandidate | undefined,
): ResumeImportFieldCandidate {
  if (!currentCandidate || !hasExplicitUserDecision(currentCandidate)) {
    return candidate;
  }

  return {
    ...candidate,
    resolution: currentCandidate.resolution,
    resolutionReason: currentCandidate.resolutionReason,
    resolvedAt: currentCandidate.resolvedAt,
    value: currentCandidate.value,
    normalizedValue: currentCandidate.normalizedValue,
    valuePreview: currentCandidate.valuePreview,
    evidenceText: currentCandidate.evidenceText,
    confidence: currentCandidate.confidence,
    notes: currentCandidate.notes,
    alternatives: currentCandidate.alternatives,
    conflictChoices: currentCandidate.conflictChoices,
    visualEvidence: currentCandidate.visualEvidence,
  };
}

function preserveCurrentCandidateDecisions(
  nextCandidates: readonly ResumeImportFieldCandidate[],
  currentCandidates: readonly ResumeImportFieldCandidate[],
): ResumeImportFieldCandidate[] {
  const currentById = new Map(currentCandidates.map((candidate) => [candidate.id, candidate]));

  return nextCandidates.map((candidate) => mergeCurrentResolution(candidate, currentById.get(candidate.id)));
}

async function preserveLatestCandidateDecisions(
  ctx: WorkspaceServiceContext,
  runId: string,
  candidates: readonly ResumeImportFieldCandidate[],
): Promise<ResumeImportFieldCandidate[]> {
  return preserveCurrentCandidateDecisions(
    candidates,
    await ctx.repository.listResumeImportFieldCandidates({ runId }),
  );
}

function branchStateFromVisionResolution(input: {
  current: ResumeImportModelRoleState["vision"];
  visionBranch: ResumeVisionBranchResolution;
  visionTimeoutMs: number | null;
}) {
  const { current, visionBranch, visionTimeoutMs } = input;

  if (visionBranch.ok) {
    return {
      ...current,
      status: visionBranch.result.primaryErrorMessage
        ? branchStatusForFailure(visionBranch.result.primaryErrorMessage)
        : "completed" as const,
      completedAt: new Date().toISOString(),
      providerKind: visionBranch.result.analysisProviderKind,
      providerLabel: visionBranch.result.analysisProviderLabel,
      timeoutMs: visionTimeoutMs,
      warning: visionBranch.result.warnings[0] ?? null,
      errorMessage: visionBranch.result.primaryErrorMessage,
      candidateCount: visionBranch.result.candidates.length,
    };
  }

  if (isDeferredVisionBranch(visionBranch)) {
    return {
      ...current,
      status: "running" as const,
      completedAt: null,
      providerKind: current.providerKind,
      providerLabel: current.providerLabel,
      timeoutMs: visionTimeoutMs,
      warning: visionBranch.message,
      errorMessage: null,
      candidateCount: 0,
    };
  }

  return {
    ...current,
    status: "skipped" in visionBranch
      ? "skipped" as const
      : branchStatusForFailure(visionBranch.message),
    completedAt: new Date().toISOString(),
    providerKind: null,
    providerLabel: null,
    timeoutMs: visionTimeoutMs,
    warning: visionBranch.message,
    errorMessage: "skipped" in visionBranch ? null : visionBranch.message,
    candidateCount: 0,
  };
}

async function completeDeferredVisionBranch(input: {
  ctx: WorkspaceServiceContext;
  promise: Promise<ResumeVisionBranchResult>;
  bundle: ResumeDocumentBundle;
  run: ResumeImportRun;
  runId: string;
  now: string;
  textCandidates: readonly ResumeImportFieldCandidate[];
  visionTimeoutMs: number;
}): Promise<void> {
  const {
    ctx,
    promise,
    bundle,
    runId,
    now,
    textCandidates,
    visionTimeoutMs,
  } = input;
  let run = input.run;

  try {
    const visionBranch = await withVisionBranchDeadline(promise, visionTimeoutMs, ctx, {
      unrefTimer: true,
    });
    const currentCandidates = await ctx.repository.listResumeImportFieldCandidates({ runId });
    const latestProfile = CandidateProfileSchema.parse(await ctx.repository.getProfile());
    const latestSearchPreferences = await ctx.repository.getSearchPreferences();
    const currentTextCandidates = currentCandidates.filter(
      (candidate) => candidate.sourceKind !== "vision_omni" && candidate.sourceKind !== "adjudicator",
    );
    const preservedTextCandidates = currentTextCandidates.length > 0
      ? currentTextCandidates
      : [...textCandidates];
    const visionCandidates = visionBranch.ok
      ? visionBranch.result.candidates.map((candidate, index) =>
          toCandidate(bundle, runId, "vision_omni", now, candidate, 10_000 + index),
        )
      : [];
    const provisionalCandidates = promoteEducationScalarCandidates(
      normalizeSharedMemoryCandidates(
        enrichExperienceCandidatesFromNearbyMarkers(bundle, [
          ...preservedTextCandidates,
          ...visionCandidates,
        ]),
      ),
    );
    run = ResumeImportRunSchema.parse({
      ...run,
      status: "extracting",
      visionProviderKind:
        visionBranch.ok ? visionBranch.result.analysisProviderKind : run.visionProviderKind ?? null,
      visionProviderLabel:
        visionBranch.ok ? visionBranch.result.analysisProviderLabel : run.visionProviderLabel ?? null,
      modelRoles: {
        ...modelRolesFor(run),
        vision: branchStateFromVisionResolution({
          current: modelRolesFor(run).vision,
          visionBranch,
          visionTimeoutMs,
        }),
      },
    });

    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: provisionalCandidates,
    });

    let reconciledCandidates = preserveCurrentCandidateDecisions(
      promoteGroundedSharedMemoryCandidates(
        reconcileCandidates(latestProfile, latestSearchPreferences, provisionalCandidates),
      ),
      currentCandidates,
    );
    const adjudicationStartedAt = new Date().toISOString();
    run = ResumeImportRunSchema.parse({
      ...run,
      status: "reconciling",
      modelRoles: {
        ...modelRolesFor(run),
        adjudication: {
          ...modelRolesFor(run).adjudication,
          status: hasReviewableTextVisionConflict(reconciledCandidates)
            ? "running"
            : "skipped",
          startedAt: hasReviewableTextVisionConflict(reconciledCandidates)
            ? adjudicationStartedAt
            : modelRolesFor(run).adjudication.startedAt,
        },
      },
    });
    reconciledCandidates = await preserveLatestCandidateDecisions(ctx, runId, reconciledCandidates);
    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: reconciledCandidates,
    });

    const adjudicationResult = await maybeAdjudicateResumeImportCandidates(ctx, {
      profile: latestProfile,
      searchPreferences: latestSearchPreferences,
      bundle,
      runId,
      now,
      candidates: reconciledCandidates,
    });
    reconciledCandidates = preserveCurrentCandidateDecisions(
      promoteGroundedSharedMemoryCandidates(
        reconcileCandidates(latestProfile, latestSearchPreferences, adjudicationResult.candidates),
      ),
      currentCandidates,
    );

    reconciledCandidates = await preserveLatestCandidateDecisions(ctx, runId, reconciledCandidates);

    const visionBranchNotes = visionBranch.ok
      ? [...visionBranch.result.notes, ...visionBranch.result.warnings]
      : "skipped" in visionBranch
        ? []
        : [visionBranch.message];
    const stageNotes = uniqueStrings([
      ...removeVisionDeferredWarnings(run.warnings),
      ...visionBranchNotes,
      ...adjudicationResult.notes,
      ...adjudicationResult.warnings,
      ...summarizeCandidateWarnings(reconciledCandidates),
    ]);
    const hasBlockingReviewCandidates = hasBlockingResumeImportCandidates(reconciledCandidates);

    run = ResumeImportRunSchema.parse({
      ...run,
      status: hasBlockingReviewCandidates ? "review_ready" : "applied",
      completedAt: new Date().toISOString(),
      warnings: stageNotes,
      candidateCounts: countResumeImportCandidates(reconciledCandidates),
      modelRoles: {
        ...modelRolesFor(run),
        adjudication: {
          ...modelRolesFor(run).adjudication,
          status: adjudicationResult.status,
          completedAt: new Date().toISOString(),
          providerKind: adjudicationResult.providerKind,
          providerLabel: adjudicationResult.providerLabel,
          warning: adjudicationResult.warnings[0] ?? null,
          errorMessage: adjudicationResult.errorMessage,
          candidateCount: reconciledCandidates.filter(
            (candidate) => candidate.sourceKind === "adjudicator",
          ).length,
        },
      },
    });

    const merged = applyResolvedResumeImportCandidatesToWorkspace({
      profile: latestProfile,
      searchPreferences: latestSearchPreferences,
      candidates: reconciledCandidates,
      analysisProviderKind: run.analysisProviderKind,
      analysisProviderLabel: run.analysisProviderLabel,
      analysisWarnings: stageNotes,
    });

    await ctx.repository.finalizeResumeImportRun({
      profile: merged.profile,
      searchPreferences: merged.searchPreferences,
      run,
      documentBundles: [bundle],
      fieldCandidates: reconciledCandidates,
    });
  } catch (error) {
    const message = messageFromUnknownError(error, "Deferred resume vision branch failed.");
    const failedRun = ResumeImportRunSchema.parse({
      ...run,
      modelRoles: {
        ...modelRolesFor(run),
        vision: {
          ...modelRolesFor(run).vision,
          status: branchStatusForFailure(message),
          completedAt: new Date().toISOString(),
          timeoutMs: visionTimeoutMs,
          errorMessage: message,
          warning: message,
        },
      },
      warnings: uniqueStrings([...run.warnings, message]),
    });
    const currentCandidates = await ctx.repository.listResumeImportFieldCandidates({ runId });
    await ctx.repository.replaceResumeImportRunArtifacts({
      run: failedRun,
      documentBundles: [bundle],
      fieldCandidates: currentCandidates,
    });
  }
}

function scheduleDeferredVisionBranchCompletion(input: Parameters<typeof completeDeferredVisionBranch>[0]): void {
  void completeDeferredVisionBranch(input).catch((error: unknown) => {
    console.error(
      "Deferred resume vision branch completion failed.",
      error,
    );
  });
}

function modelRolesFor(run: ResumeImportRun): ResumeImportModelRoleState {
  return run.modelRoles ?? {
    text: {
      status: "not_started",
      startedAt: null,
      completedAt: null,
      providerKind: null,
      providerLabel: null,
      warning: null,
      errorMessage: null,
      timeoutMs: null,
      candidateCount: 0,
    },
    vision: {
      status: "not_started",
      startedAt: null,
      completedAt: null,
      providerKind: null,
      providerLabel: null,
      warning: null,
      errorMessage: null,
      timeoutMs: null,
      candidateCount: 0,
    },
    adjudication: {
      status: "not_started",
      startedAt: null,
      completedAt: null,
      providerKind: null,
      providerLabel: null,
      warning: null,
      errorMessage: null,
      timeoutMs: null,
      candidateCount: 0,
    },
  };
}

function hasReviewableTextVisionConflict(
  candidates: readonly ResumeImportFieldCandidate[],
): boolean {
  return candidates.some(
    (candidate) =>
      candidate.resolution === "needs_review" &&
      (candidate.conflictChoices ?? []).some((choice) => choice.sourceLabel === "Document text") &&
      (candidate.conflictChoices ?? []).some((choice) => choice.sourceLabel === "Visual scan"),
  );
}

async function maybeAdjudicateResumeImportCandidates(
  ctx: WorkspaceServiceContext,
  input: {
    profile: CandidateProfile;
    searchPreferences: JobSearchPreferences;
    bundle: ResumeDocumentBundle;
    runId: string;
    now: string;
    candidates: readonly ResumeImportFieldCandidate[];
  },
): Promise<{
  candidates: ResumeImportFieldCandidate[];
  notes: string[];
  warnings: string[];
  status: ResumeImportBranchStatus;
  providerKind: AiProviderKind | null;
  providerLabel: string | null;
  errorMessage: string | null;
}> {
  if (!hasReviewableTextVisionConflict(input.candidates)) {
    return {
      candidates: [...input.candidates],
      notes: [],
      warnings: [],
      status: "skipped",
      providerKind: null,
      providerLabel: null,
      errorMessage: null,
    };
  }

  if (!ctx.aiClient.adjudicateResumeImportCandidates) {
    return {
      candidates: [...input.candidates],
      notes: [
        "Material text-vs-visual import conflicts were routed to setup review because no Pro adjudication adapter is configured.",
      ],
      warnings: [],
      status: "skipped",
      providerKind: null,
      providerLabel: null,
      errorMessage: null,
    };
  }

  try {
    const result = await ctx.aiClient.adjudicateResumeImportCandidates({
      existingProfile: input.profile,
      existingSearchPreferences: input.searchPreferences,
      documentBundle: input.bundle,
      candidates: input.candidates,
    });
    const adjudicatedCandidates = result.candidates.map((candidate, index) =>
      toCandidate(input.bundle, input.runId, "adjudicator", input.now, candidate, 20_000 + index),
    );

    return {
      candidates: [...input.candidates, ...adjudicatedCandidates],
      notes: result.notes,
      warnings: result.warnings,
      status: "completed",
      providerKind: ctx.aiClient.getStatus().kind,
      providerLabel: ctx.aiClient.getStatus().label,
      errorMessage: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resume import adjudication failed.";
    return {
      candidates: [...input.candidates],
      notes: [
        "Material text-vs-visual import conflicts stayed in setup review after adjudication failed.",
      ],
      warnings: [message],
      status: branchStatusForFailure(message),
      providerKind: ctx.aiClient.getStatus().kind,
      providerLabel: ctx.aiClient.getStatus().label,
      errorMessage: message,
    };
  }
}

export async function runResumeImportWorkflow(
  ctx: WorkspaceServiceContext,
  input: {
    profile: CandidateProfile;
    searchPreferences: JobSearchPreferences;
    documentBundle: ResumeDocumentBundle;
    trigger: ResumeImportTrigger;
    importWarnings?: readonly string[];
    visionArtifact?: ResumeImportVisionArtifact | null;
  },
): Promise<{
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  run: ResumeImportRun;
  candidates: ResumeImportFieldCandidate[];
}> {
  const now = new Date().toISOString();
  const runId = createUniqueId("resume_import_run");
  const bundle = ResumeDocumentBundleSchema.parse({
    ...input.documentBundle,
    id: createUniqueId("resume_bundle"),
    runId,
    sourceResumeId: input.profile.baseResume.id,
  });

  let run = ResumeImportRunSchema.parse({
    id: runId,
    sourceResumeId: input.profile.baseResume.id,
    sourceResumeFileName: input.profile.baseResume.fileName,
    trigger: input.trigger,
    status: "parsing",
    startedAt: now,
    completedAt: null,
    primaryParserKind: bundle.primaryParserKind,
    parserKinds: bundle.parserKinds,
    analysisProviderKind: null,
    analysisProviderLabel: null,
    visionProviderKind: null,
    visionProviderLabel: null,
    modelRoles: {
      text: { status: "not_started" },
      vision: { status: input.visionArtifact ? "not_started" : "skipped" },
      adjudication: { status: "not_started" },
    },
    warnings: uniqueStrings([...(input.importWarnings ?? []), ...bundle.warnings]),
    errorMessage: null,
    candidateCounts: {
      total: 0,
      autoApplied: 0,
      needsReview: 0,
      rejected: 0,
      abstained: 0,
    },
  });

  await ctx.repository.replaceResumeImportRunArtifacts({
    run,
    documentBundles: [bundle],
    fieldCandidates: [],
  });

  try {
    const textStartedAt = new Date().toISOString();
    const visionArtifact = input.visionArtifact;
    const visionProvider = ctx.visionProvider;
    const visionSkipMessage = !visionArtifact || visionArtifact.pages.length === 0
      ? "No local resume page images were available for the vision branch."
      : "Resume vision provider is not configured; text import continued.";
    const canRunVision = Boolean(visionArtifact && visionArtifact.pages.length > 0 && visionProvider);
    const visionStartedAt = canRunVision ? textStartedAt : null;
    const visionTimeoutMs = canRunVision ? visionTimeoutMsFor(ctx) : null;
    const modelRoles = modelRolesFor(run);
    run = ResumeImportRunSchema.parse({
      ...run,
      status: "extracting",
      modelRoles: {
        ...modelRoles,
        text: { ...modelRoles.text, status: "running", startedAt: textStartedAt },
      vision: canRunVision
          ? {
              ...modelRoles.vision,
              status: "running",
              startedAt: visionStartedAt,
              timeoutMs: visionTimeoutMs,
              providerKind: visionProvider?.getStatus().kind ?? null,
              providerLabel: visionProvider?.getStatus().label ?? null,
            }
          : {
              ...modelRoles.vision,
              status: "skipped",
              warning: visionSkipMessage,
            },
      },
    });
    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: [],
    });

    const textBranchPromise: Promise<ResumeImportBranchResult> = (async (): Promise<ResumeImportBranchResult> => {
      const literalCandidates = extractLiteralCandidates(runId, bundle, now);
      const stageResults = await Promise.all(
        RESUME_IMPORT_STAGES.map(async (stage) => {
          const result = await ctx.aiClient.extractResumeImportStage({
            stage,
            existingProfile: input.profile,
            existingSearchPreferences: input.searchPreferences,
            documentBundle: bundle,
          });
          return {
            stage,
            result,
          };
        }),
      );

      const stageCandidates = stageResults.flatMap(({ stage, result }) => {
        const sourceKind = (() => {
          switch (stage) {
            case "identity_summary":
              return "model_identity_summary" as const;
            case "experience":
              return "model_experience" as const;
            case "background":
              return "model_background" as const;
            case "shared_memory":
              return "model_shared_memory" as const;
            default:
              return "reconciler" as const;
          }
        })();

        return result.candidates.map((candidate, index) =>
          toCandidate(bundle, runId, sourceKind, now, candidate, index),
        );
      });

      return {
        ok: true as const,
        literalCandidates,
        stageCandidates,
        providerKind:
          stageResults.find((entry) => entry.result.analysisProviderKind !== null)?.result
            .analysisProviderKind ?? null,
        providerLabel:
          stageResults.find((entry) => entry.result.analysisProviderLabel)?.result
            .analysisProviderLabel ?? null,
        notes: uniqueStrings(stageResults.flatMap((entry) => entry.result.notes)),
      };
    })().catch((error: unknown): ResumeImportBranchResult => ({
      ok: false,
      message: messageFromUnknownError(error, "Text resume import branch failed."),
    }));

    const visionBranchPromise: Promise<ResumeVisionBranchResult> = canRunVision && visionArtifact && visionProvider
      ? visionProvider.extractResumeVision({
            existingProfile: input.profile,
            existingSearchPreferences: input.searchPreferences,
            documentBundle: bundle,
            visionArtifact,
          }).then((result) => ({ ok: true as const, result }))
          .catch((error: unknown) => ({
            ok: false as const,
            message: messageFromUnknownError(error, "Vision resume import branch failed."),
          }))
      : Promise.resolve({
          ok: false as const,
          skipped: true as const,
          message: visionSkipMessage,
        });
    const observedVisionBranch = observePromise(visionBranchPromise);

    const textBranch = await textBranchPromise;
    let visionBranch: ResumeVisionBranchResolution;

    if (textBranch.ok && canRunVision) {
      const visionSnapshot = observedVisionBranch.getSnapshot();
      visionBranch = visionSnapshot.settled
        ? visionSnapshot.value
        : await getVisionBranchWithoutBlockingTextCompletion(
            observedVisionBranch,
            visionTimeoutMs ?? 600_000,
          );
    } else {
      visionBranch = canRunVision
        ? await withVisionBranchDeadline(
            observedVisionBranch.promise,
            visionTimeoutMs ?? 600_000,
            ctx,
          )
        : await observedVisionBranch.promise;
    }

    run = ResumeImportRunSchema.parse({
      ...run,
      status: "extracting",
      analysisProviderKind:
        textBranch.ok ? textBranch.providerKind : null,
      analysisProviderLabel:
        textBranch.ok ? textBranch.providerLabel : null,
      visionProviderKind:
        visionBranch.ok ? visionBranch.result.analysisProviderKind : null,
      visionProviderLabel:
        visionBranch.ok ? visionBranch.result.analysisProviderLabel : null,
      modelRoles: {
        ...modelRolesFor(run),
        text: {
          ...modelRolesFor(run).text,
          status: textBranch.ok ? "completed" : branchStatusForFailure(textBranch.message),
          completedAt: new Date().toISOString(),
          providerKind: textBranch.ok ? textBranch.providerKind : null,
          providerLabel: textBranch.ok ? textBranch.providerLabel : null,
          errorMessage: textBranch.ok ? null : textBranch.message,
          candidateCount: textBranch.ok ? textBranch.literalCandidates.length + textBranch.stageCandidates.length : 0,
        },
        vision: branchStateFromVisionResolution({
          current: modelRolesFor(run).vision,
          visionBranch,
          visionTimeoutMs,
        }),
      },
    });

    const visionBranchHasUsableCandidates = visionBranch.ok && visionBranch.result.candidates.length > 0;

    if (!textBranch.ok && !visionBranchHasUsableCandidates) {
      throw new Error(
        uniqueStrings([
          textBranch.message,
          visionBranch.ok
            ? visionBranch.result.primaryErrorMessage ?? "Vision resume import produced no usable candidates."
            : visionBranch.message,
        ]).join(" ") ||
          "Both resume import extraction branches failed.",
      );
    }

    const visionCandidates = visionBranch.ok
      ? visionBranch.result.candidates.map((candidate, index) =>
          toCandidate(bundle, runId, "vision_omni", now, candidate, 10_000 + index),
        )
      : [];

    const provisionalCandidates = promoteEducationScalarCandidates(
      normalizeSharedMemoryCandidates(
        enrichExperienceCandidatesFromNearbyMarkers(bundle, [
          ...(textBranch.ok ? textBranch.literalCandidates : []),
          ...(textBranch.ok ? textBranch.stageCandidates : []),
          ...visionCandidates,
        ]),
      ),
    );
    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: provisionalCandidates,
    });

    let reconciledCandidates = promoteGroundedSharedMemoryCandidates(
      reconcileCandidates(input.profile, input.searchPreferences, provisionalCandidates),
    );
    const adjudicationStartedAt = new Date().toISOString();
    run = ResumeImportRunSchema.parse({
      ...run,
      status: "reconciling",
      modelRoles: {
        ...modelRolesFor(run),
        adjudication: {
          ...modelRolesFor(run).adjudication,
          status: hasReviewableTextVisionConflict(reconciledCandidates)
            ? "running"
            : "skipped",
          startedAt: hasReviewableTextVisionConflict(reconciledCandidates)
            ? adjudicationStartedAt
            : null,
        },
      },
    });
    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: reconciledCandidates,
    });

    const adjudicationResult = await maybeAdjudicateResumeImportCandidates(ctx, {
      profile: input.profile,
      searchPreferences: input.searchPreferences,
      bundle,
      runId,
      now,
      candidates: reconciledCandidates,
    });
    reconciledCandidates = promoteGroundedSharedMemoryCandidates(
      reconcileCandidates(input.profile, input.searchPreferences, adjudicationResult.candidates),
    );
    run = ResumeImportRunSchema.parse({
      ...run,
      modelRoles: {
        ...modelRolesFor(run),
        adjudication: {
          ...modelRolesFor(run).adjudication,
          status: adjudicationResult.status,
          completedAt: new Date().toISOString(),
          providerKind: adjudicationResult.providerKind,
          providerLabel: adjudicationResult.providerLabel,
          warning: adjudicationResult.warnings[0] ?? null,
          errorMessage: adjudicationResult.errorMessage,
          candidateCount: reconciledCandidates.filter(
            (candidate) => candidate.sourceKind === "adjudicator",
          ).length,
        },
      },
    });
    const visionBranchNotes = visionBranch.ok
      ? [...visionBranch.result.notes, ...visionBranch.result.warnings]
      : "skipped" in visionBranch
        ? []
        : [visionBranch.message];
    const stageNotes = uniqueStrings([
      ...(textBranch.ok ? textBranch.notes : [textBranch.message]),
      ...visionBranchNotes,
      ...adjudicationResult.notes,
      ...adjudicationResult.warnings,
    ]);
    const analysisWarnings = uniqueStrings([
      ...run.warnings,
      ...stageNotes,
      ...summarizeCandidateWarnings(reconciledCandidates),
    ]);
    const merged = applyResolvedResumeImportCandidatesToWorkspace({
      profile: input.profile,
      searchPreferences: input.searchPreferences,
      candidates: reconciledCandidates,
      analysisProviderKind: run.analysisProviderKind,
      analysisProviderLabel: run.analysisProviderLabel,
      analysisWarnings,
    });
    const candidateCounts = countResumeImportCandidates(reconciledCandidates);
    const hasBlockingReviewCandidates =
      hasBlockingResumeImportCandidates(reconciledCandidates);

    run = ResumeImportRunSchema.parse({
      ...run,
      status: hasBlockingReviewCandidates ? "review_ready" : "applied",
      completedAt: new Date().toISOString(),
      warnings: analysisWarnings,
      candidateCounts,
    });

    await ctx.repository.finalizeResumeImportRun({
      profile: merged.profile,
      searchPreferences: merged.searchPreferences,
      run,
      documentBundles: [bundle],
      fieldCandidates: reconciledCandidates,
    });

    if (isDeferredVisionBranch(visionBranch) && canRunVision && visionTimeoutMs) {
      scheduleDeferredVisionBranchCompletion({
        ctx,
        promise: observedVisionBranch.promise,
        bundle,
        run,
        runId,
        now,
        textCandidates: provisionalCandidates.filter(
          (candidate) => candidate.sourceKind !== "vision_omni",
        ),
        visionTimeoutMs,
      });
    }

    return {
      profile: merged.profile,
      searchPreferences: merged.searchPreferences,
      run,
      candidates: reconciledCandidates,
    };
  } catch (error) {
    run = ResumeImportRunSchema.parse({
      ...run,
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage:
        error instanceof Error
          ? error.message
          : "Resume import failed before candidate extraction could finish.",
    });

    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: [],
    });

    await ctx.repository.saveProfile(
      CandidateProfileSchema.parse({
        ...input.profile,
        baseResume: {
          ...input.profile.baseResume,
          extractionStatus: bundle.fullText ? "failed" : "needs_text",
          lastAnalyzedAt: null,
          analysisWarnings: uniqueStrings([
            ...(input.importWarnings ?? []),
            ...bundle.warnings,
            run.errorMessage ?? "Resume import failed.",
          ]),
        },
      }),
    );

    throw error;
  }
}
