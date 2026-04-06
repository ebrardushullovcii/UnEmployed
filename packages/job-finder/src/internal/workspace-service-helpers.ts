import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  SourceDebugPhaseSummarySchema,
  SourceInstructionArtifactSchema,
  type JobFinderDiscoveryState,
  type JobDiscoveryTarget,
  type JobSource,
  type SavedJob,
  type SourceDebugPhase,
  type SourceDebugPhaseCompletionMode,
  type SourceDebugPhaseEvidence,
  type SourceDebugPhaseSummary,
  type SourceDebugRunRecord,
  type SourceDebugWorkerAttempt,
  type SourceInstructionArtifact,
} from "@unemployed/contracts";
import {
  collectAttemptInstructionGuidance,
  evaluateSourceInstructionQuality,
  filterSourceDebugWarnings,
  filterSourceInstructionLines,
  formatStatusLabel,
  isExplicitSearchProbeDisproof,
  isPositiveReusableSearchSignal,
  isVisibilityOnlySearchSignal,
  reconcileApplyGuidance,
  reconcileFinalSourceInstructionGuidance,
  reconcileMixedAccessGuidance,
  reconcileVisibleControlEvidence,
  type SourceInstructionReviewOverride,
  splitCustomDiscoveryInstructions,
} from "./source-instructions";
import { normalizeText, uniqueStrings } from "./shared";
import type { ResolvedDiscoveryAdapter } from "./workspace-defaults";
import {
  buildInstructionGuidance,
  buildSourceInstructionVersionInfo,
} from "./workspace-helpers";

function canonicalizeSourceDebugRouteHint(
  candidateUrl: URL,
): string {
  const normalized = new URL(candidateUrl.toString());

  normalized.searchParams.delete("currentJobId");
  normalized.searchParams.delete("selectedJobId");

  normalized.hash = "";
  return normalized.toString();
}

function shouldReadRouteHintSection(
  line: string,
  phase: SourceDebugPhase,
): boolean {
  const trimmedLine = line.trim();

  if (trimmedLine.startsWith("[Navigation]")) {
    return true;
  }

  return trimmedLine.startsWith("[Search]") &&
    phase !== "site_structure_mapping" &&
    !phase.includes("auth");
}

export function mergeSessionStates(
    currentSessions: ReadonlyArray<JobFinderDiscoveryState["sessions"][number]>,
    nextSession: JobFinderDiscoveryState["sessions"][number],
  ): JobFinderDiscoveryState["sessions"] {
    const nextByKind = new Map(
      currentSessions.map((session) => [session.adapterKind, session]),
    );
    nextByKind.set(nextSession.adapterKind, nextSession);
    return [...nextByKind.values()];
  }

export function mergePendingJobs(
    currentJobs: readonly SavedJob[],
    nextJobs: readonly SavedJob[],
  ): SavedJob[] {
    const nextById = new Map(currentJobs.map((job) => [job.id, job]));
    for (const job of nextJobs) {
      nextById.set(job.id, job);
    }
    return [...nextById.values()].sort(
      (left, right) => right.matchAssessment.score - left.matchAssessment.score,
    );
  }

export function mergeSavedJobs(
    currentJobs: readonly SavedJob[],
    nextJobs: readonly SavedJob[],
  ): SavedJob[] {
    const nextById = new Map(currentJobs.map((job) => [job.id, job]));
    for (const job of nextJobs) {
      nextById.set(job.id, job);
    }
    return [...nextById.values()];
  }

export function overlayTouchedSavedJobs(
    currentJobs: readonly SavedJob[],
    nextJobs: readonly SavedJob[],
    touchedIds: ReadonlySet<string>,
  ): SavedJob[] {
    return mergeSavedJobs(
      currentJobs.filter((job) => !touchedIds.has(job.id)),
      nextJobs.filter((job) => touchedIds.has(job.id)),
    );
  }

export function overlayTouchedPendingJobs(
    currentJobs: readonly SavedJob[],
    nextJobs: readonly SavedJob[],
    touchedIds: ReadonlySet<string>,
  ): SavedJob[] {
    return mergePendingJobs(
      currentJobs.filter((job) => !touchedIds.has(job.id)),
      nextJobs.filter((job) => touchedIds.has(job.id)),
    );
  }

