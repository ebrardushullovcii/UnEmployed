import {
  AgentProviderStatusSchema,
  BrowserVisualAnalysisInputSchema,
  BrowserVisualObservationSetSchema,
  type AgentProviderStatus,
  type BrowserVisualAnalysisInput,
  type BrowserVisualObservationSet,
} from "@unemployed/contracts";
import { z } from "zod";
import {
  buildChatCompletionsUrl,
  parseModelJsonResponse,
} from "./openai-compatible-transport";

const DEFAULT_BROWSER_VISUAL_MODEL = "FelidaeAI-Omni-3.6";
const DEFAULT_BROWSER_VISUAL_BASE_URL = "https://ai.automatedpros.link/v1";
const DEFAULT_BROWSER_VISUAL_TIMEOUT_MS = 120_000;

export const OpenAiCompatibleBrowserVisualProviderOptionsSchema = z.object({
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  model: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  requestTimeoutMs: z.number().int().min(1_000).optional(),
});
export type OpenAiCompatibleBrowserVisualProviderOptions = z.infer<
  typeof OpenAiCompatibleBrowserVisualProviderOptionsSchema
>;

export interface BrowserVisualAnalysisProvider {
  getStatus(): AgentProviderStatus;
  analyzeBrowserVisualSnapshot(
    input: BrowserVisualAnalysisInput,
  ): Promise<BrowserVisualObservationSet>;
}

type StringMap = Record<string, string | undefined>;

function parseConfiguredNumber(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }

    const trimmed = entry.trim();
    return trimmed ? [trimmed] : [];
  });
}

function normalizeTimeoutLikeError(error: unknown, timeoutMs: number): unknown {
  const message = error instanceof Error ? error.message.trim() : "";
  const isAbortLikeMessage =
    message === "This operation was aborted" ||
    message === "The operation was aborted" ||
    message === "signal is aborted without reason";

  if (error instanceof DOMException && error.name === "AbortError") {
    return new DOMException(
      `Browser visual analysis timed out after ${Math.floor(timeoutMs / 1000)}s`,
      "AbortError",
    );
  }

  if (error instanceof Error && error.name === "AbortError") {
    const abortError = new Error(
      `Browser visual analysis timed out after ${Math.floor(timeoutMs / 1000)}s`,
    );
    abortError.name = "AbortError";
    return abortError;
  }

  if (isAbortLikeMessage) {
    const abortError = new Error(
      `Browser visual analysis timed out after ${Math.floor(timeoutMs / 1000)}s`,
    );
    abortError.name = "AbortError";
    return abortError;
  }

  return error;
}

