import { AgentProviderStatusSchema } from "@unemployed/contracts";
import type { JobFinderAiClient } from "../shared";
import { createDeterministicBrowserVisualAnalysisProvider } from "../browser-visual-analysis";
import { buildDeterministicProfileCopilotReply } from "./profile-copilot";
import { buildDeterministicResumeImportStageExtraction } from "./resume-import";
import { buildDeterministicResumeProfileExtraction } from "./resume-parser";
import {
  buildDeterministicResumeAssistantReply,
  buildDeterministicStructuredResumeDraft,
  buildDeterministicTailoredResume,
} from "./tailoring";

function buildDeterministicStatus(detail: string) {
  return AgentProviderStatusSchema.parse({
    kind: "deterministic",
    ready: true,
    label: "Built-in deterministic agent fallback",
    model: null,
    baseUrl: null,
    modelContextWindowTokens: null,
    reservedHeadroomTokens: null,
    requestTimeoutMs: null,
    detail,
  });
}

export function createDeterministicJobFinderAiClient(
  detail?: string,
): JobFinderAiClient {
  const status = buildDeterministicStatus(
    detail ??
      "Deterministic fallback is active. Set UNEMPLOYED_AI_API_KEY to use the configured OpenAI-compatible provider for resume extraction and tailoring.",
  );
  const visualProvider = createDeterministicBrowserVisualAnalysisProvider(
    "Deterministic AI client fallback provides browser visual observations from page text and runtime metadata.",
  );

  return {
    getStatus() {
      return status;
    },
    extractProfileFromResume(input) {
      return Promise.resolve(
        buildDeterministicResumeProfileExtraction(
          input,
          "deterministic",
          status.label,
        ),
      );
    },
    extractResumeImportStage(input) {
      return Promise.resolve(
        buildDeterministicResumeImportStageExtraction(input, status.label),
      );
    },
    adjudicateResumeImportCandidates() {
      return Promise.resolve({
        candidates: [],
        notes: [
          "Deterministic resume import adjudication deferred material conflicts to review.",
        ],
        warnings: [],
      });
    },
    createResumeDraft(input) {
      return Promise.resolve(buildDeterministicStructuredResumeDraft(input));
    },
    reviseResumeDraft(input) {
      return Promise.resolve(buildDeterministicResumeAssistantReply(input));
    },
    reviseCandidateProfile(input) {
      return Promise.resolve(buildDeterministicProfileCopilotReply(input));
    },
    tailorResume(input) {
      return Promise.resolve(buildDeterministicTailoredResume(input));
    },
    assessJobFit() {
      return Promise.resolve(null);
    },
    extractJobsFromPage(input) {
      if (input.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }

      return Promise.resolve([]);
    },
    analyzeBrowserVisualSnapshot(input) {
      return visualProvider.analyzeBrowserVisualSnapshot(input);
    },
  };
}
