import {
  type JobFinderAiClient,
  buildDeterministicResumeProfileExtraction,
  buildDeterministicResumeImportStageExtraction,
} from "@unemployed/ai-providers";
import { createCatalogBrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  ResumeImportBenchmarkReportSchema,
  ResumeImportBenchmarkRequestSchema,
  type CandidateProfile,
  type JobSearchPreferences,
  type ResumeDocumentBundle,
  type ResumeImportBenchmarkCase,
  type ResumeImportBenchmarkCaseResult,
  type ResumeImportBenchmarkMetrics,
  type ResumeImportBenchmarkReport,
  type ResumeImportBenchmarkRequest,
  type ResumeImportErrorTaxonomy,
  type ResumeImportFieldCandidate,
  type JobFinderRepositoryState,
} from "@unemployed/contracts";
import { createInMemoryJobFinderRepository } from "@unemployed/db";

import { runResumeImportWorkflow } from "./internal/resume-import-workflow";
import type { WorkspaceServiceContext } from "./internal/workspace-service-context";
import type { JobFinderDocumentManager } from "./internal/workspace-service-contracts";

type ResumeImportBenchmarkHarness = {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  documentBundle: ResumeDocumentBundle;
  aiClient: JobFinderAiClient | null;
  parseMethod: string;
  workerManifestVersion: string | null;
};

export type ResumeImportBenchmarkHarnessFactory = (
  benchmarkCase: ResumeImportBenchmarkCase,
  request: ResumeImportBenchmarkRequest,
) => Promise<ResumeImportBenchmarkHarness>;