function createObservationSetId(snapshotId: string): string {
  return `visual_observation_${snapshotId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function normalizeVisualPayload(input: {
  rawPayload: unknown;
  analysisInput: BrowserVisualAnalysisInput;
  status: AgentProviderStatus;
}): BrowserVisualObservationSet {
  const payload =
    input.rawPayload &&
    typeof input.rawPayload === "object" &&
    !Array.isArray(input.rawPayload)
      ? (input.rawPayload as Record<string, unknown>)
      : {};
  const base = {
    id:
      typeof payload.id === "string" && payload.id.trim()
        ? payload.id.trim()
        : createObservationSetId(input.analysisInput.snapshot.id),
    snapshotId: input.analysisInput.snapshot.id,
    observedAt: new Date().toISOString(),
    url: input.analysisInput.snapshot.url,
    purpose: input.analysisInput.snapshot.purpose,
    providerKind: input.status.kind,
    providerLabel: input.status.label,
  };
  const normalized = {
    ...payload,
    ...base,
    summary:
      typeof payload.summary === "string" && payload.summary.trim()
        ? payload.summary.trim()
        : null,
    blockers: toStringArray(payload.blockers),
    visibleControls: toStringArray(payload.visibleControls),
    jobCardClues: toStringArray(payload.jobCardClues),
    applyPathClues: toStringArray(payload.applyPathClues),
    fieldControls: toStringArray(payload.fieldControls),
    validationErrors: toStringArray(payload.validationErrors),
    buttonStates: toStringArray(payload.buttonStates),
    recoveryNotes: toStringArray(payload.recoveryNotes),
    uncertainty: toStringArray(payload.uncertainty),
    observations: Array.isArray(payload.observations) ? payload.observations : [],
    questionContexts: Array.isArray(payload.questionContexts)
      ? payload.questionContexts
      : [],
    reconciliations: Array.isArray(payload.reconciliations)
      ? payload.reconciliations
      : [],
    rejectedOutputReasons: toStringArray(payload.rejectedOutputReasons),
  };

  const parsed = BrowserVisualObservationSetSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  return BrowserVisualObservationSetSchema.parse({
    ...base,
    summary: null,
    rejectedOutputReasons: parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    }),
    uncertainty: [
      "The browser visual provider returned output that did not satisfy the safe observation schema.",
    ],
  });
}

function buildDeterministicObservationSet(input: {
  analysisInput: BrowserVisualAnalysisInput;
  status: AgentProviderStatus;
  extraUncertainty?: readonly string[];
}): BrowserVisualObservationSet {
  const context = input.analysisInput.context;
  const visibleText = context.visibleTextSample ?? "";
  const normalizedText = visibleText.toLowerCase();
  const blockers = [
    /\blog\s?in\b|\bsign\s?in\b|\bauthentication\b/.test(normalizedText)
      ? "Visible text suggests a sign-in or authentication blocker."
      : null,
    /\bcaptcha\b|\bverify you are human\b|\bsecurity check\b/.test(
      normalizedText,
    )
      ? "Visible text suggests a bot-protection or manual verification blocker."
      : null,
  ].filter((value): value is string => Boolean(value));
  const visibleControls = [
    /\bsearch\b/.test(normalizedText)
      ? "Visible text includes a search control or search area."
      : null,
    /\bfilter\b/.test(normalizedText)
      ? "Visible text includes a filter control or filter area."
      : null,
    /\bshow all\b|\bview all\b/.test(normalizedText)
      ? "Visible text includes a show-all or view-all control."
      : null,
  ].filter((value): value is string => Boolean(value));
  const jobCardClues = [
    /\bjob\b|\brole\b|\bposition\b|\bopening\b/.test(normalizedText)
      ? "Visible text includes job, role, position, or opening language."
      : null,
  ].filter((value): value is string => Boolean(value));
  const applyPathClues = [
    /\bapply\b/.test(normalizedText)
      ? "Visible text includes apply-entry language."
      : null,
  ].filter((value): value is string => Boolean(value));
  const fieldControls = [
    /\bresume\b|\bcv\b/.test(normalizedText)
      ? "Visible text includes a resume or CV field/control clue."
      : null,
    /\bupload\b|\battach\b/.test(normalizedText)
      ? "Visible text includes an upload or attachment control clue."
      : null,
  ].filter((value): value is string => Boolean(value));
  const validationErrors = [
    /\brequired\b|\berror\b|\binvalid\b/.test(normalizedText)
      ? "Visible text includes required/error/invalid validation language."
      : null,
  ].filter((value): value is string => Boolean(value));
  const summary =
    blockers[0] ??
    visibleControls[0] ??
    jobCardClues[0] ??
    applyPathClues[0] ??
    fieldControls[0] ??
    validationErrors[0] ??
    "Deterministic visual fallback found no strong visual clue in the provided text sample.";

  return BrowserVisualObservationSetSchema.parse({
    id: createObservationSetId(input.analysisInput.snapshot.id),
    snapshotId: input.analysisInput.snapshot.id,
    observedAt: new Date().toISOString(),
    url: input.analysisInput.snapshot.url,
    purpose: input.analysisInput.snapshot.purpose,
    providerKind: input.status.kind,
    providerLabel: input.status.label,
    summary,
    blockers,
    visibleControls,
    jobCardClues,
    applyPathClues,
    fieldControls,
    validationErrors,
    recoveryNotes:
      input.analysisInput.snapshot.warnings.length > 0
        ? input.analysisInput.snapshot.warnings
        : [],
    uncertainty: [
      ...(input.extraUncertainty ?? []),
      input.analysisInput.snapshot.dataUrl
        ? "Deterministic fallback did not inspect image pixels; it used page text and runtime metadata only."
        : "No image data was available for visual analysis.",
    ],
  });
}

export function createDeterministicBrowserVisualAnalysisProvider(
  detail = "Built-in deterministic browser visual fallback summarizes page text and runtime metadata without reading image pixels.",
): BrowserVisualAnalysisProvider {
  const status = AgentProviderStatusSchema.parse({
    kind: "deterministic",
    role: "vision",
    ready: true,
    label: "Deterministic browser visual analysis",
    model: null,
    baseUrl: null,
    modelContextWindowTokens: null,
    reservedHeadroomTokens: null,
    requestTimeoutMs: null,
    detail,
  });

  return {
    getStatus() {
      return status;
    },
    analyzeBrowserVisualSnapshot(input) {
      const analysisInput = BrowserVisualAnalysisInputSchema.parse(input);
      return Promise.resolve(
        buildDeterministicObservationSet({ analysisInput, status }),
      );
    },
  };
}

export function createOpenAiCompatibleBrowserVisualAnalysisProvider(
  options: OpenAiCompatibleBrowserVisualProviderOptions,
): BrowserVisualAnalysisProvider {
  const configuredOptions =
    OpenAiCompatibleBrowserVisualProviderOptionsSchema.safeParse(options);
  const validatedOptions = configuredOptions.success
    ? configuredOptions.data
    : null;
  const timeoutMs =
    validatedOptions?.requestTimeoutMs ?? DEFAULT_BROWSER_VISUAL_TIMEOUT_MS;
  const status = AgentProviderStatusSchema.parse({
    kind: "openai_compatible_vision",
    role: "vision",
    ready: configuredOptions.success,
    label: validatedOptions?.label ?? "Browser visual analysis",
    model: validatedOptions?.model ?? null,
    baseUrl: validatedOptions?.baseUrl ?? null,
    modelContextWindowTokens: null,
    reservedHeadroomTokens: null,
    requestTimeoutMs: configuredOptions.success ? timeoutMs : null,
    detail: configuredOptions.success
      ? "The configured vision provider classifies bounded browser screenshots into schema-validated observations only."
      : "The configured browser vision provider settings are invalid; deterministic visual fallback will be used.",
  });
  const fallback = createDeterministicBrowserVisualAnalysisProvider(
    "Deterministic browser visual fallback ran alongside the configured vision provider.",
  );

  async function fetchVisualJson(
    input: BrowserVisualAnalysisInput,
  ): Promise<unknown> {
    if (!validatedOptions) {
      throw new Error("The configured browser vision provider settings are invalid.");
    }

    const controller = new AbortController();
    const localTimeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "You classify a browser screenshot into safe structured observations.",
                "Return JSON only. Do not provide browser actions, selectors, generated answers, saved jobs, final submit advice, or site-specific workflow rules.",
                "Allowed content: blockers, visibleControls, jobCardClues, applyPathClues, fieldControls, validationErrors, buttonStates, questionContexts, recoveryNotes, uncertainty, observations, and reconciliations.",
                "Keep findings generic and descriptive; no CSS selectors, no click/fill/navigate instructions, and no final-submit guidance.",
              ].join(" "),
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    snapshot: {
                      id: input.snapshot.id,
                      purpose: input.snapshot.purpose,
                      mode: input.snapshot.mode,
                      url: input.snapshot.url,
                      pageTitle: input.snapshot.pageTitle,
                      label: input.snapshot.label,
                      warnings: input.snapshot.warnings,
                    },
                    context: input.context,
                    outputContract: {
                      summary: "short descriptive text or null",
                      blockers: "string[]",
                      visibleControls: "string[]",
                      jobCardClues: "string[]",
                      applyPathClues: "string[]",
                      fieldControls: "string[]",
                      validationErrors: "string[]",
                      buttonStates: "string[]",
                      recoveryNotes: "string[]",
                      uncertainty: "string[]",
                      observations:
                        "array of {kind,label,description,confidence,severity,tags}; no selectors/actions",
                      reconciliations:
                        "array of {targetKind,status,domSummary,visualSummary,confidence,recommendedHandling}; no actions",
                    },
                  }),
                },
                ...(input.snapshot.dataUrl
                  ? [
                      {
                        type: "image_url",
                        image_url: {
                          url: input.snapshot.dataUrl,
                          detail:
                            input.snapshot.mode === "full_page" ? "high" : "auto",
                        },
                      },
                    ]
                  : []),
              ],
            },
          ],
        }),
      });

      return parseModelJsonResponse(response);
    } catch (error) {
      throw normalizeTimeoutLikeError(error, timeoutMs);
    } finally {
      clearTimeout(localTimeoutId);
    }
  }

  return {
    getStatus() {
      return status;
    },
    async analyzeBrowserVisualSnapshot(input) {
      const analysisInput = BrowserVisualAnalysisInputSchema.parse(input);
      const fallbackResult = await fallback.analyzeBrowserVisualSnapshot(
        analysisInput,
      );

      if (!validatedOptions || !analysisInput.snapshot.dataUrl) {
        return fallbackResult;
      }

      try {
        const payload = await fetchVisualJson(analysisInput);
        const primary = normalizeVisualPayload({
          rawPayload: payload,
          analysisInput,
          status,
        });

        return BrowserVisualObservationSetSchema.parse({
          ...primary,
          blockers: [...primary.blockers, ...fallbackResult.blockers],
          visibleControls: [
            ...primary.visibleControls,
            ...fallbackResult.visibleControls,
          ],
          jobCardClues: [
            ...primary.jobCardClues,
            ...fallbackResult.jobCardClues,
          ],
          applyPathClues: [
            ...primary.applyPathClues,
            ...fallbackResult.applyPathClues,
          ],
          fieldControls: [
            ...primary.fieldControls,
            ...fallbackResult.fieldControls,
          ],
          validationErrors: [
            ...primary.validationErrors,
            ...fallbackResult.validationErrors,
          ],
          uncertainty: [...primary.uncertainty, ...fallbackResult.uncertainty],
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Browser visual provider failed.";

        return BrowserVisualObservationSetSchema.parse({
          ...fallbackResult,
          providerKind: status.kind,
          providerLabel: status.label,
          rejectedOutputReasons: [
            ...fallbackResult.rejectedOutputReasons,
            message,
          ],
          uncertainty: [
            ...fallbackResult.uncertainty,
            "Configured browser visual provider failed; deterministic visual fallback was used.",
          ],
        });
      }
    },
  };
}

export function createBrowserVisualAnalysisProviderFromEnvironment(
  env: StringMap = process.env,
): BrowserVisualAnalysisProvider {
  const apiKey =
    env.UNEMPLOYED_BROWSER_VISION_API_KEY ??
    env.UNEMPLOYED_AI_VISION_API_KEY ??
    env.UNEMPLOYED_AI_API_KEY;

  if (!apiKey) {
    return createDeterministicBrowserVisualAnalysisProvider();
  }

  return createOpenAiCompatibleBrowserVisualAnalysisProvider({
    apiKey,
    baseUrl:
      env.UNEMPLOYED_BROWSER_VISION_BASE_URL ??
      env.UNEMPLOYED_AI_VISION_BASE_URL ??
      env.UNEMPLOYED_AI_BASE_URL ??
      DEFAULT_BROWSER_VISUAL_BASE_URL,
    model:
      env.UNEMPLOYED_BROWSER_VISION_MODEL ??
      env.UNEMPLOYED_AI_VISION_MODEL ??
      DEFAULT_BROWSER_VISUAL_MODEL,
    label: "Browser visual analysis",
    requestTimeoutMs:
      parseConfiguredNumber(env.UNEMPLOYED_BROWSER_VISION_TIMEOUT_MS) ??
      DEFAULT_BROWSER_VISUAL_TIMEOUT_MS,
  });
}
