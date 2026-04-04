import { AgentProviderStatusSchema, JobPostingSchema, type JobPosting, type ToolCall } from "@unemployed/contracts";
import {
  JobFitAssessmentSchema,
  OpenAiCompatibleJobFinderAiClientOptionsSchema,
  ResumeAssistantReplySchema,
  ResumeProfileExtractionSchema,
  TailoredResumeDraftSchema,
  type AgentCapableJobFinderAiClient,
  type JobFinderAiClient,
  type OpenAiCompatibleJobFinderAiClientOptions,
  type StringMap,
} from "./shared";
import {
  buildDeterministicResumeProfileExtraction,
  buildDeterministicStructuredResumeDraft,
  buildGenericCanonicalUrl,
  buildGenericJobId,
  buildInvalidJobSample,
  completeResumeExtraction,
  createDeterministicJobFinderAiClient,
  describeInvalidFieldCounts,
  uniqueStrings,
} from "./deterministic";

function summarizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown error";
}

function logFallbackError(operation: string, error: unknown): void {
  console.error(
    `[AI Provider] ${operation} failed; falling back to deterministic client. ${summarizeError(error)}`,
  );
}

function completeTailoredResumeDraft(
  primary: unknown,
  fallbackInput: Parameters<typeof buildDeterministicStructuredResumeDraft>[0],
) {
  const fallback = buildDeterministicStructuredResumeDraft(fallbackInput);
  const normalizedPrimary =
    primary && typeof primary === "object" && !Array.isArray(primary)
      ? (primary as Record<string, unknown>)
      : {};

  return TailoredResumeDraftSchema.parse({
    ...fallback,
    ...normalizedPrimary,
    label:
      typeof normalizedPrimary.label === "string"
        ? normalizedPrimary.label
        : fallback.label,
    summary:
      typeof normalizedPrimary.summary === "string" &&
      normalizedPrimary.summary.trim().length > 0
        ? normalizedPrimary.summary
        : fallback.summary,
    experienceHighlights: Array.isArray(normalizedPrimary.experienceHighlights)
      ? normalizedPrimary.experienceHighlights
      : fallback.experienceHighlights,
    coreSkills: Array.isArray(normalizedPrimary.coreSkills)
      ? normalizedPrimary.coreSkills
      : fallback.coreSkills,
    targetedKeywords: Array.isArray(normalizedPrimary.targetedKeywords)
      ? normalizedPrimary.targetedKeywords
      : fallback.targetedKeywords,
    fullText:
      typeof normalizedPrimary.fullText === "string" &&
      normalizedPrimary.fullText.trim().length > 0
        ? normalizedPrimary.fullText
        : fallback.fullText,
    compatibilityScore:
      typeof normalizedPrimary.compatibilityScore === "number"
        ? normalizedPrimary.compatibilityScore
        : fallback.compatibilityScore,
    notes: uniqueStrings([
      ...fallback.notes,
      ...(Array.isArray(normalizedPrimary.notes)
        ? normalizedPrimary.notes.filter(
            (note): note is string => typeof note === "string" && note.trim().length > 0,
          )
        : []),
    ]),
  });
}

function isTextContentPart(value: unknown): value is { text: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "text" in value &&
      typeof value.text === "string",
  );
}

function extractContentString(rawContent: unknown): string {
  if (typeof rawContent === "string") {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .flatMap((entry) => {
        if (typeof entry === "string") {
          return [entry];
        }

        if (isTextContentPart(entry)) {
          return [entry.text];
        }

        return [];
      })
      .join("\n");
  }

  return "";
}

function extractJsonString(rawContent: string): string {
  const fencedMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = rawContent.indexOf("{");
  const lastBraceIndex = rawContent.lastIndexOf("}");

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return rawContent.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  return rawContent.trim();
}

