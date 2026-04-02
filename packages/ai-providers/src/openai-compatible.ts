import { AgentProviderStatusSchema, JobPostingSchema, type ToolCall } from "@unemployed/contracts";
import {
  JobFitAssessmentSchema,
  OpenAiCompatibleJobFinderAiClientOptionsSchema,
  ResumeProfileExtractionSchema,
  TailoredResumeDraftSchema,
  type AgentCapableJobFinderAiClient,
  type JobFinderAiClient,
  type OpenAiCompatibleJobFinderAiClientOptions,
  type StringMap,
} from "./shared";
import {
  buildDeterministicResumeProfileExtraction,
  buildGenericCanonicalUrl,
  buildGenericJobId,
  buildInvalidJobSample,
  completeResumeExtraction,
  createDeterministicJobFinderAiClient,
  describeInvalidFieldCounts,
  uniqueStrings,
} from "./deterministic";

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
    const rawSnippet = rawBody.length > 400 ? `${rawBody.slice(0, 400)}...[truncated]` : rawBody;
    throw new Error(
      payload?.error?.message ??
        `Model request failed with status ${response.status}.${rawSnippet ? ` Response body: ${rawSnippet}` : ""}`,
    );
  }

  if (!payload) {
    const rawSnippet = rawBody.length > 400 ? `${rawBody.slice(0, 400)}...[truncated]` : rawBody;
    throw new Error(
      `Model returned a non-JSON response.${rawSnippet ? ` Response body: ${rawSnippet}` : ""}`,
    );
  }

  const normalizedPayload = payload as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
    error?: {
      message?: string;
    };
  }

  const rawContent = extractContentString(
    normalizedPayload.choices?.[0]?.message?.content,
  );
  const jsonString = extractJsonString(rawContent);

  try {
    return JSON.parse(jsonString) as unknown;
  } catch (error) {
    const jsonSnippet =
      jsonString.length > 400
        ? `${jsonString.slice(0, 400)}...[truncated]`
        : jsonString;

    throw new Error(
      `Model returned invalid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}. Response snippet: ${jsonSnippet}`,
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
    const rawSnippet = rawBody.length > 400 ? `${rawBody.slice(0, 400)}...[truncated]` : rawBody;
    throw new Error(
      payload?.error?.message ??
        `Chat request failed with status ${response.status}.${rawSnippet ? ` Response body: ${rawSnippet}` : ""}`,
    );
  }

  if (!payload) {
    const rawSnippet = rawBody.length > 400 ? `${rawBody.slice(0, 400)}...[truncated]` : rawBody;
    throw new Error(
      `Chat request returned a non-JSON response.${rawSnippet ? ` Response body: ${rawSnippet}` : ""}`,
    );
  }

  return payload;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBaseUrl).toString();
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

    const response = await fetch(buildChatCompletionsUrl(validatedOptions.baseUrl), {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
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
        payload && typeof payload === "object"
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
      return TailoredResumeDraftSchema.parse(payload);
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
      if (maxJobs === 0) {
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
              "Each job should include: sourceJobId when explicit, canonicalUrl when stable, title, company, location, salaryText (or null), and description (short summary from the listing).",
              'Use any "Relevant in-scope URLs found on page" entries to recover stable canonical job URLs whenever possible.',
              "If you cannot determine a stable canonicalUrl or a reliable job title for a listing, omit that listing from the output.",
              "Do not invent companies, locations, or URLs.",
              `Return at most ${maxJobs} jobs.`,
            ].join(" ")
          : [
              `You extract one structured job posting from a job-detail page on ${pageHostLabel}.`,
              'Return JSON with a "jobs" array containing one job object.',
              "Jobs may appear in any language. Preserve the original language of titles, companies, locations, and descriptions.",
              "Each job should include canonicalUrl, title, company, location, salaryText (or null), and description (full job description text).",
              "Use the page URL as the source of truth for canonicalUrl whenever available.",
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

      const rawJobCandidates =
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { jobs?: unknown }).jobs)
          ? (payload as { jobs: unknown[] }).jobs
          : [];
      const rawJobs: Array<Record<string, unknown>> = [];

      const parsedJobs: Array<Awaited<ReturnType<typeof JobPostingSchema.parse>>> = [];
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
        if (parsedJobs.length >= maxJobs) {
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

        const candidate = {
          source: "target_site" as const,
          sourceJobId: derivedSourceJobId,
          discoveryMethod: "browser_agent" as const,
          canonicalUrl: derivedCanonicalUrl,
          title: toStr(raw.title),
          company: toStr(raw.company),
          location: toStr(raw.location),
          workMode: Array.isArray(raw.workMode) ? raw.workMode : [],
          applyPath:
            raw.applyPath === "easy_apply" ||
            raw.applyPath === "external_redirect" ||
            raw.applyPath === "unknown"
              ? raw.applyPath
              : "unknown",
          easyApplyEligible: raw.easyApplyEligible === true,
          postedAt: new Date().toISOString(),
          discoveredAt: new Date().toISOString(),
          salaryText: raw.salaryText ? toStr(raw.salaryText) : null,
          summary: toStr(raw.description).slice(0, 240),
          description: toStr(raw.description),
          keySkills: Array.isArray(raw.keySkills) ? raw.keySkills : [],
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
              typeof toolCall.function.arguments !== "string"
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
      } catch {
        const fallback = await fallbackClient.extractProfileFromResume(input);
        return {
          ...fallback,
          notes: uniqueStrings([
            ...fallback.notes,
            "Fell back to the deterministic resume parser after the model call failed.",
          ]),
        };
      }
    },
    async tailorResume(input) {
      try {
        return await primaryClient.tailorResume(input);
      } catch {
        const fallback = await fallbackClient.tailorResume(input);
        return {
          ...fallback,
          notes: uniqueStrings([
            ...fallback.notes,
            "Fell back to the deterministic resume tailorer after the model call failed.",
          ]),
        };
      }
    },
    async assessJobFit(input) {
      try {
        return await primaryClient.assessJobFit(input);
      } catch {
        return fallbackClient.assessJobFit(input);
      }
    },
    async extractJobsFromPage(input) {
      try {
        return await primaryClient.extractJobsFromPage(input);
      } catch {
        return fallbackClient.extractJobsFromPage(input);
      }
    },
    async chatWithTools(messages, tools, signal) {
      return primaryClient.chatWithTools(messages, tools, signal);
    },
  };
}
