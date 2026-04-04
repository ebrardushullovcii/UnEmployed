import type { ResumeResearchArtifact, SavedJob } from "@unemployed/contracts";
import {
  extractReadablePage,
  extractResearchSignals,
} from "@unemployed/knowledge-base";
import type {
  ResumeResearchAdapter,
  ResumeResearchAdapterInput,
} from "@unemployed/job-finder";

interface CreateDesktopResumeResearchAdapterOptions {
  fetchImpl?: typeof fetch;
  maxPages?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

interface ReadableResearchPage {
  title: string | null;
  text: string;
}

interface ResearchSignals {
  companyNotes: string | null;
  domainVocabulary: string[];
  priorityThemes: string[];
}

export function createDesktopResumeResearchAdapter(
  options: CreateDesktopResumeResearchAdapterOptions = {},
): ResumeResearchAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? 3;
  const maxBytes = options.maxBytes ?? 250_000;
  const timeoutMs = options.timeoutMs ?? 6_000;
  const extractReadablePageTyped = extractReadablePage as unknown as (input: {
    url: string;
    html: string;
  }) => unknown;
  const extractResearchSignalsTyped = extractResearchSignals as unknown as (
    text: string,
  ) => unknown;

  return {
    async fetchResearchPages(input) {
      const typedInput: ResumeResearchAdapterInput = input;
      const candidateUrls = buildCandidateResearchUrls(typedInput.job).slice(0, maxPages);
      const artifacts: ResumeResearchArtifact[] = [];

      for (const sourceUrl of candidateUrls) {
        try {
          const responseText = await fetchPage(sourceUrl, fetchImpl, timeoutMs, maxBytes);
          const readable = normalizeReadableResearchPage(
            extractReadablePageTyped({
              url: sourceUrl,
              html: responseText,
            }),
          );
          const signals = normalizeResearchSignals(
            extractResearchSignalsTyped(readable.text),
          );

          artifacts.push({
            id: `resume_research_${typedInput.job.id}_${artifacts.length + 1}`,
            jobId: typedInput.job.id,
            sourceUrl,
            pageTitle: readable.title,
            fetchedAt: new Date().toISOString(),
            extractedText: readable.text || null,
            companyNotes: signals.companyNotes,
            domainVocabulary: [...signals.domainVocabulary],
            priorityThemes: [...signals.priorityThemes],
            fetchStatus: "success",
          });
        } catch {
          artifacts.push({
            id: `resume_research_${typedInput.job.id}_${artifacts.length + 1}`,
            jobId: typedInput.job.id,
            sourceUrl,
            pageTitle: null,
            fetchedAt: new Date().toISOString(),
            extractedText: null,
            companyNotes: null,
            domainVocabulary: [],
            priorityThemes: [],
            fetchStatus: "failed",
          });
        }
      }

      return artifacts;
    },
  };
}

const jobBoardHostFragments = [
  "linkedin.com",
  "indeed.com",
  "greenhouse.io",
  "lever.co",
  "workday.com",
  "ashbyhq.com",
  "smartrecruiters.com",
];

async function fetchPage(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxBytes: number,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "UnEmployed Resume Workspace Research/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Research fetch failed with status ${response.status}`);
    }

    const text = await response.text();
    return text.slice(0, maxBytes);
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildCandidateResearchUrls(job: SavedJob): string[] {
  const employerRoot = deriveEmployerRoot(job);
  if (!employerRoot) {
    return [];
  }

  return [employerRoot, `${employerRoot}/about`, `${employerRoot}/careers`, `${employerRoot}/company`];
}

function deriveEmployerRoot(job: SavedJob): string | null {
  const explicitEmployerOrigin = safeOrigin(job.employerWebsiteUrl ?? "");
  if (explicitEmployerOrigin) {
    return explicitEmployerOrigin;
  }

  const canonicalOrigin = safeOrigin(job.canonicalUrl);
  const canonicalHost = safeHostname(job.canonicalUrl);
  if (canonicalOrigin && canonicalHost && !isLikelyJobBoardHost(canonicalHost)) {
    return canonicalOrigin;
  }

  const employerDomain = job.employerDomain?.trim().toLowerCase() ?? null;
  if (employerDomain) {
    return `https://${employerDomain}`;
  }

  return canonicalHost && !isLikelyJobBoardHost(canonicalHost) ? canonicalOrigin : null;
}

function safeHostname(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLikelyJobBoardHost(hostname: string): boolean {
  return jobBoardHostFragments.some(
    (fragment) => hostname === fragment || hostname.endsWith(`.${fragment}`),
  );
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeReadableResearchPage(value: unknown): ReadableResearchPage {
  if (!value || typeof value !== "object") {
    throw new Error("Readable research page result was invalid.");
  }

  const candidate = value as Record<string, unknown>;

  return {
    title: typeof candidate.title === "string" ? candidate.title : null,
    text: typeof candidate.text === "string" ? candidate.text : "",
  };
}

function normalizeResearchSignals(value: unknown): ResearchSignals {
  if (!value || typeof value !== "object") {
    throw new Error("Research signals result was invalid.");
  }

  const candidate = value as Record<string, unknown>;

  return {
    companyNotes:
      typeof candidate.companyNotes === "string" ? candidate.companyNotes : null,
    domainVocabulary: Array.isArray(candidate.domainVocabulary)
      ? candidate.domainVocabulary.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    priorityThemes: Array.isArray(candidate.priorityThemes)
      ? candidate.priorityThemes.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
  };
}
