import {
  createDeterministicJobFinderAiClient,
  type JobFinderAiClient,
  type ResumeProfileExtraction,
} from "@unemployed/ai-providers";
import { createCatalogBrowserSessionRuntime } from "@unemployed/browser-runtime";
import type {
  AgentDiscoveryOptions,
  BrowserSessionRuntime,
} from "@unemployed/browser-runtime";
import { JobPostingSchema } from "@unemployed/contracts";
import type {
  AgentDebugFindings,
  AgentDiscoveryProgress,
  DiscoveryRunResult,
  EditableSourceInstructionArtifact,
  JobPosting,
  ResumeResearchArtifact,
  SourceDebugCompactionState,
  SourceDebugPhaseCompletionMode,
  SourceDebugPhaseEvidence,
} from "@unemployed/contracts";

import { toPhaseId, type SourceDebugPhaseMap } from "./workspace-service.test-fixtures";

function normalizeTestJobPosting(job: Record<string, unknown>): JobPosting {
  return JobPostingSchema.parse({
    ...job,
    postedAtText: job.postedAtText ?? null,
    responsibilities: job.responsibilities ?? [],
    minimumQualifications: job.minimumQualifications ?? [],
    preferredQualifications: job.preferredQualifications ?? [],
    seniority: job.seniority ?? null,
    employmentType: job.employmentType ?? null,
    department: job.department ?? null,
    team: job.team ?? null,
    employerWebsiteUrl: job.employerWebsiteUrl ?? null,
    employerDomain: job.employerDomain ?? null,
    benefits: job.benefits ?? [],
  });
}

export function createBrowserRuntime() {
  return createCatalogBrowserSessionRuntime({
    sessions: [
      {
        source: "target_site",
        status: "ready",
        driver: "catalog_seed",
        label: "Browser session ready",
        detail: "Validated recently.",
        lastCheckedAt: "2026-03-20T10:04:00.000Z",
      },
    ],
    catalog: [
      {
        source: "target_site",
        sourceJobId: "linkedin_signal_ready",
        discoveryMethod: "catalog_seed",
        canonicalUrl:
          "https://www.linkedin.com/jobs/view/linkedin_signal_ready",
        title: "Senior Product Designer",
        company: "Signal Systems",
        location: "Remote",
        workMode: ["remote"],
        applyPath: "easy_apply",
        easyApplyEligible: true,
        postedAt: "2026-03-20T09:00:00.000Z",
        postedAtText: null,
        discoveredAt: "2026-03-20T10:04:00.000Z",
        salaryText: "$180k - $220k",
        summary: "Own the design system.",
        description: "Own the design system and workflow platform.",
        keySkills: ["Figma", "Design Systems"],
        responsibilities: ["Own the design system roadmap."],
        minimumQualifications: ["Strong product design systems experience."],
        preferredQualifications: ["Workflow-platform product background."],
        seniority: "Senior",
        employmentType: "Full-time",
        department: "Design",
        team: "Design Systems",
        employerWebsiteUrl: "https://signalsystems.example.com",
        employerDomain: "signalsystems.example.com",
        benefits: ["Remote-first collaboration"],
      },
      {
        source: "target_site",
        sourceJobId: "linkedin_pause_case",
        discoveryMethod: "catalog_seed",
        canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_pause_case",
        title: "Principal UX Engineer",
        company: "Void Industries",
        location: "Remote",
        workMode: ["remote"],
        applyPath: "easy_apply",
        easyApplyEligible: true,
        postedAt: "2026-03-20T09:30:00.000Z",
        postedAtText: null,
        discoveredAt: "2026-03-20T10:04:00.000Z",
        salaryText: "$185k - $210k",
        summary: "Lead UI platform work.",
        description:
          "Lead UI platform work. Additional work authorization details are required during apply.",
        keySkills: ["React", "Design Systems"],
        responsibilities: ["Lead UI platform architecture."],
        minimumQualifications: ["Deep React experience."],
        preferredQualifications: ["Accessibility leadership experience."],
        seniority: "Principal",
        employmentType: "Full-time",
        department: "Engineering",
        team: "UI Platform",
        employerWebsiteUrl: "https://void.example.com",
        employerDomain: "void.example.com",
        benefits: ["Remote-first collaboration"],
      },
    ].map((job) => normalizeTestJobPosting(job)),
  });
}

export function createAiClient() {
  return createDeterministicJobFinderAiClient(
    "Tests use the deterministic fallback agent.",
  );
}

export function createAgentAiClient() {
  const fallbackClient = createDeterministicJobFinderAiClient(
    "Tests use the deterministic fallback agent.",
  );

  return {
    ...fallbackClient,
    chatWithTools: () => Promise.resolve({ content: "ok", toolCalls: [] }),
  } satisfies JobFinderAiClient;
}

export function extractLatestUserPrompt(
  messages: readonly { role: string; content: string }[],
): string {
  return (
    [...messages].reverse().find((message) => message.role === "user")
      ?.content ?? ""
  );
}

export function toEditableSourceInstructionArtifactInput(artifact: {
  id: string;
  notes: string | null;
  navigationGuidance: readonly string[];
  searchGuidance: readonly string[];
  detailGuidance: readonly string[];
  applyGuidance: readonly string[];
  warnings: readonly string[];
}): EditableSourceInstructionArtifact {
  return {
    id: artifact.id,
    notes: artifact.notes,
    navigationGuidance: [...artifact.navigationGuidance],
    searchGuidance: [...artifact.searchGuidance],
    detailGuidance: [...artifact.detailGuidance],
    applyGuidance: [...artifact.applyGuidance],
    warnings: [...artifact.warnings],
  };
}

