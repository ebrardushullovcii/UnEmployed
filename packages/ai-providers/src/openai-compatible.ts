import {
  AgentProviderStatusSchema,
  ProfileCopilotReplySchema,
  ResumeDraftPatchSchema,
  type ProfileCopilotReply,
  type ToolCall,
} from "@unemployed/contracts";
import {
  JobFitAssessmentSchema,
  OpenAiCompatibleJobFinderAiClientOptionsSchema,
  ResumeAssistantReplySchema,
  ResumeProfileExtractionSchema,
  type AgentCapableJobFinderAiClient,
  type JobFinderAiClient,
  type OpenAiCompatibleJobFinderAiClientOptions,
  type StringMap,
} from "./shared";
import {
  buildDeterministicResumeProfileExtraction,
  completeResumeExtraction,
  createDeterministicJobFinderAiClient,
  uniqueStrings,
} from "./deterministic";
import {
  completeTailoredResumeDraft,
  logFallbackError,
  summarizeError,
} from "./openai-compatible-shared";
import {
  buildChatCompletionsUrl,
  parseModelJsonResponse,
  parseResponsePayload,
} from "./openai-compatible-transport";
import {
  buildJobsExtractionPrompt,
  normalizeExtractedJobs,
} from "./openai-compatible-jobs";
import { extractOpenAiCompatibleResumeImportStage } from "./openai-compatible-resume-import";

const DEFAULT_MODEL_TIMEOUT_MS = 60_000;
const DEFAULT_RESUME_EXTRACTION_TIMEOUT_MS = 120_000;
const SEARCH_RESULTS_EXTRACTION_TIMEOUT_MS = 35_000;
const SEARCH_RESULTS_EXTRACTION_PAGE_TEXT_LIMIT = 8_000;
const JOB_DETAIL_EXTRACTION_PAGE_TEXT_LIMIT = 12_000;
const SEARCH_RESULTS_MAX_MODEL_JOBS = 4;
const DEFAULT_MODEL_CONTEXT_WINDOW_TOKENS = 196_000;

type ChatWithToolsOptions = {
  maxOutputTokens?: number;
};

function parseConfiguredTimeoutMs(
  value: string | undefined,
): number | undefined {
  const parsedValue = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 1_000) {
    return undefined;
  }

  return parsedValue;
}