export function createBrowserSessionSnapshot(
    sessions: ReadonlyArray<JobFinderDiscoveryState["sessions"][number]>,
    preferredAdapter: JobSource,
  ) {
    const preferredSession =
      sessions.find((session) => session.adapterKind === preferredAdapter) ??
      sessions[0];

    if (preferredSession) {
      return {
        source: preferredSession.adapterKind,
        status: preferredSession.status,
        driver: preferredSession.driver,
        label: preferredSession.label,
        detail: preferredSession.detail,
        lastCheckedAt: preferredSession.lastCheckedAt,
      };
    }

    return {
      source: preferredAdapter,
      status: "unknown" as const,
      driver: "catalog_seed" as const,
      label: "Session status unavailable",
      detail: "No discovery adapter session has been initialized yet.",
      lastCheckedAt: new Date(0).toISOString(),
    };
}

export function buildSourceDebugPhasePacket(
    phase: SourceDebugPhase,
    phaseSummaries: readonly SourceDebugPhaseSummary[],
    strategyFingerprintHistory: readonly string[],
    manualPrerequisiteState: string | null,
  ) {
    const priorPhaseSummary =
      phaseSummaries[phaseSummaries.length - 1]?.summary ?? null;
    const knownFacts = uniqueStrings(
      phaseSummaries.flatMap((summary) => summary.confirmedFacts),
    );
    const phaseGoalByPhase: Record<SourceDebugPhase, string> = {
      access_auth_probe:
        "Verify whether the site is reachable, bounded to the hostname, and blocked by auth or consent.",
      site_structure_mapping:
        "Map the jobs landing path, result list route, and likely job detail path.",
      search_filter_probe:
        "Find search controls or filters that change the result set in a reliable way.",
      job_detail_validation:
        "Open multiple job details and confirm stable identity and canonical URLs.",
      apply_path_validation:
        "Check whether discovered jobs expose a stable apply path and capture safe apply guidance without submitting.",
      replay_verification:
        "Replay the learned guidance from scratch and prove it still reaches jobs and details.",
    };
    const successCriteriaByPhase: Record<SourceDebugPhase, string[]> = {
      access_auth_probe: [
        "Reach the target site safely",
        "Detect login or manual blockers honestly",
      ],
      site_structure_mapping: [
        "Find the best repeatable jobs/result path",
        "Identify a plausible detail path",
        "Check whether recommendation rows, curated collections, or show-all links lead to reusable job lists",
      ],
      search_filter_probe: [
        "Probe the obvious visible search box plus the first visible filters on the homepage and jobs/results route when those surfaces exist",
        "Prove at least one search, filter, recommendation route, pagination pattern, or result-expansion control changes the result set, or record that none could be confirmed",
        "Record stable search/filter behavior and any misleading or decorative controls",
      ],
      job_detail_validation: [
        "Open multiple job details",
        "Confirm stable job identity or URL patterns",
      ],
      apply_path_validation: [
        "Identify the apply path exposed by the source",
        "Record safe apply-entry guidance without submitting",
      ],
      replay_verification: [
        "Reach jobs again from scratch",
        "Open details and recover stable identity again",
      ],
    };
    const phaseStopConditionsByPhase: Partial<
      Record<SourceDebugPhase, string[]>
    > = {
      search_filter_probe: [
        "Do not stop before checking the obvious visible search controls and top-level filters unless auth or site protection blocks progress.",
        "If recommendation chips, curated collections, or show-all links are visible, check whether at least one leads to a reusable preselected list before stopping.",
      ],
    };

    return {
      phaseGoal: phaseGoalByPhase[phase],
      knownFacts,
      priorPhaseSummary,
      avoidStrategyFingerprints: [...strategyFingerprintHistory],
      successCriteria: successCriteriaByPhase[phase],
      stopConditions: [
        "Stop when progress stalls and no new evidence is produced.",
        "Stop immediately if auth or a manual prerequisite blocks safe progress.",
        ...(phaseStopConditionsByPhase[phase] ?? []),
      ],
      manualPrerequisiteState,
      strategyLabel: formatStatusLabel(phase),
    };
  }