export function createAgentBrowserRuntime(
  catalog: readonly Record<string, unknown>[],
  runtimeOptions?: {
    sessionStatus?: "ready" | "login_required" | "blocked";
    sessionDetail?: string;
    compactionState?: SourceDebugCompactionState | null;
    debugFindingsByPhase?: SourceDebugPhaseMap<AgentDebugFindings | null>;
    reviewTranscriptByPhase?: SourceDebugPhaseMap<string[]>;
    phaseCompletionModeByPhase?: SourceDebugPhaseMap<SourceDebugPhaseCompletionMode | null>;
    phaseCompletionReasonByPhase?: SourceDebugPhaseMap<string | null>;
    phaseEvidenceByPhase?: SourceDebugPhaseMap<SourceDebugPhaseEvidence | null>;
  },
): BrowserSessionRuntime {
  const baseRuntime = createCatalogBrowserSessionRuntime({
    sessions: [
      {
        source: "target_site",
        status: runtimeOptions?.sessionStatus ?? "ready",
        driver: "catalog_seed",
        label: "Browser session ready",
        detail: runtimeOptions?.sessionDetail ?? "Validated recently.",
        lastCheckedAt: "2026-03-20T10:04:00.000Z",
      },
    ],
    catalog: catalog.map((job) => normalizeTestJobPosting(job)),
  });

  return {
    ...baseRuntime,
    async runAgentDiscovery(
      source,
      options: AgentDiscoveryOptions,
    ): Promise<DiscoveryRunResult> {
      const phaseId = toPhaseId(options.taskPacket?.strategyLabel);
      const debugFindings = phaseId
        ? (runtimeOptions?.debugFindingsByPhase?.[phaseId] ?? null)
        : null;
      const phaseCompletionMode = phaseId
        ? (runtimeOptions?.phaseCompletionModeByPhase?.[phaseId] ??
          "structured_finish")
        : "structured_finish";
      const phaseCompletionReason = phaseId
        ? (runtimeOptions?.phaseCompletionReasonByPhase?.[phaseId] ?? null)
        : null;
      const phaseEvidence = phaseId
        ? (runtimeOptions?.phaseEvidenceByPhase?.[phaseId] ?? null)
        : null;
      const reviewTranscript = phaseId
        ? (runtimeOptions?.reviewTranscriptByPhase?.[phaseId] ?? [])
        : [];
      const emitProgress = (progress: AgentDiscoveryProgress) => {
        options.onProgress?.(progress);
      };

      emitProgress({
        currentUrl:
          options.startingUrls[0] ?? "https://www.linkedin.com/jobs/search/",
        jobsFound: 0,
        stepCount: 1,
        currentAction: "navigate",
        targetId: null,
        adapterKind: source,
      });

      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      await Promise.resolve();

      emitProgress({
        currentUrl:
          options.startingUrls[0] ?? "https://www.linkedin.com/jobs/search/",
        jobsFound: catalog.length,
        stepCount: 2,
        currentAction: `extract_result:${catalog.length}:${catalog.length}:${catalog.length}`,
        targetId: null,
        adapterKind: source,
      });

      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      return {
        source,
        startedAt: "2026-03-20T10:00:00.000Z",
        completedAt: "2026-03-20T10:01:00.000Z",
        querySummary: "Agent discovery test run",
        warning: null,
        jobs: catalog.map((job) => normalizeTestJobPosting(job)),
        agentMetadata: {
          steps: 2,
          incomplete: false,
          transcriptMessageCount: 7,
          reviewTranscript,
          compactionState: runtimeOptions?.compactionState ?? null,
          phaseCompletionMode,
          phaseCompletionReason,
          phaseEvidence,
          debugFindings,
        },
      };
    },
  };
}

export function createExtractionAiClient(
  extraction: ResumeProfileExtraction,
): JobFinderAiClient {
  const fallbackClient = createDeterministicJobFinderAiClient(
    "Tests use the deterministic fallback agent.",
  );

  return {
    ...fallbackClient,
    extractProfileFromResume: () => Promise.resolve(extraction),
  };
}

export function createDocumentManager() {
  return {
    listResumeTemplates() {
      return [
        {
          id: "classic_ats" as const,
          label: "Classic ATS",
          description: "Single-column and ATS-friendly.",
        },
      ];
    },
    renderResumeArtifact() {
      return Promise.resolve({
        fileName: "generated-resume.pdf",
        storagePath: "/tmp/generated-resume.pdf",
        format: "pdf" as const,
        intermediateFileName: "generated-resume.html",
        intermediateStoragePath: "/tmp/generated-resume.html",
        pageCount: 2,
        warnings: [],
      });
    },
  };
}

export function createResearchAdapter(
  artifacts: readonly ResumeResearchArtifact[] = [
    {
      id: "research_job_ready_company",
      jobId: "job_ready",
      sourceUrl: "https://signalsystems.example/about",
      pageTitle: "About Signal Systems",
      fetchedAt: "2026-04-03T10:00:00.000Z",
      extractedText:
        "Signal Systems builds workflow automation and incident response software for operations teams.",
      companyNotes:
        "Signal Systems builds workflow automation and incident response software for operations teams.",
      domainVocabulary: ["workflow", "automation", "incident", "operations"],
      priorityThemes: ["workflow automation", "incident response"],
      fetchStatus: "success",
    },
  ],
) {
  return {
    fetchResearchPages(input: { job: { id: string } }) {
      return Promise.resolve(
        artifacts.filter((artifact) => artifact.jobId === input.job.id),
      );
    },
  };
}