type ChatCompletionsPayload = {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const supportedWorkModes = new Set(["remote", "hybrid", "onsite", "flexible"]);
const jobBoardHostFragments = [
  "linkedin.com",
  "indeed.com",
  "greenhouse.io",
  "lever.co",
  "workday.com",
  "ashbyhq.com",
  "smartrecruiters.com",
];

async function parseModelJsonResponse(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  const payload = rawBody.length > 0
    ? (() => {
        try {
          return JSON.parse(rawBody) as {
            choices?: Array<{
              message?: {
                content?: unknown;
              };
            }>;
            error?: {
              message?: string;
            };
          };
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `Model request failed with status ${response.status}`,
    );
  }

  if (!payload) {
    throw new Error("Model returned a non-JSON response");
  }

  const rawContent = extractContentString(
    payload.choices?.[0]?.message?.content,
  );
  const jsonString = extractJsonString(rawContent);

  try {
    return JSON.parse(jsonString) as unknown;
  } catch (error) {
    throw new Error(
      `Model returned invalid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
    );
  }
}

async function parseResponsePayload(response: Response): Promise<ChatCompletionsPayload> {
  const rawBody = await response.text();

  let payload: ChatCompletionsPayload | null = null;

  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody) as ChatCompletionsPayload;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `Chat request failed with status ${response.status}`,
    );
  }

  if (!payload) {
    throw new Error("Chat request returned a non-JSON response");
  }

  return payload;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBaseUrl).toString();
}

function trimToNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function toIsoDateTimeOrNull(value: unknown): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function summarizeJobPosting(input: {
  title: string;
  company: string;
  description: string;
  responsibilities: readonly string[];
  minimumQualifications: readonly string[];
  preferredQualifications: readonly string[];
}): string {
  const firstStructuredLine = [
    ...input.responsibilities,
    ...input.minimumQualifications,
    ...input.preferredQualifications,
  ][0] ?? null;

  if (firstStructuredLine) {
    return firstStructuredLine;
  }

  const normalizedDescription = input.description.trim();
  if (!normalizedDescription) {
    return `${input.title} opportunity at ${input.company}`;
  }

  const firstSentence = normalizedDescription
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .find(Boolean);

  return firstSentence ? firstSentence.slice(0, 280) : normalizedDescription.slice(0, 280);
}

function toHostnameOrNull(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLikelyJobBoardHost(hostname: string | null): boolean {
  if (!hostname) {
    return false;
  }

  return jobBoardHostFragments.some(
    (fragment) => hostname === fragment || hostname.endsWith(`.${fragment}`),
  );
}

export function createOpenAiCompatibleJobFinderAiClient(
  options: OpenAiCompatibleJobFinderAiClientOptions,
): AgentCapableJobFinderAiClient {
  const configuredOptions = OpenAiCompatibleJobFinderAiClientOptionsSchema.safeParse(options);
  const validatedOptions = configuredOptions.success ? configuredOptions.data : null;
  const status = AgentProviderStatusSchema.parse({
    kind: "openai_compatible",
    ready: configuredOptions.success,
    label: validatedOptions?.label ?? "AI resume agent",
    model: validatedOptions?.model ?? null,
    baseUrl: validatedOptions?.baseUrl ?? null,
    detail:
      configuredOptions.success
        ? "The configured AI provider handles resume extraction and tailoring. Structured JSON outputs are validated locally before they affect Job Finder state."
        : "The configured AI provider settings are invalid. Check the model and base URL before enabling model-backed resume extraction.",
  });

  async function fetchModelJson(
    systemPrompt: string,
    userPayload: unknown,
  ): Promise<unknown> {
    if (!validatedOptions) {
      throw new Error(
        "The configured AI provider settings are invalid. Check the model and base URL before making model requests.",
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(buildChatCompletionsUrl(validatedOptions.baseUrl), {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${validatedOptions.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: validatedOptions.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: JSON.stringify(userPayload),
            },
          ],
        }),
      });

      return parseModelJsonResponse(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    getStatus() {
      return status;
    },
    async extractProfileFromResume(input) {
      const payload = await fetchModelJson(
        [
          "You extract structured candidate details from resume text.",
          "Return JSON only.",
          "The resume text may come from PDF, DOCX, TXT, or Markdown extraction and can contain broken lines, repeated headings, metadata, or messy spacing.",
          "Normalize the output into a clean candidate profile.",
          "Use the resume text as the primary source of truth and only fall back to the provided existing profile when the resume does not contain the field.",
          "Do not invent employers, dates, locations, links, or achievements that are not grounded in the input.",
          "Prefer null instead of guessing for missing contact details.",
          "Keep summary focused on the professional bio, not contact metadata.",
          "Return a concise headline without dates or employment ranges.",
          "Split names into firstName, middleName, lastName when possible.",
          "Return preferredLocations as a clean list of likely target locations, not raw address metadata.",
          "If timezone is not explicitly written but location contains a city or region (not just a country), infer the most likely IANA timezone from the city or region.",
          "If salary currency or regional defaults are not explicitly written but the resume location makes them obvious, infer the most likely value with high confidence.",
          "Return atomic list items only: one skill, one role, one school, one language, or one company per entry.",
          "Return experience achievements, experience skills, project skills, and grouped skills as clean arrays with one item per entry, not one large paragraph or combined newline blob.",
          "Keep single-word or short technical skills split into separate array items instead of grouping many of them into one sentence.",
          "Do not repeat exact duplicates across skills, grouped skills, links, languages, projects, or experience item arrays.",
          "Populate skillGroups with coreSkills, tools, languagesAndFrameworks, softSkills, and highlightedSkills instead of dumping everything into skills.",
          "Populate experiences, education, certifications, links, projects, and spokenLanguages as structured arrays with one record per item whenever the resume contains enough evidence.",
          "Use professionalSummary for narrative rollups such as shortValueProposition, fullSummary, careerThemes, and strengths.",
          "Return notes only when the extraction is uncertain, incomplete, or needs user review; otherwise return an empty array.",
        ].join(" "),
        {
          existingProfile: input.existingProfile,
          existingSearchPreferences: input.existingSearchPreferences,
          resumeText: input.resumeText,
        },
      );
      const normalizedPayload =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const parsedPrimaryExtraction = ResumeProfileExtractionSchema.parse({
        ...normalizedPayload,
        analysisProviderKind: "openai_compatible",
        analysisProviderLabel: status.label,
      });
      const deterministicSupplement = buildDeterministicResumeProfileExtraction(
        input,
        "deterministic",
        "Built-in deterministic parser supplement",
      );

      return ResumeProfileExtractionSchema.parse({
        ...completeResumeExtraction(
          parsedPrimaryExtraction,
          deterministicSupplement,
        ),
        analysisProviderKind: "openai_compatible",
        analysisProviderLabel: status.label,
      });
    },
    async createResumeDraft(input) {
      const payload = await fetchModelJson(
        [
          "You create a structured, grounded tailored resume draft for a job.",
          "Return JSON only.",
          "Use the provided evidence and research only to prioritize or reframe existing candidate facts.",
          "Never invent candidate dates, titles, employers, metrics, or credentials.",
          "Keep the output ATS-friendly and concise.",
        ].join(" "),
        input,
      );
      return completeTailoredResumeDraft(payload, input);
    },
    async reviseResumeDraft(input) {
      const payload = await fetchModelJson(
        [
          "You are a resume editing assistant.",
          "Return JSON only with content and typed patches.",
          "Patches must make bounded edits to the supplied draft rather than rewriting the whole resume.",
          "Do not invent candidate facts.",
          "Avoid touching locked content by leaving it unchanged.",
        ].join(" "),
        input,
      );
      return ResumeAssistantReplySchema.parse(payload);
    },
    async tailorResume(input) {
      const payload = await fetchModelJson(
        [
          "You tailor resumes for specific jobs.",
          "Return JSON only.",
          "Ground every section in the provided profile, resume text, and job posting.",
          "Do not invent employers, achievements, dates, or credentials.",
          "Write concise ATS-friendly content.",
        ].join(" "),
        input,
      );
      return completeTailoredResumeDraft(payload, {
        profile: input.profile,
        searchPreferences: input.searchPreferences,
        settings: input.settings,
        job: input.job,
        resumeText: input.resumeText,
      });
    },
    async assessJobFit(input) {
      const payload = await fetchModelJson(
        [
          "You assess how well a job matches a candidate profile.",
          "Return JSON only.",
          "Use a 0-100 score, 1-3 reasons, and up to 3 gaps.",
          "Keep explanations specific to the provided profile and job.",
        ].join(" "),
        input,
      );
      return JobFitAssessmentSchema.parse(payload);
    },
    async extractJobsFromPage(input) {
      const maxJobs = Math.max(0, Math.floor(input.maxJobs));
      const effectiveMaxJobs =
        input.pageType === "job_detail" ? Math.min(maxJobs, 1) : maxJobs;
      if (effectiveMaxJobs === 0) {
        return [];
      }

      const pageHostLabel = (() => {
        try {
          return new URL(input.pageUrl).hostname;
        } catch {
          return "the configured job site";
        }
      })();
      const systemPrompt =
        input.pageType === "search_results"
          ? [
              `You extract job listings from a careers or job-search page on ${pageHostLabel}.`,
              'Return JSON with a "jobs" array.',
              "Jobs may appear in any language. Preserve the original language of titles, companies, locations, and descriptions.",
              "Each job should include: sourceJobId when explicit, canonicalUrl when stable, title, company, location, salaryText (or null), description, summary when confidently available, workMode, keySkills, responsibilities, minimumQualifications, preferredQualifications, seniority, employmentType, department, team, postedAt or postedAtText when visible, employerWebsiteUrl when proven, applyPath, and easyApplyEligible.",
              'Use only these applyPath values: "easy_apply", "external_redirect", or "unknown". Use "unknown" when the page does not prove the path.',
              'Set easyApplyEligible to true only when the page clearly shows an inline easy-apply path; otherwise return false.',
              'Use any "Relevant in-scope URLs found on page" entries to recover stable canonical job URLs whenever possible.',
              "If you cannot determine a stable canonicalUrl or a reliable job title for a listing, omit that listing from the output.",
              "Do not fabricate posted dates. Use null when exact posting time is unknown and preserve any visible relative string in postedAtText.",
              "Do not invent companies, locations, or URLs.",
              `Return at most ${effectiveMaxJobs} jobs.`,
            ].join(" ")
          : [
              `You extract one structured job posting from a job-detail page on ${pageHostLabel}.`,
              'Return JSON with a "jobs" array containing one job object.',
              "Jobs may appear in any language. Preserve the original language of titles, companies, locations, and descriptions.",
              "Each job should include canonicalUrl, title, company, location, salaryText (or null), description, summary when confidently available, workMode, keySkills, responsibilities, minimumQualifications, preferredQualifications, seniority, employmentType, department, team, postedAt or postedAtText when visible, employerWebsiteUrl when proven, applyPath, and easyApplyEligible.",
              'Use only these applyPath values: "easy_apply", "external_redirect", or "unknown". Use "unknown" when the page does not prove the path.',
              'Set easyApplyEligible to true only when the page clearly shows an inline easy-apply path; otherwise return false.',
              "Use the page URL as the source of truth for canonicalUrl whenever available.",
              "Do not fabricate posted dates. Use null when exact posting time is unknown and preserve any visible relative string in postedAtText.",
              'If the page is not clearly a job detail page, return { "jobs": [] }.',
            ].join(" ");

      const payload = await fetchModelJson(systemPrompt, {
        pageUrl: input.pageUrl,
        pageText: input.pageText.slice(0, 12000),
      });

      const toStr = (value: unknown): string => {
        if (typeof value === "string") return value;
        if (typeof value === "number") return String(value);
        return "";
      };

        const toStringArray = (value: unknown): string[] => {
          if (Array.isArray(value)) {
          return value.flatMap((entry) => {
            const normalized = toStr(entry).trim();
            return normalized ? [normalized] : [];
          });
        }

        const normalized = toStr(value).trim();
        return normalized ? [normalized] : [];
      };

        const toWorkModeArray = (value: unknown): string[] => {
        return toStringArray(value)
          .flatMap((entry) => entry.split(","))
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => supportedWorkModes.has(entry));
        };

      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray((payload as { jobs?: unknown }).jobs)
      ) {
        throw new Error(
          `[AI Provider] Expected a top-level jobs array when extracting jobs from ${pageHostLabel}, received: ${JSON.stringify(payload)}`,
        );
      }

      const rawJobCandidates = (payload as { jobs: unknown[] }).jobs;
      const rawJobs: Array<Record<string, unknown>> = [];

      const parsedJobs: JobPosting[] = [];
      let skippedJobs = 0;
      const invalidFieldCounts = new Map<string, number>();
      const invalidSamples: string[] = [];

      for (const candidate of rawJobCandidates) {
        if (
          candidate &&
          typeof candidate === "object" &&
          !Array.isArray(candidate)
        ) {
          rawJobs.push(candidate as Record<string, unknown>);
          continue;
        }

        skippedJobs += 1;
        invalidFieldCounts.set(
          "payload_shape",
          (invalidFieldCounts.get("payload_shape") ?? 0) + 1,
        );
        if (invalidSamples.length < 3) {
          invalidSamples.push(JSON.stringify({ invalidItem: candidate }));
        }
      }

        for (const raw of rawJobs) {
        if (parsedJobs.length >= effectiveMaxJobs) {
          break;
        }

        const rawSourceJobId = toStr(raw.sourceJobId);
        const rawCanonicalUrl =
          toStr(raw.canonicalUrl) || toStr(raw.url) || toStr(raw.link);

        const fallbackUrl =
          input.pageType === "job_detail" ? input.pageUrl : "";
        const derivedCanonicalUrl = buildGenericCanonicalUrl(
          rawCanonicalUrl || fallbackUrl,
          input.pageUrl,
        );
        const derivedSourceJobId =
          rawSourceJobId || buildGenericJobId(derivedCanonicalUrl);

        if (!derivedCanonicalUrl || !derivedSourceJobId) {
          skippedJobs += 1;
          invalidFieldCounts.set(
            "stable_identity",
            (invalidFieldCounts.get("stable_identity") ?? 0) + 1,
          );
          continue;
        }

        const responsibilities = toStringArray(raw.responsibilities);
        const minimumQualifications = toStringArray(
          raw.minimumQualifications ?? raw.requirements ?? raw.qualifications,
        );
        const preferredQualifications = toStringArray(
          raw.preferredQualifications ?? raw.preferredRequirements,
        );
        const description = toStr(raw.description);
        const employerWebsiteUrl = trimToNull(raw.employerWebsiteUrl);
        const candidate = {
          source: "target_site" as const,
          sourceJobId: derivedSourceJobId,
          discoveryMethod: "browser_agent" as const,
          canonicalUrl: derivedCanonicalUrl,
          title: toStr(raw.title),
          company: toStr(raw.company),
          location: toStr(raw.location),
          workMode: toWorkModeArray(raw.workMode),
          applyPath:
            raw.applyPath === "easy_apply" ||
            raw.applyPath === "external_redirect" ||
            raw.applyPath === "unknown"
              ? raw.applyPath
              : "unknown",
          easyApplyEligible: raw.easyApplyEligible === true,
          postedAt: toIsoDateTimeOrNull(raw.postedAt),
          postedAtText: trimToNull(raw.postedAtText ?? raw.postedLabel ?? raw.postedRelative),
          discoveredAt: new Date().toISOString(),
          salaryText: raw.salaryText ? toStr(raw.salaryText) : null,
          summary:
            trimToNull(raw.summary) ??
            summarizeJobPosting({
              title: toStr(raw.title),
              company: toStr(raw.company),
              description,
              responsibilities,
              minimumQualifications,
              preferredQualifications,
            }),
          description,
          keySkills: toStringArray(raw.keySkills),
          responsibilities,
          minimumQualifications,
          preferredQualifications,
          seniority: trimToNull(raw.seniority ?? raw.level),
          employmentType: trimToNull(raw.employmentType),
          department: trimToNull(raw.department),
          team: trimToNull(raw.team),
          employerWebsiteUrl,
          employerDomain: (() => {
            const explicitHost = toHostnameOrNull(employerWebsiteUrl);
            if (explicitHost) {
              return explicitHost;
            }

            const canonicalHost = toHostnameOrNull(derivedCanonicalUrl);
            return canonicalHost && !isLikelyJobBoardHost(canonicalHost)
              ? canonicalHost
              : null;
          })(),
          benefits: toStringArray(raw.benefits),
        };

        const parsed = JobPostingSchema.safeParse(candidate);
        if (parsed.success) {
          parsedJobs.push(parsed.data);
          continue;
        }

        skippedJobs += 1;
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          const normalizedField =
            typeof field === "string" && field.length > 0 ? field : "unknown";
          invalidFieldCounts.set(
            normalizedField,
            (invalidFieldCounts.get(normalizedField) ?? 0) + 1,
          );
        }

        if (invalidSamples.length < 3) {
          invalidSamples.push(buildInvalidJobSample(candidate));
        }
      }

      if (skippedJobs > 0) {
        console.warn(
          `[AI Provider] Model returned ${rawJobs.length} job candidates on ${pageHostLabel}; extracted ${parsedJobs.length} valid jobs and skipped ${skippedJobs} invalid jobs. Top invalid fields: ${describeInvalidFieldCounts(invalidFieldCounts)}`,
        );

        if (invalidSamples.length > 0) {
          console.warn(
            `[AI Provider] Invalid job samples: ${invalidSamples.join(" | ")}`,
          );
        }
      }

      return parsedJobs;
    },
    async chatWithTools(messages, tools, signal) {
      if (!validatedOptions) {
        throw new Error(
          "The configured AI provider settings are invalid. Check the model and base URL before making model requests.",
        );
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      let onCallerAbort: (() => void) | null = null;

      if (signal?.aborted) {
        clearTimeout(timeoutId);
        controller.abort();
      } else if (signal) {
        onCallerAbort = () => {
          clearTimeout(timeoutId);
          controller.abort();
        };
        signal.addEventListener("abort", onCallerAbort, { once: true });
      }

      try {
        const response = await fetch(buildChatCompletionsUrl(validatedOptions.baseUrl), {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${validatedOptions.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: validatedOptions.model,
            temperature: 0.2,
            messages: messages.map((msg) => {
              const base = { role: msg.role, content: msg.content };
              if (msg.role === "assistant" && msg.toolCalls) {
                return {
                  ...base,
                  tool_calls: msg.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: tc.type,
                    function: tc.function,
                  })),
                };
              }
              if (msg.role === "tool") {
                return {
                  ...base,
                  tool_call_id: msg.toolCallId,
                };
              }
              return base;
            }),
            tools: tools.map((tool) => ({
              type: tool.type,
              function: {
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters,
              },
            })),
            tool_choice: "auto",
          }),
        });

        const payload = await parseResponsePayload(response);

        const message = payload.choices?.[0]?.message;

        const result: {
          content?: string;
          toolCalls?: ToolCall[];
          reasoning?: string;
        } = {};
        const requestedToolNames = new Set(
          tools.map((tool) => tool.function.name),
        );

        if (message?.content) {
          result.content = message.content;
        }

        if (
          Array.isArray(message?.tool_calls) &&
          message.tool_calls.length > 0
        ) {
          const toolCalls = message.tool_calls.flatMap((toolCall) => {
            if (
              toolCall?.type !== "function" ||
              typeof toolCall.id !== "string" ||
              !toolCall.function ||
              typeof toolCall.function.name !== "string" ||
              typeof toolCall.function.arguments !== "string" ||
              !requestedToolNames.has(toolCall.function.name)
            ) {
              return [];
            }

            return [
              {
                id: toolCall.id,
                type: "function" as const,
                function: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                },
              },
            ];
          });

          if (toolCalls.length > 0) {
            result.toolCalls = toolCalls;
          }
        }

        return result;
      } finally {
        clearTimeout(timeoutId);
        if (signal && onCallerAbort) {
          signal.removeEventListener("abort", onCallerAbort);
        }
      }
    },
  };
}

export function createJobFinderAiClientFromEnvironment(
  env: StringMap = process.env,
): JobFinderAiClient {
  const apiKey = env.UNEMPLOYED_AI_API_KEY;

  if (!apiKey) {
    return createDeterministicJobFinderAiClient();
  }

  const primaryClient = createOpenAiCompatibleJobFinderAiClient({
    apiKey,
    baseUrl: env.UNEMPLOYED_AI_BASE_URL ?? "https://ai.automatedpros.link/v1",
    model: env.UNEMPLOYED_AI_MODEL ?? "FelidaeAI-Pro-2.5",
    label: "AI resume agent",
  });
  const fallbackClient = createDeterministicJobFinderAiClient(
    "The configured model is enabled, and deterministic fallbacks protect the app when a model call fails.",
  );

  return {
    getStatus() {
      return primaryClient.getStatus();
    },
    async extractProfileFromResume(input) {
      try {
        return await primaryClient.extractProfileFromResume(input);
      } catch (error) {
        logFallbackError("extractProfileFromResume", error);
        const fallback = await fallbackClient.extractProfileFromResume(input);
        return {
          ...fallback,
          notes: uniqueStrings([
            ...fallback.notes,
            "Fell back to the deterministic resume parser after the model call failed.",
            `Primary AI extraction failed: ${summarizeError(error)}`,
          ]),
        };
      }
    },
    async createResumeDraft(input) {
      try {
        return await primaryClient.createResumeDraft(input);
      } catch (error) {
        logFallbackError("createResumeDraft", error);
        const fallback = await fallbackClient.createResumeDraft(input);
        return {
          ...fallback,
          notes: uniqueStrings([
            ...fallback.notes,
            "Fell back to the deterministic resume draft creator after the model call failed.",
            `Primary AI draft creation failed: ${summarizeError(error)}`,
          ]),
        };
      }
    },
    async reviseResumeDraft(input) {
      try {
        return await primaryClient.reviseResumeDraft(input);
      } catch (error) {
        logFallbackError("reviseResumeDraft", error);
        return fallbackClient.reviseResumeDraft(input);
      }
    },
    async tailorResume(input) {
      try {
        return await primaryClient.tailorResume(input);
      } catch (error) {
        logFallbackError("tailorResume", error);
        const fallback = await fallbackClient.tailorResume(input);
        return {
          ...fallback,
          notes: uniqueStrings([
            ...fallback.notes,
            "Fell back to the deterministic resume tailorer after the model call failed.",
            `Primary AI tailoring failed: ${summarizeError(error)}`,
          ]),
        };
      }
    },
    async assessJobFit(input) {
      try {
        return await primaryClient.assessJobFit(input);
      } catch (error) {
        logFallbackError("assessJobFit", error);
        return fallbackClient.assessJobFit(input);
      }
    },
    async extractJobsFromPage(input) {
      try {
        return await primaryClient.extractJobsFromPage(input);
      } catch (error) {
        logFallbackError("extractJobsFromPage", error);
        return fallbackClient.extractJobsFromPage(input);
      }
    },
    async chatWithTools(messages, tools, signal) {
      return primaryClient.chatWithTools(messages, tools, signal);
    },
  };
}