export function composeSourceDebugInstructions(
    target: JobDiscoveryTarget,
    adapter: ResolvedDiscoveryAdapter,
    phase: SourceDebugPhase,
    instructionArtifact: SourceInstructionArtifact | null,
    phasePacket: ReturnType<typeof buildSourceDebugPhasePacket>,
  ): string[] {
    const phaseInstructionsByPhase: Record<SourceDebugPhase, string[]> = {
      access_auth_probe: [
        "Determine whether the site can be accessed normally or whether login, consent, or a manual prerequisite blocks progress.",
        "Do not guess credentials or attempt to bypass protected flows.",
      ],
      site_structure_mapping: [
        "Favor finding the main jobs landing page, results list, and detail path over collecting a large set of postings.",
        "If the starting page already lists jobs directly, treat that landing page as a valid jobs surface before assuming a separate jobs route is required.",
        "If the starting page is more general than a jobs page, first look for visible jobs, careers, openings, vacancies, or show-all entry paths.",
        "Inspect the first visible landing surface for top-of-page controls before using extracted jobs as proof of the best route.",
        "Record stable route patterns and navigation anchors.",
        "On jobs hubs that open on recommendation modules first, follow a reusable Show all or collection route before deciding the landing page is the best entry path.",
        "If the homepage or jobs route exposes recommendation rows, curated collections, or show-all links, check whether they lead to a reusable list path and record the best one.",
        "Before finishing, capture the best repeatable entry path to the jobs list, especially if it is not the homepage.",
      ],
      search_filter_probe: [
        "Prefer actions that change the result set in observable ways.",
        "Inspect the visible controls on the current landing surface before using extracted jobs as evidence that no search/filter UI exists.",
        "If the visible search or filter controls are likely above the current scroll position, return to the top of the page and probe them before concluding they are missing.",
        "Explicitly test the obvious search box and the first visible location, industry, category, or work-mode filters when they are present.",
        "On jobs landing pages that start with recommendation cards, follow Show all or a reusable collection first if that reveals the fuller search/filter surface.",
        "Prefer visible search boxes, buttons, chips, dropdowns, and filter bars over inventing URL parameter recipes. Only keep a direct URL pattern if the visible UI is blocked or genuinely less reliable.",
        "If the jobs page exposes recommendation chips, curated collections, or show-all links, test whether they open reusable preselected result lists.",
        "Record which search inputs, recommendation routes, filters, pagination controls, or infinite-scroll behaviors appear reliable.",
        "If a filter is hidden, locale-specific, resets unexpectedly, or appears not to affect results, record that as a site-specific gotcha.",
        "If a visible control looks promising but does not change jobs, say that explicitly instead of omitting it.",
        "Before finishing, either prove one reliable search/filter control or state clearly that no reliable control could be confirmed after trying alternatives.",
      ],
      job_detail_validation: [
        "Open multiple job detail pages and confirm stable identity hints before trusting extraction.",
        "Prefer canonical URLs over transient result-card state.",
        "Record whether job cards open inline, in-place, in a new page, or require a second click to reach the canonical detail view.",
      ],
      apply_path_validation: [
        "Focus on whether the source exposes an inline apply button, external apply link, or no usable apply path.",
        "Do not submit an application; only capture safe apply-entry guidance and blockers.",
        "If apply requires a specific button, modal, or redirect pattern, record that exact entry behavior.",
      ],
      replay_verification: [
        "Start fresh from the beginning and follow the learned guidance rather than exploratory behavior.",
        "Only treat the instructions as validated if they work again.",
      ],
    };

    return uniqueStrings([
      ...adapter.siteInstructions,
      ...buildInstructionGuidance(instructionArtifact),
      ...phaseInstructionsByPhase[phase],
      ...splitCustomDiscoveryInstructions(target.customInstructions),
      ...phasePacket.knownFacts.map((fact) => `Known fact: ${fact}`),
    ]);
  }