function safeDivide(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function normalizeLooseString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function toRecordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeRecordIdentity(
  value: Record<string, unknown> | null,
  keys: readonly string[],
): string | null {
  if (!value) {
    return null;
  }

  const parts = keys
    .map((key) => normalizeLooseString(value[key]))
    .filter((entry): entry is string => Boolean(entry));

  if (parts.length === 0) {
    return null;
  }

  return parts.join("|");
}

function normalizeRecordCollection(
  values: readonly Record<string, unknown>[],
  keys: readonly string[],
): Set<string> {
  const normalized = new Set<string>();

  for (const value of values) {
    const identity = normalizeRecordIdentity(value, keys);

    if (identity) {
      normalized.add(identity);
    }
  }

  return normalized;
}

function buildBenchmarkAiClient(
  useConfiguredAi: boolean,
): JobFinderAiClient {
  const providerLabel = useConfiguredAi
    ? "Configured benchmark provider"
    : "Deterministic benchmark provider";
  const providerKind = useConfiguredAi ? "openai_compatible" : "deterministic";

  return {
    getStatus() {
      return {
        kind: providerKind,
        ready: true,
        label: providerLabel,
        model: null,
        baseUrl: null,
        detail: "Resume import benchmark harness",
      };
    },
    extractProfileFromResume(input) {
      return Promise.resolve(buildDeterministicResumeProfileExtraction(
        input,
        providerKind,
        providerLabel,
      ));
    },
    extractResumeImportStage(input) {
      return Promise.resolve(
        buildDeterministicResumeImportStageExtraction(input, providerLabel),
      );
    },
    createResumeDraft() {
      return Promise.reject(
        new Error("Resume draft generation is not supported by the benchmark harness."),
      );
    },
    reviseResumeDraft() {
      return Promise.reject(
        new Error("Resume draft revision is not supported by the benchmark harness."),
      );
    },
    reviseCandidateProfile() {
      return Promise.reject(
        new Error("Profile copilot revision is not supported by the benchmark harness."),
      );
    },
    tailorResume() {
      return Promise.reject(
        new Error("Resume tailoring is not supported by the benchmark harness."),
      );
    },
    assessJobFit() {
      return Promise.resolve(null);
    },
    extractJobsFromPage() {
      return Promise.resolve([]);
    },
  } satisfies JobFinderAiClient;
}

export function buildBenchmarkRepositoryState(input: {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
}): JobFinderRepositoryState {
  return {
    profile: input.profile,
    searchPreferences: input.searchPreferences,
    profileSetupState: {
      status: "not_started" as const,
      currentStep: "import" as const,
      completedAt: null,
      reviewItems: [],
      lastResumedAt: null,
    },
    savedJobs: [],
    tailoredAssets: [],
    resumeDrafts: [],
    resumeDraftRevisions: [],
    resumeExportArtifacts: [],
    resumeResearchArtifacts: [],
    resumeValidationResults: [],
    resumeAssistantMessages: [],
    profileCopilotMessages: [],
    profileRevisions: [],
    applicationRecords: [],
    applicationAttempts: [],
    sourceDebugRuns: [],
    sourceDebugAttempts: [],
    sourceInstructionArtifacts: [],
    sourceDebugEvidenceRefs: [],
    resumeImportRuns: [],
    resumeImportDocumentBundles: [],
    resumeImportFieldCandidates: [],
    settings: {
      resumeFormat: "pdf" as const,
      resumeTemplateId: "classic_ats" as const,
      fontPreset: "inter_requisite" as const,
      appearanceTheme: "system" as const,
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: true,
      discoveryOnly: false,
    },
    discovery: {
      sessions: [],
      runState: "idle" as const,
      activeRun: null,
      recentRuns: [],
      activeSourceDebugRun: null,
      recentSourceDebugRuns: [],
      discoveryLedger: [],
      pendingDiscoveryJobs: [],
    },
  };
}

function buildTaxonomy(input: {
  benchmarkCase: ResumeImportBenchmarkCase;
  workflowCandidates: readonly ResumeImportFieldCandidate[];
  profile: CandidateProfile;
}): ResumeImportErrorTaxonomy[] {
  const taxonomy = new Set<ResumeImportErrorTaxonomy>();
  const expectedFields = input.benchmarkCase.expected.literalFields;
  const normalizedExpectedName = normalizeLooseString(expectedFields.fullName);
  const normalizedActualName = normalizeLooseString(input.profile.fullName);
  const normalizedExpectedLocation = normalizeLooseString(expectedFields.currentLocation);
  const normalizedActualLocation = normalizeLooseString(input.profile.currentLocation);

  if (normalizedExpectedName && normalizedActualName && normalizedExpectedName !== normalizedActualName) {
    taxonomy.add("FIELD_MISATTRIBUTION");
  }

  if (normalizedExpectedLocation && normalizedActualLocation && normalizedExpectedLocation !== normalizedActualLocation) {
    taxonomy.add("SECTION_BOUNDARY");
  }

  if (
    input.workflowCandidates.some(
      (candidate) =>
        candidate.resolution === "auto_applied" &&
        candidate.sourceBlockIds.length === 0 &&
        !normalizeString(candidate.evidenceText),
    )
  ) {
    taxonomy.add("MISSING_EVIDENCE");
  }

  if (
    input.workflowCandidates.some(
      (candidate) =>
        candidate.resolution === "auto_applied" &&
        candidate.target.key === "fullName" &&
        normalizedExpectedName !== null &&
        normalizeLooseString(candidate.value) !== normalizedExpectedName,
    )
  ) {
    taxonomy.add("OVERCONFIDENT_AUTO_APPLY");
  }

  const safeLiteralKeys = ["fullName", "currentLocation", "email", "phone"] as const;

  for (const key of safeLiteralKeys) {
    const expectedValue = normalizeLooseString(input.benchmarkCase.expected.literalFields[key]);

    if (!expectedValue) {
      continue;
    }

    const autoAppliedMatchingCandidate = input.workflowCandidates.find(
      (candidate) =>
        candidate.target.key === key &&
        candidate.resolution === "auto_applied" &&
        normalizeLooseString(candidate.value) === expectedValue,
    );

    const unresolvedMatchingCandidate = input.workflowCandidates.find(
      (candidate) =>
        candidate.target.key === key &&
        normalizeLooseString(candidate.value) === expectedValue &&
        (candidate.resolution === "needs_review" || candidate.resolution === "abstained"),
    );

    if (unresolvedMatchingCandidate && !autoAppliedMatchingCandidate) {
      taxonomy.add("UNRESOLVED_SHOULD_HAVE_RESOLVED");
      break;
    }
  }

  return [...taxonomy];
}

function scoreLiteralFields(input: {
  expected: Record<string, unknown>;
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
}): Pick<ResumeImportBenchmarkMetrics, "literalFieldPrecision" | "literalFieldRecall"> {
  const actualByKey: Record<string, unknown> = {
    fullName: input.profile.fullName,
    currentLocation: input.profile.currentLocation,
    email: input.profile.email,
    phone: input.profile.phone,
    linkedinUrl: input.profile.linkedinUrl,
    githubUrl: input.profile.githubUrl,
    portfolioUrl: input.profile.portfolioUrl,
    personalWebsiteUrl: input.profile.personalWebsiteUrl,
    salaryCurrency: input.searchPreferences.salaryCurrency,
  };

  const expectedEntries = Object.entries(input.expected);
  if (expectedEntries.length === 0) {
    return {
      literalFieldPrecision: 1,
      literalFieldRecall: 1,
    };
  }

  let matches = 0;
  let comparableActual = 0;

  for (const [key, expectedValue] of expectedEntries) {
    const expectedNormalized = normalizeLooseString(expectedValue);
    const actualNormalized = normalizeLooseString(actualByKey[key]);

    if (actualNormalized !== null) {
      comparableActual += 1;
    }

    if (expectedNormalized !== null && actualNormalized === expectedNormalized) {
      matches += 1;
    }
  }

  return {
    literalFieldPrecision: safeDivide(matches, comparableActual || expectedEntries.length),
    literalFieldRecall: safeDivide(matches, expectedEntries.length),
  };
}

function scoreRecordF1(input: {
  expected: readonly Record<string, unknown>[];
  actual: readonly ResumeImportFieldCandidate[];
  keys: readonly string[];
}): number {
  if (input.expected.length === 0 && input.actual.length === 0) {
    return 1;
  }

  const expectedSet = normalizeRecordCollection(input.expected, input.keys);
  const actualSet = normalizeRecordCollection(
    input.actual
      .map((candidate) => toRecordValue(candidate.value))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry)),
    input.keys,
  );

  if (expectedSet.size === 0 && actualSet.size === 0) {
    return 1;
  }

  let truePositives = 0;
  for (const actualValue of actualSet) {
    if (expectedSet.has(actualValue)) {
      truePositives += 1;
    }
  }

  const precision = safeDivide(truePositives, actualSet.size);
  const recall = safeDivide(truePositives, expectedSet.size);

  if (precision === 0 && recall === 0) {
    return 0;
  }

  return (2 * precision * recall) / (precision + recall);
}

