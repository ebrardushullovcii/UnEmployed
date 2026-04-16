import type { JobFinderAiClient } from "@unemployed/ai-providers";
import {
  type JobDiscoveryTarget,
  type JobSource,
  type SourceDebugPhase,
  type SourceDebugRunRecord,
  type SourceInstructionArtifact,
} from "@unemployed/contracts";
import type {
  SourceInstructionFinalReviewPhaseContext,
  SourceInstructionReviewOverride,
} from "./source-instruction-types";
import { parseSourceInstructionReviewOverride } from "./source-instruction-types";
import { extractJsonObjectString } from "./source-instruction-quality";

const SOURCE_DEBUG_PHASES: SourceDebugPhase[] = [
  "access_auth_probe",
  "site_structure_mapping",
  "search_filter_probe",
  "job_detail_validation",
  "apply_path_validation",
  "replay_verification",
];

export function buildSourceInstructionFinalReviewPrompt(input: {
  target: JobDiscoveryTarget;
  run: SourceDebugRunRecord;
  adapterKind: JobSource;
  verification: SourceInstructionArtifact["verification"];
  instructionUnderReview: SourceInstructionArtifact | null;
  heuristicInstruction: SourceInstructionArtifact;
  phaseContexts: readonly SourceInstructionFinalReviewPhaseContext[];
}): string {
  const payload = {
    target: {
      id: input.target.id,
      label: input.target.label,
      startingUrl: input.target.startingUrl,
      adapterKind: input.adapterKind,
    },
    run: {
      id: input.run.id,
      startedAt: input.run.startedAt,
      completedAt: input.run.completedAt,
      phaseOrder: SOURCE_DEBUG_PHASES,
    },
    verification: input.verification,
    instructionUnderReview: input.instructionUnderReview
      ? {
          id: input.instructionUnderReview.id,
          status: input.instructionUnderReview.status,
          acceptedAt: input.instructionUnderReview.acceptedAt,
          verification: input.instructionUnderReview.verification,
          navigationGuidance: input.instructionUnderReview.navigationGuidance,
          searchGuidance: input.instructionUnderReview.searchGuidance,
          detailGuidance: input.instructionUnderReview.detailGuidance,
          applyGuidance: input.instructionUnderReview.applyGuidance,
          warnings: input.instructionUnderReview.warnings,
          intelligence: input.instructionUnderReview.intelligence,
        }
      : null,
    heuristicInstruction: {
      navigationGuidance: input.heuristicInstruction.navigationGuidance,
      searchGuidance: input.heuristicInstruction.searchGuidance,
      detailGuidance: input.heuristicInstruction.detailGuidance,
      applyGuidance: input.heuristicInstruction.applyGuidance,
      warnings: input.heuristicInstruction.warnings,
      intelligence: input.heuristicInstruction.intelligence,
    },
    phaseTests: input.phaseContexts,
  };

  return [
    "Review the full source-debug evidence and organize it into the final instruction artifact.",
    "You are seeing the full sequence of agent-led phase tests, their goals, outcomes, and evidence.",
    "Use the richer phase context, timestamps, compaction summaries, attempted actions, evidence, and review transcript to decide what is actually valid.",
    "Prefer later proven evidence over earlier failed or weaker notes when they describe the same control, route, detail pattern, or apply path.",
    "Drop duplicates, raw tool chatter, step-budget chatter, and superseded contradiction lines.",
    "These outputs are reusable instructions for future discovery runs on the same site, not a report about this specific run.",
    "If an instruction artifact is already under review, compare it with the newer phase-test results and keep only the best supported guidance.",
    "If a line would not change how a future discovery run behaves, drop it.",
    "Keep uncertainty only when it still matters after reconciling the later evidence.",
    "Do not invent routes, controls, or outcomes that are not supported by the evidence.",
    "Keep the output concise and operator-facing.",
    "Return JSON only with this shape:",
    '{"navigationGuidance":[],"searchGuidance":[],"detailGuidance":[],"applyGuidance":[],"warnings":[],"intelligence":{"provider":null,"collection":{"preferredMethod":"fallback_search","rankedMethods":[],"startingRoutes":[],"searchRouteTemplates":[],"detailRoutePatterns":[],"listingMarkers":[]},"apply":{"applyPath":"unknown","authMarkers":[],"consentMarkers":[],"questionSurfaceHints":[],"resumeUploadHints":[]},"reliability":{"selectorFingerprints":[],"stableControlNames":[],"failureFingerprints":[],"verifiedAt":null,"freshnessNotes":[]},"overrides":{"forceMethod":null,"deniedRoutePatterns":[],"extraStartingRoutes":[]}}}',
    "Guidance rules:",
    "- Prefer stable routes, visible controls, canonical detail behavior, and safe apply-entry rules.",
    "- Keep typed intelligence aligned with the evidence: provider classification, ranked routes, preferred collection method, apply hints, reliability notes, and structured overrides should reflect what the run actually proved.",
    "- When a control was first flaky or unproven but later worked, keep the proven instruction and drop the earlier failure note.",
    "- When a later phase disproves an earlier claim, keep the later warning and remove the stale claim.",
    "- Empty arrays are intentional. If a category has no reliable instruction after organizing the evidence, return an empty array for that category instead of inheriting weaker lines.",
    "- Never keep extracted-job counts, sampled-job totals, step counts, tool names, or raw timeout/extraction chatter as final guidance unless they describe a durable site constraint future runs must remember.",
    "- Ask: if a future discovery run followed this line, would it behave better? If not, drop it.",
    "- Keep warnings factual and specific.",
    "Mandatory drop rules — always remove lines that match any of these patterns:",
    '- Auth-not-needed observations: any line stating the site is "accessible without login", "no authentication required", "no consent wall", or equivalent. These are default assumptions, not learned instructions.',
    "- Non-actionable observations: any line that merely describes what job cards display, what the results page shows, or how listings are formatted without telling a future agent what to DO differently.",
    "- Role-match results: any line reporting whether specific job titles or roles were found or not found (e.g. 'No React Developer positions found'). Role availability is transient and not a site instruction.",
    '- Generic fallback templates: any line like "Treat applications as manual until a reliable on-site apply entry is proven" or "Treat stable slug-style paths on the same host as the canonical detail route". These are system defaults, not site-specific knowledge.',
    "- Site identity statements: any line that merely states the site is a job board, platform, or portal without providing actionable routing or interaction guidance.",
    "Evidence payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

export async function reviewSourceInstructionArtifactWithAi(input: {
  aiClient: JobFinderAiClient;
  target: JobDiscoveryTarget;
  run: SourceDebugRunRecord;
  adapterKind: JobSource;
  verification: SourceInstructionArtifact["verification"];
  instructionUnderReview: SourceInstructionArtifact | null;
  heuristicInstruction: SourceInstructionArtifact;
  phaseContexts: readonly SourceInstructionFinalReviewPhaseContext[];
  signal?: AbortSignal;
}): Promise<SourceInstructionReviewOverride | null> {
  if (!input.aiClient.chatWithTools || input.phaseContexts.length === 0) {
    return null;
  }

  try {
    const response = await input.aiClient.chatWithTools(
      [
        {
          role: "system",
          content:
            "You are the final organizer for learned source instructions. Review the full sequence of agent-led tests, reconcile conflicts, prefer stronger later evidence, and return strict JSON only.",
        },
        {
          role: "user",
          content: buildSourceInstructionFinalReviewPrompt(input),
        },
      ],
      [],
      input.signal,
    );

    if (!response.content) {
      return null;
    }

    return parseSourceInstructionReviewOverride(
      JSON.parse(extractJsonObjectString(response.content)) as unknown,
    );
  } catch {
    return null;
  }
}

