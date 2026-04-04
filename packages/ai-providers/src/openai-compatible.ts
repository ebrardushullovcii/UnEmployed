import { AgentProviderStatusSchema, type ToolCall } from "@unemployed/contracts";
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

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
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
      const normalizedPayload =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};

      return ResumeAssistantReplySchema.parse({
        ...normalizedPayload,
        patches: Array.isArray(normalizedPayload.patches)
          ? normalizedPayload.patches
          : [],
        content:
          typeof normalizedPayload.content === "string" && normalizedPayload.content.trim().length > 0
            ? normalizedPayload.content
            : "I could not turn that request into a safe grounded edit, so no changes were applied.",
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
      const systemPrompt = buildJobsExtractionPrompt({
        pageHostLabel,
        pageType: input.pageType,
        effectiveMaxJobs,
      });

      const payload = await fetchModelJson(systemPrompt, {
        pageUrl: input.pageUrl,
        pageText: input.pageText.slice(0, 12000),
      });

      return normalizeExtractedJobs({
        payload,
        pageHostLabel,
        pageUrl: input.pageUrl,
        pageType: input.pageType,
        effectiveMaxJobs,
      });
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