function scoreEvidenceCoverage(candidates: readonly ResumeImportFieldCandidate[]): number {
  const autoApplied = candidates.filter((candidate) => candidate.resolution === "auto_applied");

  if (autoApplied.length === 0) {
    return 1;
  }

  const grounded = autoApplied.filter(
    (candidate) =>
      candidate.sourceBlockIds.length > 0 || Boolean(normalizeString(candidate.evidenceText)),
  );

  return safeDivide(grounded.length, autoApplied.length);
}

function scoreAutoApplyPrecision(input: {
  expected: Record<string, unknown>;
  candidates: readonly ResumeImportFieldCandidate[];
}): number {
  const autoApplied = input.candidates.filter(
    (candidate) => candidate.resolution === "auto_applied",
  );

  if (autoApplied.length === 0) {
    return 1;
  }

  let correct = 0;

  for (const candidate of autoApplied) {
    const expectedValue = input.expected[candidate.target.key];

    if (expectedValue === undefined) {
      correct += 1;
      continue;
    }

    if (normalizeLooseString(candidate.value) === normalizeLooseString(expectedValue)) {
      correct += 1;
    }
  }

  return safeDivide(correct, autoApplied.length);
}

function scoreUnresolvedRate(candidates: readonly ResumeImportFieldCandidate[]): number {
  if (candidates.length === 0) {
    return 0;
  }

  const unresolved = candidates.filter(
    (candidate) =>
      candidate.resolution === "needs_review" || candidate.resolution === "abstained",
  );

  return safeDivide(unresolved.length, candidates.length);
}