export function deriveSourceDebugStartingUrls(
    target: JobDiscoveryTarget,
    instructionArtifact: SourceInstructionArtifact | null,
    phase: SourceDebugPhase,
  ): string[] {
    if (phase === "access_auth_probe") {
      return [target.startingUrl];
    }

    const targetUrl = new URL(target.startingUrl);
    const routeHints = buildInstructionGuidance(instructionArtifact);
    const collectionUrls: string[] = [];
    const searchUrls: string[] = [];
    const landingUrls: string[] = [];
    const otherUrls: string[] = [];
    for (const line of routeHints) {
      if (!shouldReadRouteHintSection(line, phase)) {
        continue;
      }

      const normalizedLine = normalizeText(line);
      const absoluteUrlMatches = line.match(/https?:\/\/[^\s)\]>",]+/gi) ?? [];
      // Matches same-host relative route hints like /jobs/search or /careers/open-roles?team=product,
      // capturing the path in group 1 while allowing leading whitespace or an opening parenthesis.
      const relativePathMatches =
        line.match(/(?:^|[\s(])((?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)+(?:\/)?(?:\?[^\s)\]>",]+)?)/g) ?? [];

      const candidateInputs = uniqueStrings([
        ...absoluteUrlMatches,
        ...relativePathMatches.map((match) => {
          const trimmedMatch = match.trim();
          return trimmedMatch.startsWith("/")
            ? trimmedMatch
            : trimmedMatch.slice(trimmedMatch.indexOf("/"));
        }),
      ])
        .map((value) => value.replace(/[.,;:!?]+$/g, ""))
        .filter(
          (value) =>
            !value.includes("*") &&
            !value.includes("{") &&
            !value.includes("}") &&
            !value.includes("...") &&
            !/\/:[A-Za-z0-9_-]+/.test(value) &&
            !/[?&][^=]+=:[A-Za-z0-9_-]+/.test(value),
        );
      const parsedCandidates = candidateInputs.flatMap((value) => {
        try {
          const candidateUrl = new URL(value, targetUrl);

          if (candidateUrl.hostname !== targetUrl.hostname) {
            return [];
          }

          return [candidateUrl];
        } catch {
          return [];
        }
      });
      const hasSingleCandidate = parsedCandidates.length === 1;
      const lineHasCollectionSignal =
        normalizedLine.includes("collection") ||
        normalizedLine.includes("recommended") ||
        normalizedLine.includes("recommendation") ||
        normalizedLine.includes("show all");
      const lineHasSearchSignal =
        normalizedLine.includes("search") ||
        normalizedLine.includes("results") ||
        normalizedLine.includes("filter") ||
        normalizedLine.includes("keyword") ||
        normalizedLine.includes("location");
      const lineHasLandingSignal =
        normalizedLine.includes("homepage") ||
        normalizedLine.includes("jobs page") ||
        normalizedLine.includes("jobs route") ||
        normalizedLine.includes("jobs hub") ||
        normalizedLine.includes("job list") ||
        normalizedLine.includes("careers");
      const lineHasSearchDisproof =
        isExplicitSearchProbeDisproof(line) ||
        normalizedLine.includes("no visible search filter controls") ||
        normalizedLine.includes("has no visible search filter controls") ||
        normalizedLine.includes("no visible search filter ui") ||
        normalizedLine.includes("no search filter ui");

      for (const candidateUrl of parsedCandidates) {
        const candidate = canonicalizeSourceDebugRouteHint(candidateUrl);
        const normalizedCandidateUrl = new URL(candidate);
        const normalizedPath = normalizeText(
          `${normalizedCandidateUrl.pathname} ${normalizedCandidateUrl.search}`,
        );
        const candidateLooksCollection =
          normalizedPath.includes("collection") ||
          normalizedPath.includes("recommended");
        const candidateLooksSearch =
          normalizedPath.includes("search") ||
          normalizedPath.includes("results");
        const candidateLooksLanding =
          normalizedPath.includes("jobs") || normalizedPath.includes("careers");

        if (candidateLooksCollection || (hasSingleCandidate && lineHasCollectionSignal)) {
          collectionUrls.push(candidate);
          continue;
        }

        if (
          !lineHasSearchDisproof &&
          (candidateLooksSearch || (hasSingleCandidate && lineHasSearchSignal))
        ) {
          searchUrls.push(candidate);
          continue;
        }

        if (candidateLooksLanding || (hasSingleCandidate && lineHasLandingSignal)) {
          landingUrls.push(candidate);
          continue;
        }

        otherUrls.push(candidate);
      }
    }

    const preferredUrls =
      phase === "search_filter_probe"
        ? searchUrls.length > 0
          ? [
              ...searchUrls,
              ...landingUrls,
              target.startingUrl,
              ...collectionUrls,
              ...otherUrls,
            ]
          : collectionUrls.length > 0
            ? [
                ...collectionUrls,
                ...landingUrls,
                target.startingUrl,
                ...otherUrls,
              ]
            : [...landingUrls, target.startingUrl, ...otherUrls]
        : [
            ...collectionUrls,
            ...searchUrls,
            ...landingUrls,
            target.startingUrl,
            ...otherUrls,
          ];

    return uniqueStrings(preferredUrls);
  }

export function classifySourceDebugAttemptOutcome(
    result: Awaited<
      ReturnType<NonNullable<BrowserSessionRuntime["runAgentDiscovery"]>>
    >,
    phase: SourceDebugPhase,
  ): SourceDebugWorkerAttempt["outcome"] {
    const warning = (result.warning ?? "").toLowerCase();

    if (warning.includes("login") || warning.includes("session is not ready")) {
      return "blocked_auth";
    }

    if (warning.includes("manual") || warning.includes("consent")) {
      return "blocked_manual_step";
    }

    if (
      warning.includes("unsupported") ||
      warning.includes("stable identity") ||
      warning.includes("low-confidence")
    ) {
      return "unsupported_layout";
    }

    if (
      phase === "apply_path_validation" &&
      result.jobs.every((job) => job.applyPath === "unknown")
    ) {
      return warning ? "partial" : "exhausted_no_progress";
    }

    if (result.jobs.length === 0) {
      return phase === "replay_verification"
        ? "exhausted_no_progress"
        : "partial";
    }

    if (warning) {
      return "partial";
    }

    return "succeeded";
  }

export function resolveSourceDebugCompletion(
    result: Awaited<
      ReturnType<NonNullable<BrowserSessionRuntime["runAgentDiscovery"]>>
    >,
  ): {
    completionMode: SourceDebugPhaseCompletionMode;
    completionReason: string | null;
    phaseEvidence: SourceDebugPhaseEvidence | null;
  } {
    const warning = result.warning ?? null;
    const metadata = result.agentMetadata;

    if (metadata?.phaseCompletionMode) {
      return {
        completionMode: metadata.phaseCompletionMode,
        completionReason: metadata.phaseCompletionReason ?? warning,
        phaseEvidence: metadata.phaseEvidence ?? null,
      };
    }

    const normalizedWarning = normalizeText(warning ?? "");

    if (
      normalizedWarning.includes("login") ||
      normalizedWarning.includes("session is not ready")
    ) {
      return {
        completionMode: "blocked_auth",
        completionReason: warning,
        phaseEvidence: metadata?.phaseEvidence ?? null,
      };
    }

    if (
      normalizedWarning.includes("manual") ||
      normalizedWarning.includes("consent")
    ) {
      return {
        completionMode: "blocked_manual_step",
        completionReason: warning,
        phaseEvidence: metadata?.phaseEvidence ?? null,
      };
    }

    if (normalizedWarning.includes("interrupted")) {
      return {
        completionMode: "interrupted",
        completionReason: warning,
        phaseEvidence: metadata?.phaseEvidence ?? null,
      };
    }

    if (warning) {
      return {
        completionMode:
          result.jobs.length > 0
            ? "timed_out_with_partial_evidence"
            : "runtime_failed",
        completionReason: warning,
        phaseEvidence: metadata?.phaseEvidence ?? null,
      };
    }

    return {
      completionMode: "structured_finish",
      completionReason: null,
      phaseEvidence: metadata?.phaseEvidence ?? null,
    };
  }

export function buildSourceDebugPhaseSummary(
    attempt: SourceDebugWorkerAttempt,
  ): SourceDebugPhaseSummary {
    return SourceDebugPhaseSummarySchema.parse({
      phase: attempt.phase,
      summary: attempt.resultSummary,
      completionMode: attempt.completionMode,
      completionReason: attempt.completionReason,
      confirmedFacts: attempt.confirmedFacts,
      blockerNotes: attempt.blockerSummary ? [attempt.blockerSummary] : [],
      nextRecommendedStrategies: attempt.nextRecommendedStrategies,
      avoidStrategyFingerprints: attempt.avoidStrategyFingerprints,
      producedAttemptIds: [attempt.id],
      timing: attempt.timing,
    });
  }

export function getSourceDebugTargetJobCount(phase: SourceDebugPhase): number {
    switch (phase) {
      case "access_auth_probe":
        return 1;
      case "site_structure_mapping":
      case "search_filter_probe":
        return 2;
      case "job_detail_validation":
      case "apply_path_validation":
      case "replay_verification":
        return 2;
      default:
        return 1;
    }
  }

export function getSourceDebugMaxSteps(phase: SourceDebugPhase): number {
    switch (phase) {
      case "access_auth_probe":
        return 16;
      case "site_structure_mapping":
        return 18;
      case "search_filter_probe":
        return 22;
      case "job_detail_validation":
      case "apply_path_validation":
      case "replay_verification":
        return 18;
      default:
        return 18;
    }
  }

export function synthesizeSourceInstructionArtifact(
    target: JobDiscoveryTarget,
    run: SourceDebugRunRecord,
    attempts: readonly SourceDebugWorkerAttempt[],
    adapterKind: JobSource,
    verification: SourceInstructionArtifact["verification"],
    reviewOverride?: SourceInstructionReviewOverride | null,
  ): SourceInstructionArtifact {
    const byPhase = new Map(
      attempts.map((attempt) => [attempt.phase, attempt]),
    );
    const accessAttempt = byPhase.get("access_auth_probe");
    const structureAttempt = byPhase.get("site_structure_mapping");
    const searchAttempt = byPhase.get("search_filter_probe");
    const detailAttempt = byPhase.get("job_detail_validation");
    const applyAttempt = byPhase.get("apply_path_validation");
    const hasPartialTimeoutEvidence = attempts.some(
      (attempt) => attempt.completionMode === "timed_out_with_partial_evidence",
    );
    const hasUnstructuredFailure = attempts.some(
      (attempt) =>
        attempt.completionMode === "timed_out_without_evidence" ||
        attempt.completionMode === "runtime_failed" ||
        attempt.completionMode === "interrupted",
    );
    const draftWarnings = filterSourceDebugWarnings(
      attempts.flatMap((attempt) => [attempt.blockerSummary]),
    );
    const usedGuidance = new Set<string>();
    const takeUniqueGuidance = (lines: readonly string[]) =>
      lines.filter((line) => {
        const key = normalizeText(line);

        if (usedGuidance.has(key)) {
          return false;
        }

        usedGuidance.add(key);
        return true;
      });
    const rawNavigationGuidance = takeUniqueGuidance(
      uniqueStrings([
        ...collectAttemptInstructionGuidance(accessAttempt),
        ...collectAttemptInstructionGuidance(structureAttempt),
      ]),
    );
    const rawSearchGuidance = takeUniqueGuidance(
      uniqueStrings([...collectAttemptInstructionGuidance(searchAttempt)]),
    );
    const rawDetailGuidance = takeUniqueGuidance(
      uniqueStrings([...collectAttemptInstructionGuidance(detailAttempt)]),
    );
    const rawApplyGuidance = takeUniqueGuidance(
      reconcileApplyGuidance(
        uniqueStrings([...collectAttemptInstructionGuidance(applyAttempt)]),
      ),
    );
    const visibleControlReconciledGuidance = reconcileVisibleControlEvidence({
      attempts,
      navigationGuidance: rawNavigationGuidance,
      searchGuidance: rawSearchGuidance,
      detailGuidance: rawDetailGuidance,
      applyGuidance: rawApplyGuidance,
    });
    const reconciledGuidance = reconcileMixedAccessGuidance({
      navigationGuidance: visibleControlReconciledGuidance.navigationGuidance,
      searchGuidance: visibleControlReconciledGuidance.searchGuidance,
      detailGuidance: visibleControlReconciledGuidance.detailGuidance,
      applyGuidance: visibleControlReconciledGuidance.applyGuidance,
    });
    const finalReconciledGuidance = reconcileFinalSourceInstructionGuidance({
      navigationGuidance: reconciledGuidance.navigationGuidance,
      searchGuidance: reconciledGuidance.searchGuidance,
      detailGuidance: reconciledGuidance.detailGuidance,
      applyGuidance: reconciledGuidance.applyGuidance,
    });
    const reviewedGuidance = reconcileFinalSourceInstructionGuidance({
      navigationGuidance:
        reviewOverride && reviewOverride.navigationGuidance !== null
          ? filterSourceInstructionLines(reviewOverride.navigationGuidance)
          : finalReconciledGuidance.navigationGuidance,
      searchGuidance:
        reviewOverride && reviewOverride.searchGuidance !== null
          ? filterSourceInstructionLines(reviewOverride.searchGuidance)
          : finalReconciledGuidance.searchGuidance,
      detailGuidance:
        reviewOverride && reviewOverride.detailGuidance !== null
          ? filterSourceInstructionLines(reviewOverride.detailGuidance)
          : finalReconciledGuidance.detailGuidance,
      applyGuidance:
        reviewOverride && reviewOverride.applyGuidance !== null
          ? filterSourceInstructionLines(reviewOverride.applyGuidance)
          : finalReconciledGuidance.applyGuidance,
    });
    const navigationGuidance = reviewedGuidance.navigationGuidance;
    const searchGuidance = reviewedGuidance.searchGuidance;
    const detailGuidance = reviewedGuidance.detailGuidance;
    const applyGuidance = reviewedGuidance.applyGuidance;
    const hasPositiveReusableSearchGuidance = searchGuidance.some(
      isPositiveReusableSearchSignal,
    );
    const hasExplicitSearchDisproof = searchGuidance.some(
      isExplicitSearchProbeDisproof,
    );
    const hasVisibilityOnlySearchSignals = searchGuidance.some(
      isVisibilityOnlySearchSignal,
    );
    const hasConclusiveSearchDisproof =
      hasExplicitSearchDisproof && !hasVisibilityOnlySearchSignals;
    const hasSearchGuidanceWithoutPositiveProof =
      searchGuidance.length > 0 &&
      !hasPositiveReusableSearchGuidance &&
      !hasConclusiveSearchDisproof;
    const hasOnlyVisibilitySearchGuidance =
      searchGuidance.length > 0 &&
      !hasPositiveReusableSearchGuidance &&
      !hasConclusiveSearchDisproof &&
      searchGuidance.every(
        (line) =>
          isVisibilityOnlySearchSignal(line) ||
          isExplicitSearchProbeDisproof(line),
      );
    const quality = evaluateSourceInstructionQuality({
      navigationGuidance,
      searchGuidance,
      detailGuidance,
      applyGuidance,
    });
    const warnings = uniqueStrings([
      ...filterSourceDebugWarnings(reviewOverride?.warnings ?? []),
      ...draftWarnings,
      ...(hasPartialTimeoutEvidence
        ? [
            "A source-debug phase timed out before structured conclusion; keep this source in draft until a rerun confirms the partial evidence with an explicit finish.",
          ]
        : []),
      ...(hasUnstructuredFailure
        ? [
            "A source-debug phase ended without structured evidence; keep this source in draft until the failing phase is rerun successfully.",
          ]
        : []),
      ...(hasSearchGuidanceWithoutPositiveProof
        ? [
            "Search and filter behavior is still unproven; this run mentioned controls or routes but did not confirm a positive reusable search/filter action.",
          ]
        : []),
      ...(hasOnlyVisibilitySearchGuidance
        ? [
            "Search and filter behavior is still unproven; visible controls were seen but no reusable result-changing control was confirmed in this run.",
          ]
        : []),
      ...reconciledGuidance.warnings,
      ...quality.qualityWarnings,
    ]);
    const hasPromotionBlocker =
      hasPartialTimeoutEvidence ||
      hasUnstructuredFailure ||
      hasSearchGuidanceWithoutPositiveProof ||
      hasOnlyVisibilitySearchGuidance;
    const status =
      verification?.outcome === "passed" &&
      quality.qualifiesForValidation &&
      !hasPromotionBlocker
        ? "validated"
        : warnings.some((warning) =>
              warning.toLowerCase().includes("unsupported"),
            )
          ? "unsupported"
          : "draft";

    return SourceInstructionArtifactSchema.parse({
      id:
        run.instructionArtifactId ??
        `source_instruction_${target.id}_${Date.now()}`,
      targetId: target.id,
      status,
      createdAt: attempts[0]?.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedAt: status === "validated" ? new Date().toISOString() : null,
      basedOnRunId: run.id,
      basedOnAttemptIds: attempts.map((attempt) => attempt.id),
      notes: run.finalSummary ?? null,
      navigationGuidance,
      searchGuidance,
      detailGuidance,
      applyGuidance,
      warnings,
      versionInfo: buildSourceInstructionVersionInfo(adapterKind),
      verification,
    });
  }