function normalizeTimeoutLikeError(error: unknown, timeoutMs: number): unknown {
  const message = error instanceof Error ? error.message.trim() : "";
  const isAbortLikeMessage =
    message === "This operation was aborted" ||
    message === "The operation was aborted" ||
    message === "signal is aborted without reason";

  if (error instanceof DOMException && error.name === "AbortError") {
    return new DOMException(
      `Model request timed out after ${Math.floor(timeoutMs / 1000)}s`,
      "AbortError",
    );
  }

  if (error instanceof Error && error.name === "AbortError") {
    const abortError = new Error(
      `Model request timed out after ${Math.floor(timeoutMs / 1000)}s`,
    );
    abortError.name = "AbortError";
    return abortError;
  }

  if (isAbortLikeMessage) {
    const abortError = new Error(
      `Model request timed out after ${Math.floor(timeoutMs / 1000)}s`,
    );
    abortError.name = "AbortError";
    return abortError;
  }

  return error;
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
    modelContextWindowTokens: configuredOptions.success
      ? (validatedOptions?.contextWindowTokens ?? DEFAULT_MODEL_CONTEXT_WINDOW_TOKENS)
      : null,
    detail:
      configuredOptions.success
        ? "The configured AI provider handles resume extraction and tailoring. Structured JSON outputs are validated locally before they affect Job Finder state."
        : "The configured AI provider settings are invalid. Check the model and base URL before enabling model-backed resume extraction.",
  });

  async function fetchModelJson(
    systemPrompt: string,
    userPayload: unknown,
    options?: {
      timeoutMs?: number;
    },
  ): Promise<unknown> {
    if (!validatedOptions) {
      throw new Error(
        "The configured AI provider settings are invalid. Check the model and base URL before making model requests.",
      );
    }

    const controller = new AbortController();
    const timeoutMs =
      options?.timeoutMs ??
      validatedOptions.requestTimeoutMs ??
      DEFAULT_MODEL_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
    } catch (error) {
      throw normalizeTimeoutLikeError(error, timeoutMs);
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
          "For each experience, return workMode as an array such as ['remote'], ['hybrid'], or ['onsite']; do not return a nested object.",
          "Use professionalSummary for narrative rollups such as shortValueProposition, fullSummary, careerThemes, and strengths.",
          "Return notes only when the extraction is uncertain, incomplete, or needs user review; otherwise return an empty array.",
        ].join(" "),
        {
          existingProfile: input.existingProfile,
          existingSearchPreferences: input.existingSearchPreferences,
          resumeText: input.resumeText,
        },
        {
          timeoutMs:
            validatedOptions?.resumeExtractionTimeoutMs ??
            validatedOptions?.requestTimeoutMs ??
            DEFAULT_RESUME_EXTRACTION_TIMEOUT_MS,
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
    async extractResumeImportStage(input) {
      return extractOpenAiCompatibleResumeImportStage({
        stageInput: input,
        status,
        fetchModelJson,
        timeoutMs:
          validatedOptions?.resumeExtractionTimeoutMs ??
          validatedOptions?.requestTimeoutMs ??
          DEFAULT_RESUME_EXTRACTION_TIMEOUT_MS,
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
      const normalizedPayload =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const validatedPatches = Array.isArray(normalizedPayload.patches)
        ? normalizedPayload.patches.flatMap((patch) => {
            const parsedPatch = ResumeDraftPatchSchema.safeParse(patch);
            return parsedPatch.success ? [parsedPatch.data] : [];
          })
        : [];

      return ResumeAssistantReplySchema.parse({
        ...normalizedPayload,
        patches: validatedPatches,
        content:
          typeof normalizedPayload.content === "string" && normalizedPayload.content.trim().length > 0
            ? normalizedPayload.content
            : "I could not turn that request into a safe grounded edit, so no changes were applied.",
      });
    },
    async reviseCandidateProfile(input) {
      const payload = await fetchModelJson(
        [
          "You are a profile editing assistant.",
          "Return JSON only with content and typed patchGroups.",
          "Patch groups must use the provided bounded profile copilot operations only.",
          "Answer grounded factual questions directly when the request is asking what is already in the profile, even if no edit is needed.",
          "If no safe edit is needed, return patchGroups as an empty array and keep the content helpful, specific, and grounded in the provided profile facts.",
          "Do not invent candidate experience, credentials, dates, or metrics.",
          "Prefer no-op guidance over unsafe edits.",
          "If a change is broad, destructive, or ambiguous, mark the patch group applyMode as needs_review.",
        ].join(" "),
        input,
      );
      const normalizedPayload =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};

      return ProfileCopilotReplySchema.parse({
        ...normalizedPayload,
        content:
          typeof normalizedPayload.content === "string" && normalizedPayload.content.trim().length > 0
            ? normalizedPayload.content
            : "I could not turn that request into a safe structured profile change, so no profile edits were proposed.",
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
        input.pageType === "job_detail"
          ? Math.min(maxJobs, 1)
          : Math.min(maxJobs, SEARCH_RESULTS_MAX_MODEL_JOBS);
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
      const systemPrompt = buildJobsExtractionPrompt({
        pageHostLabel,
        pageType: input.pageType,
        effectiveMaxJobs,
      });
      const pageTextLimit =
        input.pageType === "search_results"
          ? SEARCH_RESULTS_EXTRACTION_PAGE_TEXT_LIMIT
          : JOB_DETAIL_EXTRACTION_PAGE_TEXT_LIMIT;
      const timeoutMs =
        input.pageType === "search_results"
          ? SEARCH_RESULTS_EXTRACTION_TIMEOUT_MS
          : DEFAULT_MODEL_TIMEOUT_MS;

      const payload = await fetchModelJson(systemPrompt, {
        pageUrl: input.pageUrl,
        pageText: input.pageText.slice(0, pageTextLimit),
      }, {
        timeoutMs,
      });

      return normalizeExtractedJobs({
        payload,
        pageHostLabel,
        pageUrl: input.pageUrl,
        pageType: input.pageType,
        effectiveMaxJobs,
      });
    },
    async chatWithTools(
      messages,
      tools,
      signal,
      options?: ChatWithToolsOptions,
    ) {
      if (!validatedOptions) {
        throw new Error(
          "The configured AI provider settings are invalid. Check the model and base URL before making model requests.",
        );
      }

      const controller = new AbortController();
      const timeoutMs =
        validatedOptions.requestTimeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS;
      let localTimedOut = false;
      const timeoutId = setTimeout(() => {
        localTimedOut = true;
        controller.abort();
      }, timeoutMs);

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
            ...(typeof options?.maxOutputTokens === "number"
              ? { max_tokens: options.maxOutputTokens }
              : {}),
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
      } catch (error) {
        if (localTimedOut) {
          throw normalizeTimeoutLikeError(error, timeoutMs);
        }

        throw error;
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
  const parsedRequestTimeoutMs = parseConfiguredTimeoutMs(
    env.UNEMPLOYED_AI_TIMEOUT_MS,
  );
  const parsedResumeExtractionTimeoutMs = parseConfiguredTimeoutMs(
    env.UNEMPLOYED_AI_RESUME_TIMEOUT_MS,
  );

  if (!apiKey) {
    return createDeterministicJobFinderAiClient();
  }

  const primaryClient = createOpenAiCompatibleJobFinderAiClient({
    apiKey,
    baseUrl: env.UNEMPLOYED_AI_BASE_URL ?? "https://ai.automatedpros.link/v1",
    model: env.UNEMPLOYED_AI_MODEL ?? "FelidaeAI-Pro-2.5",
    label: "AI resume agent",
    requestTimeoutMs: parsedRequestTimeoutMs,
    resumeExtractionTimeoutMs: parsedResumeExtractionTimeoutMs,
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
    async extractResumeImportStage(input) {
      const fallbackPromise = fallbackClient.extractResumeImportStage(input);

      try {
        const primary = await primaryClient.extractResumeImportStage(input);
        const fallback = await fallbackPromise;

        return {
          ...primary,
          candidates: [
            ...primary.candidates,
            ...fallback.candidates.map((candidate) => ({
              ...candidate,
              notes: [...candidate.notes, "deterministic_stage_fallback"],
            })),
          ],
          notes: uniqueStrings([...primary.notes, ...fallback.notes]),
        };
      } catch (error) {
        logFallbackError("extractResumeImportStage", error);
        const fallback = await fallbackPromise;
        return {
          ...fallback,
          notes: uniqueStrings([
            ...fallback.notes,
            "Fell back to the deterministic staged resume importer after the model call failed.",
            `Primary AI import stage failed: ${summarizeError(error)}`,
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
    async reviseCandidateProfile(input) {
      function shouldUseDeterministicProfileReply(
        primaryReply: ProfileCopilotReply,
        fallbackReply: ProfileCopilotReply,
      ): boolean {
        if (fallbackReply.patchGroups.length > primaryReply.patchGroups.length) {
          return true;
        }

        if (primaryReply.patchGroups.length > 0) {
          return false;
        }

        return /could not turn|guidance only|no profile edits were proposed/i.test(
          primaryReply.content,
        ) && fallbackReply.content.trim() !== primaryReply.content.trim();
      }

      try {
        const primaryReply = await primaryClient.reviseCandidateProfile(input);

        if (primaryReply.patchGroups.length === 0) {
          const fallbackReply = await fallbackClient.reviseCandidateProfile(input);

          if (shouldUseDeterministicProfileReply(primaryReply, fallbackReply)) {
            return fallbackReply;
          }
        }

        return primaryReply;
      } catch (error) {
        logFallbackError("reviseCandidateProfile", error);
        return fallbackClient.reviseCandidateProfile(input);
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
    async chatWithTools(
      messages,
      tools,
      signal,
      options?: ChatWithToolsOptions,
    ) {
      return primaryClient.chatWithTools(messages, tools, signal, options);
    },
  };
}