export function buildCaseResult(input: {
  benchmarkCase: ResumeImportBenchmarkCase;
  parserStrategy: string;
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  candidates: readonly ResumeImportFieldCandidate[];
}): ResumeImportBenchmarkCaseResult {
  const literalScores = scoreLiteralFields({
    expected: input.benchmarkCase.expected.literalFields,
    profile: input.profile,
    searchPreferences: input.searchPreferences,
  });
  const experienceCandidates = input.candidates.filter(
    (candidate) => candidate.target.section === "experience",
  );
  const educationCandidates = input.candidates.filter(
    (candidate) => candidate.target.section === "education",
  );
  const metrics: ResumeImportBenchmarkMetrics = {
    literalFieldPrecision: literalScores.literalFieldPrecision,
    literalFieldRecall: literalScores.literalFieldRecall,
    experienceRecordF1: scoreRecordF1({
      expected: input.benchmarkCase.expected.experienceRecords,
      actual: experienceCandidates,
      keys: ["title", "companyName"],
    }),
    educationRecordF1: scoreRecordF1({
      expected: input.benchmarkCase.expected.educationRecords,
      actual: educationCandidates,
      keys: ["schoolName", "degree"],
    }),
    evidenceCoverage: scoreEvidenceCoverage(input.candidates),
    autoApplyPrecision: scoreAutoApplyPrecision({
      expected: input.benchmarkCase.expected.literalFields,
      candidates: input.candidates,
    }),
    unresolvedRate: scoreUnresolvedRate(input.candidates),
  };
  const taxonomy = buildTaxonomy({
    benchmarkCase: input.benchmarkCase,
    workflowCandidates: input.candidates,
    profile: input.profile,
  });

  const passed =
    metrics.literalFieldRecall >= 0.75 &&
    metrics.experienceRecordF1 >= 0.5 &&
    metrics.educationRecordF1 >= 0.5 &&
    metrics.autoApplyPrecision >= 0.9 &&
    !taxonomy.includes("MISSING_EVIDENCE") &&
    !taxonomy.includes("OVERCONFIDENT_AUTO_APPLY") &&
    !taxonomy.includes("UNRESOLVED_SHOULD_HAVE_RESOLVED");

  return {
    caseId: input.benchmarkCase.id,
    label: input.benchmarkCase.label,
    parserStrategy: input.parserStrategy,
    passed,
    metrics,
    taxonomy,
    notes: [],
  };
}

export function aggregateBenchmarkMetrics(
  results: readonly ResumeImportBenchmarkCaseResult[],
): ResumeImportBenchmarkMetrics {
  return {
    literalFieldPrecision: average(results.map((result) => result.metrics.literalFieldPrecision)),
    literalFieldRecall: average(results.map((result) => result.metrics.literalFieldRecall)),
    experienceRecordF1: average(results.map((result) => result.metrics.experienceRecordF1)),
    educationRecordF1: average(results.map((result) => result.metrics.educationRecordF1)),
    evidenceCoverage: average(results.map((result) => result.metrics.evidenceCoverage)),
    autoApplyPrecision: average(results.map((result) => result.metrics.autoApplyPrecision)),
    unresolvedRate: average(results.map((result) => result.metrics.unresolvedRate)),
  };
}

