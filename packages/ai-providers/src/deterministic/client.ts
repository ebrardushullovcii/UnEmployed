import { AgentProviderStatusSchema } from "@unemployed/contracts";
import type { JobFinderAiClient } from "../shared";
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
    detail,
  });
}

export function createDeterministicJobFinderAiClient(detail?: string): JobFinderAiClient {
  const status = buildDeterministicStatus(
    detail ??
      "Deterministic fallback is active. Set UNEMPLOYED_AI_API_KEY to use the configured OpenAI-compatible provider for resume extraction and tailoring.",
  );

  return {
    getStatus() {
      return status;
    },
    extractProfileFromResume(input) {
      return Promise.resolve(
        buildDeterministicResumeProfileExtraction(input, "deterministic", status.label),
      );
    },
    createResumeDraft(input) {
      return Promise.resolve(buildDeterministicStructuredResumeDraft(input));
    },
    reviseResumeDraft(input) {
      return Promise.resolve(buildDeterministicResumeAssistantReply(input));
    },
    tailorResume(input) {
      return Promise.resolve(buildDeterministicTailoredResume(input));
    },
    assessJobFit() {
      return Promise.resolve(null);
    },
    extractJobsFromPage() {
      return Promise.resolve([]);
    },
  };
}