function createBenchmarkContext(input: {
  aiClient: JobFinderAiClient;
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
}): WorkspaceServiceContext {
  const repository = createInMemoryJobFinderRepository(
    buildBenchmarkRepositoryState({
      profile: input.profile,
      searchPreferences: input.searchPreferences,
    }),
  );
  const browserRuntime = createCatalogBrowserSessionRuntime({
    sessions: [],
    catalog: [],
  });
  const documentManager = {
    listResumeTemplates: () => [],
    renderResumeArtifact() {
      return Promise.reject(
        new Error("Resume rendering is not available in the benchmark harness."),
      );
    },
  } satisfies JobFinderDocumentManager;

  return {
    aiClient: input.aiClient,
    browserRuntime,
    documentManager,
    repository,
    activeSourceDebugExecutionIdRef: { current: null },
    activeSourceDebugAbortControllerRef: { current: null },
    getWorkspaceSnapshot: () =>
      Promise.reject(
        new Error("Workspace snapshots are not available in the benchmark harness."),
      ),
    runSourceDebugWorkflow: () =>
      Promise.reject(
        new Error("Source debug is not available in the benchmark harness."),
      ),
    persistDiscoveryState: async (updater) => {
      const current = await repository.getDiscoveryState();
      const next = updater(current);
      await repository.saveDiscoveryState(next);
      return next;
    },
    persistSavedJobsAndDiscoveryState: async ({ savedJobs, discoveryState }) => {
      await repository.replaceSavedJobsAndDiscoveryState({
        savedJobs,
        discoveryState,
      });
    },
    refreshDiscoverySessions: () => Promise.resolve([]),
    saveDiscoveryTargetUpdate: async () => {
      return repository.getSearchPreferences();
    },
    persistSourceDebugRun: () => Promise.resolve(undefined),
    persistBrowserSessionState: () => Promise.resolve(undefined),
    staleApprovedResumeDrafts: () => Promise.resolve(undefined),
    openRunBrowserSession: () => Promise.resolve(undefined),
    closeRunBrowserSession: () => Promise.resolve(undefined),
    updateJob: () => Promise.resolve(undefined),
  };
}

export async function runResumeImportBenchmark(input: {
  request: ResumeImportBenchmarkRequest;
  createHarness: ResumeImportBenchmarkHarnessFactory;
}): Promise<ResumeImportBenchmarkReport> {
  const request = ResumeImportBenchmarkRequestSchema.parse(input.request);
  const benchmarkCases = request.canaryOnly
    ? request.cases.filter((benchmarkCase) => benchmarkCase.canary)
    : request.cases;
  const results: ResumeImportBenchmarkCaseResult[] = [];
  const manifestVersions = new Set<string>();
  const providerKinds = new Set<string>();
  const providerLabels = new Set<string>();

  for (const benchmarkCase of benchmarkCases) {
    const harness = await input.createHarness(benchmarkCase, request);
    const aiClient = harness.aiClient ?? buildBenchmarkAiClient(
      request.useConfiguredAi,
    );
    const ctx = createBenchmarkContext({
      aiClient,
      profile: harness.profile,
      searchPreferences: harness.searchPreferences,
    });
    const workflowResult = await runResumeImportWorkflow(ctx, {
      profile: harness.profile,
      searchPreferences: harness.searchPreferences,
      documentBundle: harness.documentBundle,
      trigger: "import",
      importWarnings: harness.documentBundle.warnings,
    });
    const providerStatus = aiClient.getStatus();

    if (harness.workerManifestVersion) {
      manifestVersions.add(harness.workerManifestVersion);
    }

    providerKinds.add(providerStatus.kind);
    providerLabels.add(providerStatus.label);

    results.push(
      buildCaseResult({
        benchmarkCase,
        parserStrategy: harness.parseMethod,
        profile: workflowResult.profile,
        searchPreferences: workflowResult.searchPreferences,
        candidates: workflowResult.candidates,
      }),
    );
  }

  const parserManifestVersions = [...manifestVersions].sort();
  const parserManifestVersion =
    parserManifestVersions.length === 0
      ? null
      : parserManifestVersions.length === 1
        ? parserManifestVersions[0] ?? null
        : `mixed:${parserManifestVersions.join(",")}`;

  return ResumeImportBenchmarkReportSchema.parse({
    benchmarkVersion: request.benchmarkVersion,
    generatedAt: new Date().toISOString(),
    parserManifestVersion,
    parserManifestVersions,
    analysisProviderKind:
      providerKinds.size === 1 ? ([...providerKinds][0] as ResumeImportBenchmarkReport["analysisProviderKind"]) : null,
    analysisProviderLabel:
      providerLabels.size === 1 ? [...providerLabels][0] ?? null : null,
    cases: results,
    aggregate: aggregateBenchmarkMetrics(results),
    notes: [],
  });
}

export { buildBenchmarkAiClient };
