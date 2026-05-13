import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  InterviewAudioTranscriptionInput,
  InterviewCueCard,
  InterviewCueInputDisclosure,
  InterviewCueTriggerKind,
  InterviewTranscriptionEngineKind,
  InterviewTranscriptionEngine,
  InterviewTranscriptSegment,
  InterviewVisualObservation,
} from "@unemployed/contracts";
import { InterviewCueCardSchema } from "@unemployed/contracts";
import { z } from "zod";
import {
  buildAudioTranscriptionsUrl,
  buildChatCompletionsUrl,
  parseModelJsonResponse,
} from "./openai-compatible-transport";

const execFileAsync = promisify(execFile);

export interface InterviewCueCardRequest {
  readonly sessionId: string;
  readonly triggerKind: InterviewCueTriggerKind;
  readonly question: string;
  readonly targetLabel: string;
  readonly targetContextKind: InterviewCueInputDisclosure["targetContextKind"];
  readonly transcriptSegments: readonly InterviewTranscriptSegment[];
  readonly visualObservations: readonly InterviewVisualObservation[];
  readonly disclosure: InterviewCueInputDisclosure;
  readonly createdAt: string;
}

export interface InterviewCueCardProvider {
  getStatus(): {
    ready: boolean;
    label: string;
    detail: string | null;
  };
  generateCueCard(input: InterviewCueCardRequest): Promise<InterviewCueCard>;
}

export interface InterviewSummaryProvider {
  summarize(input: {
    previousSummary: string;
    transcriptSegments: readonly InterviewTranscriptSegment[];
    cueCards: readonly InterviewCueCard[];
  }): Promise<string>;
}

export interface InterviewScreenshotVisionProvider {
  getStatus(): {
    ready: boolean;
    label: string;
    detail: string | null;
  };
  describeScreenshotBatch(input: {
    batchId: string;
    screenshotCount: number;
    overlayContaminated: boolean;
    images?: ReadonlyArray<{
      readonly mimeType: string;
      readonly base64: string;
    }>;
    createdAt: string;
  }): Promise<readonly InterviewVisualObservation[]>;
}

export interface InterviewTranscriptionProvider {
  getEngines(): {
    microphone: InterviewTranscriptionEngine;
    meetingAudio: InterviewTranscriptionEngine;
  };
  transcribeAudioChunk?(
    input: InterviewAudioTranscriptionInput,
  ): Promise<InterviewAudioTranscriptionResult | null>;
  createSampleSegments(input: {
    sessionId: string;
    createdAt: string;
    language: string;
  }): readonly InterviewTranscriptSegment[];
}

export interface InterviewAudioTranscriptionResult {
  readonly text: string;
  readonly confidence: number | null;
  readonly language: string;
  readonly engineKind: InterviewTranscriptionEngineKind;
}

const InterviewModelCueCardOutputSchema = z.object({
  title: z.string().trim().min(1),
  answerOutline: z.array(z.string().trim().min(1)).min(1).max(5),
  supportingPoints: z.array(z.string().trim().min(1)).max(6).default([]),
  clarifyingQuestion: z.string().trim().min(1).nullable().default(null),
  avoidSaying: z.string().trim().min(1).nullable().default(null),
  expandedContent: z.string().trim().min(1).nullable().default(null),
});

function normalizeVisualConfidence(value: unknown) {
  if (typeof value === "number") {
    if (value >= 0.75) return "high";
    if (value >= 0.4) return "medium";
    return "low";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "high" ||
      normalized === "medium" ||
      normalized === "low"
    ) {
      return normalized;
    }
  }

  return "medium";
}

const InterviewModelVisualObservationSchema = z.object({
  summary: z.string().trim().min(1),
  confidence: z.preprocess(
    normalizeVisualConfidence,
    z.enum(["low", "medium", "high"]).default("medium"),
  ),
});

const InterviewModelVisualObservationListSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { observations: value } : value),
  z.object({
    observations: z.array(InterviewModelVisualObservationSchema).min(1).max(4),
  }),
);

const OpenAiCompatibleInterviewProviderOptionsSchema = z.object({
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  model: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  requestTimeoutMs: z.number().int().min(1_000).optional(),
});

const LocalCommandInterviewTranscriptionProviderOptionsSchema = z.object({
  command: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  requestTimeoutMs: z.number().int().min(1_000).optional(),
  workingDirectory: z.string().trim().min(1).optional(),
});

const AudioTranscriptionResponseSchema = z.object({
  text: z.string().trim().min(1),
  language: z.string().trim().min(1).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type OpenAiCompatibleInterviewProviderOptions = z.infer<
  typeof OpenAiCompatibleInterviewProviderOptionsSchema
>;
export type LocalCommandInterviewTranscriptionProviderOptions = z.infer<
  typeof LocalCommandInterviewTranscriptionProviderOptionsSchema
>;

export interface InterviewHelperProviderBundle {
  readonly cueCardProvider: InterviewCueCardProvider;
  readonly screenshotVisionProvider: InterviewScreenshotVisionProvider;
  readonly transcriptionProvider: InterviewTranscriptionProvider;
  readonly summaryProvider: InterviewSummaryProvider;
}

const DEFAULT_INTERVIEW_MODEL_TIMEOUT_MS = 30_000;
const DEFAULT_INTERVIEW_MODEL = "FelidaeAI-Pro-2.7";
const DEFAULT_INTERVIEW_BASE_URL = "https://ai.automatedpros.link/v1";

function pickQuestion(input: InterviewCueCardRequest): string {
  const latestMeetingQuestion = [...input.transcriptSegments]
    .reverse()
    .find(
      (segment) =>
        segment.source === "meeting_audio" ||
        segment.source === "meeting_native_transcript",
    );

  return latestMeetingQuestion?.text ?? input.question;
}

function parseConfiguredTimeoutMs(
  value: string | undefined,
): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : undefined;
}

function normalizeAbortLikeError(error: unknown, timeoutMs: number): unknown {
  const message = error instanceof Error ? error.message.trim() : "";
  const isAbortLikeMessage =
    message === "This operation was aborted" ||
    message === "The operation was aborted" ||
    message === "signal is aborted without reason";

  if (error instanceof DOMException && error.name === "AbortError") {
    return new DOMException(
      `Interview model request timed out after ${Math.floor(timeoutMs / 1000)}s`,
      "AbortError",
    );
  }

  if (error instanceof Error && error.name === "AbortError") {
    const abortError = new Error(
      `Interview model request timed out after ${Math.floor(timeoutMs / 1000)}s`,
    );
    abortError.name = "AbortError";
    return abortError;
  }

  if (isAbortLikeMessage) {
    const abortError = new Error(
      `Interview model request timed out after ${Math.floor(timeoutMs / 1000)}s`,
    );
    abortError.name = "AbortError";
    return abortError;
  }

  return error;
}

function summarizeError(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message.trim()
    : "Unknown provider failure";
}

function buildCueCardPrompt(): string {
  return [
    "You generate concise live interview cue cards.",
    "Return JSON only with title, answerOutline, supportingPoints, clarifyingQuestion, avoidSaying, and expandedContent.",
    "Keep the cue speakable while someone is in an interview.",
    "Ground every claim in the provided target context, prep artifacts, transcript window, and visual observations.",
    "Never invent candidate employers, achievements, metrics, credentials, tools, links, or external actions.",
    "For coding interviews, explain reasoning, edge cases, tradeoffs, and clarifying questions, but never instruct the app to operate an editor, browser, meeting tool, or coding platform.",
    "If visual context is marked overlay-contaminated, ignore Interview Helper UI and mention uncertainty only when it matters.",
    "Prefer 2-4 answer outline bullets and 2-4 supporting points.",
  ].join(" ");
}

function buildCueCardPayload(input: InterviewCueCardRequest) {
  return {
    trigger: {
      kind: input.triggerKind,
      question: pickQuestion(input),
      createdAt: input.createdAt,
    },
    targetContext: {
      label: input.targetLabel,
      kind: input.targetContextKind,
    },
    disclosure: input.disclosure,
    transcriptWindow: input.transcriptSegments.map((segment) => ({
      source: segment.source,
      state: segment.state,
      text: segment.text,
      language: segment.language,
      confidence: segment.confidence,
      engineKind: segment.engineKind,
    })),
    visualObservations: input.visualObservations.map((observation) => ({
      summary: observation.summary,
      confidence: observation.confidence,
      source: observation.source,
    })),
  };
}

function buildScreenshotVisionPrompt(): string {
  return [
    "Describe screenshots for live interview assistance.",
    "Return JSON only with observations: an array of 1-4 items, each with summary and confidence.",
    "Focus on visible meeting content, coding prompts, diagrams, error messages, or text that helps answer the interviewer.",
    "Do not include selectors, click instructions, app-control directions, hidden workflow rules, or final-submit guidance.",
    "If the image includes Interview Helper overlays or cue cards, ignore that UI and summarize only the underlying interview context.",
  ].join(" ");
}

function buildScreenshotVisionPayload(input: {
  batchId: string;
  screenshotCount: number;
  overlayContaminated: boolean;
  createdAt: string;
}) {
  return {
    batchId: input.batchId,
    screenshotCount: input.screenshotCount,
    overlayContaminated: input.overlayContaminated,
    createdAt: input.createdAt,
  };
}

export function createOpenAiCompatibleInterviewCueCardProvider(
  options: OpenAiCompatibleInterviewProviderOptions,
): InterviewCueCardProvider {
  const configured =
    OpenAiCompatibleInterviewProviderOptionsSchema.safeParse(options);
  const validatedOptions = configured.success ? configured.data : null;
  const label =
    validatedOptions?.label ?? options.label ?? "AI interview cue provider";
  const deterministicFallback = createDeterministicInterviewCueCardProvider(
    "Model-backed Interview Helper cues are configured, with deterministic fallback on provider failure.",
  );

  async function fetchCueCard(
    input: InterviewCueCardRequest,
  ): Promise<unknown> {
    if (!validatedOptions) {
      throw new Error(
        "The configured Interview Helper model provider settings are invalid.",
      );
    }

    const timeoutMs =
      validatedOptions.requestTimeoutMs ?? DEFAULT_INTERVIEW_MODEL_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        buildChatCompletionsUrl(validatedOptions.baseUrl),
        {
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
              { role: "system", content: buildCueCardPrompt() },
              {
                role: "user",
                content: JSON.stringify(buildCueCardPayload(input)),
              },
            ],
          }),
        },
      );

      return parseModelJsonResponse(response);
    } catch (error) {
      throw normalizeAbortLikeError(error, timeoutMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    getStatus() {
      return {
        ready: configured.success,
        label,
        detail: validatedOptions
          ? `Configured OpenAI-compatible Interview Helper cue provider using ${validatedOptions.model}.`
          : "Interview Helper model provider settings are invalid. Deterministic fallback can still validate the flow.",
      };
    },
    async generateCueCard(input) {
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const payload = await fetchCueCard(input);
          const modelCue = InterviewModelCueCardOutputSchema.parse(payload);

          return InterviewCueCardSchema.parse({
            id: `cue_${input.createdAt.replace(/\W/g, "_")}`,
            sessionId: input.sessionId,
            question: pickQuestion(input),
            triggerKind: input.triggerKind,
            disclosure: input.disclosure,
            createdAt: input.createdAt,
            ...modelCue,
          });
        } catch (error) {
          lastError = error;
        }
      }

      console.error(
        `[AI Provider] Interview Helper cue generation failed after one retry; falling back to deterministic provider. ${summarizeError(lastError)}`,
      );
      return deterministicFallback.generateCueCard(input);
    },
  };
}

export function createOpenAiCompatibleInterviewScreenshotVisionProvider(
  options: OpenAiCompatibleInterviewProviderOptions,
): InterviewScreenshotVisionProvider {
  const configured =
    OpenAiCompatibleInterviewProviderOptionsSchema.safeParse(options);
  const validatedOptions = configured.success ? configured.data : null;
  const label =
    validatedOptions?.label ??
    options.label ??
    "AI interview screenshot vision provider";
  const deterministicFallback =
    createDeterministicInterviewScreenshotVisionProvider(
      "Model-backed Interview Helper screenshot vision is configured, with deterministic fallback on provider failure.",
    );

  async function fetchVisualObservations(input: {
    batchId: string;
    screenshotCount: number;
    overlayContaminated: boolean;
    images?: ReadonlyArray<{
      readonly mimeType: string;
      readonly base64: string;
    }>;
    createdAt: string;
  }): Promise<unknown> {
    if (!validatedOptions) {
      throw new Error(
        "The configured Interview Helper screenshot vision provider settings are invalid.",
      );
    }

    if (!input.images || input.images.length === 0) {
      throw new Error("No screenshot image payload was available for vision.");
    }

    const timeoutMs =
      validatedOptions.requestTimeoutMs ?? DEFAULT_INTERVIEW_MODEL_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        buildChatCompletionsUrl(validatedOptions.baseUrl),
        {
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
              { role: "system", content: buildScreenshotVisionPrompt() },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(buildScreenshotVisionPayload(input)),
                  },
                  ...input.images.slice(0, 3).map((image) => ({
                    type: "image_url",
                    image_url: {
                      url: `data:${image.mimeType};base64,${image.base64}`,
                    },
                  })),
                ],
              },
            ],
          }),
        },
      );

      return parseModelJsonResponse(response);
    } catch (error) {
      throw normalizeAbortLikeError(error, timeoutMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    getStatus() {
      return {
        ready: configured.success,
        label,
        detail: validatedOptions
          ? `Configured OpenAI-compatible Interview Helper screenshot vision using ${validatedOptions.model}.`
          : "Interview Helper screenshot vision settings are invalid. Deterministic visual observations can still validate the flow.",
      };
    },
    async describeScreenshotBatch(input) {
      try {
        const payload = await fetchVisualObservations(input);
        const parsed = InterviewModelVisualObservationListSchema.parse(payload);

        return parsed.observations.map((observation, index) => ({
          id: `visual_${input.batchId}_${index + 1}`,
          summary: observation.summary,
          source: "screenshot" as const,
          confidence: observation.confidence,
          createdAt: input.createdAt,
        }));
      } catch (error) {
        console.error(
          `[AI Provider] Interview Helper screenshot vision failed; falling back to deterministic provider. ${summarizeError(error)}`,
        );
        return deterministicFallback.describeScreenshotBatch(input);
      }
    },
  };
}

function audioBase64ToBlob(input: InterviewAudioTranscriptionInput): Blob {
  const buffer = Buffer.from(input.audioBase64, "base64");
  return new Blob([buffer], {
    type: input.mimeType,
  });
}

function getAudioFileExtension(mimeType: string) {
  if (mimeType.includes("webm")) return ".webm";
  if (mimeType.includes("ogg")) return ".ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return ".mp3";
  if (mimeType.includes("wav")) return ".wav";
  if (mimeType.includes("mp4")) return ".m4a";
  return ".audio";
}

function splitCommandLine(command: string): readonly string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of command) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new Error("Local transcription command has an unterminated quote.");
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function replaceLocalCommandPlaceholders(
  value: string,
  input: {
    audioFilePath: string;
    outputFilePath: string;
    language: string;
    source: InterviewAudioTranscriptionInput["source"];
  },
) {
  return value
    .replaceAll("{audio}", input.audioFilePath)
    .replaceAll("{output}", input.outputFilePath)
    .replaceAll("{language}", input.language)
    .replaceAll("{source}", input.source);
}

function parseLocalTranscriptionOutput(
  output: string,
  language: string,
): Omit<InterviewAudioTranscriptionResult, "engineKind"> | null {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    const parsed = AudioTranscriptionResponseSchema.parse(
      JSON.parse(trimmed) as unknown,
    );
    return {
      text: parsed.text,
      confidence: parsed.confidence ?? null,
      language: parsed.language ?? language,
    };
  }

  return {
    text: trimmed,
    confidence: null,
    language,
  };
}

async function parseAudioTranscriptionResponse(
  response: Response,
): Promise<unknown> {
  const rawBody = await response.text();
  const payload =
    rawBody.length > 0
      ? (() => {
          try {
            return JSON.parse(rawBody) as unknown;
          } catch {
            return null;
          }
        })()
      : null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : `Audio transcription request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!payload) {
    throw new Error("Audio transcription returned a non-JSON response");
  }

  return payload;
}

export function createOpenAiCompatibleInterviewTranscriptionProvider(
  options: OpenAiCompatibleInterviewProviderOptions,
): InterviewTranscriptionProvider {
  const configured =
    OpenAiCompatibleInterviewProviderOptionsSchema.safeParse(options);
  const validatedOptions = configured.success ? configured.data : null;

  function createCloudEngine(label: string): InterviewTranscriptionEngine {
    return {
      kind: "cloud_ai",
      label,
      ready: configured.success,
      privacy: "cloud",
      cost: "metered",
      latency: "medium",
      detail: validatedOptions
        ? `Configured OpenAI-compatible audio transcription using ${validatedOptions.model}. Audio chunks are sent transiently and are not retained by Interview Helper.`
        : "Interview Helper audio transcription settings are invalid.",
    };
  }

  async function transcribeAudioChunk(
    input: InterviewAudioTranscriptionInput,
  ): Promise<InterviewAudioTranscriptionResult | null> {
    if (!validatedOptions) {
      return null;
    }

    const timeoutMs =
      validatedOptions.requestTimeoutMs ?? DEFAULT_INTERVIEW_MODEL_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const language = input.language ?? "en-US";
    const formData = new FormData();
    formData.set("model", validatedOptions.model);
    formData.set(
      "file",
      audioBase64ToBlob(input),
      `interview-${input.source}-${Date.now()}.webm`,
    );
    formData.set("language", language);

    try {
      const response = await fetch(
        buildAudioTranscriptionsUrl(validatedOptions.baseUrl),
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${validatedOptions.apiKey}`,
          },
          body: formData,
        },
      );
      const payload = await parseAudioTranscriptionResponse(response);
      const parsed = AudioTranscriptionResponseSchema.parse(payload);

      return {
        text: parsed.text,
        confidence: parsed.confidence ?? null,
        language: parsed.language ?? language,
        engineKind: "cloud_ai",
      };
    } catch (error) {
      throw normalizeAbortLikeError(error, timeoutMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    getEngines() {
      return {
        microphone: createCloudEngine("Cloud microphone transcription"),
        meetingAudio: createCloudEngine("Cloud meeting/system transcription"),
      };
    },
    transcribeAudioChunk,
    createSampleSegments() {
      return [];
    },
  };
}

export function createLocalCommandInterviewTranscriptionProvider(
  options: LocalCommandInterviewTranscriptionProviderOptions,
): InterviewTranscriptionProvider {
  const configured =
    LocalCommandInterviewTranscriptionProviderOptionsSchema.safeParse(options);
  const validatedOptions = configured.success ? configured.data : null;
  const label =
    validatedOptions?.label ?? options.label ?? "Local command transcription";
  const commandTokens = validatedOptions?.command
    ? splitCommandLine(validatedOptions.command)
    : [];
  const executable = commandTokens[0] ?? null;
  const commandArgs = commandTokens.slice(1);

  function createLocalEngine(
    engineLabel: string,
  ): InterviewTranscriptionEngine {
    return {
      kind: "local_model",
      label: engineLabel,
      ready: Boolean(validatedOptions && executable),
      privacy: "local",
      cost: "free",
      latency: "medium",
      detail: validatedOptions
        ? "Configured local transcription command. Audio chunks are written to a temporary file for the local engine and deleted after the command exits."
        : "Local transcription command settings are invalid.",
    };
  }

  async function transcribeAudioChunk(
    input: InterviewAudioTranscriptionInput,
  ): Promise<InterviewAudioTranscriptionResult | null> {
    if (!validatedOptions || !executable) {
      return null;
    }

    const timeoutMs =
      validatedOptions.requestTimeoutMs ?? DEFAULT_INTERVIEW_MODEL_TIMEOUT_MS;
    const language = input.language ?? "en-US";
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-interview-local-stt-"),
    );
    const audioFilePath = path.join(
      tempDirectory,
      `chunk${getAudioFileExtension(input.mimeType)}`,
    );
    const outputFilePath = path.join(tempDirectory, "transcript.txt");

    try {
      await writeFile(audioFilePath, Buffer.from(input.audioBase64, "base64"));
      const args = commandArgs.map((arg) =>
        replaceLocalCommandPlaceholders(arg, {
          audioFilePath,
          outputFilePath,
          language,
          source: input.source,
        }),
      );
      const { stdout } = await execFileAsync(executable, args, {
        cwd: validatedOptions.workingDirectory,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      const fallbackOutput = await readFile(outputFilePath, "utf8").catch(
        () => "",
      );
      const parsed = parseLocalTranscriptionOutput(
        stdout.trim().length > 0 ? stdout : fallbackOutput,
        language,
      );

      return parsed
        ? {
            ...parsed,
            engineKind: "local_model",
          }
        : null;
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  return {
    getEngines() {
      return {
        microphone: createLocalEngine(`${label} microphone transcription`),
        meetingAudio: createLocalEngine(
          `${label} meeting/system transcription`,
        ),
      };
    },
    transcribeAudioChunk,
    createSampleSegments() {
      return [];
    },
  };
}

export function createFallbackInterviewTranscriptionProvider(
  primary: InterviewTranscriptionProvider,
  fallback: InterviewTranscriptionProvider,
): InterviewTranscriptionProvider {
  function selectEngine(
    primaryEngine: InterviewTranscriptionEngine,
    fallbackEngine: InterviewTranscriptionEngine,
  ): InterviewTranscriptionEngine {
    if (primaryEngine.ready) {
      return {
        ...primaryEngine,
        detail: fallbackEngine.ready
          ? `${primaryEngine.detail ?? "Primary transcription engine is ready."} Fallback available: ${fallbackEngine.label}.`
          : primaryEngine.detail,
      };
    }

    return fallbackEngine;
  }

  return {
    getEngines() {
      const primaryEngines = primary.getEngines();
      const fallbackEngines = fallback.getEngines();
      return {
        microphone: selectEngine(
          primaryEngines.microphone,
          fallbackEngines.microphone,
        ),
        meetingAudio: selectEngine(
          primaryEngines.meetingAudio,
          fallbackEngines.meetingAudio,
        ),
      };
    },
    async transcribeAudioChunk(input) {
      try {
        const primaryResult = await primary.transcribeAudioChunk?.(input);
        if (primaryResult) {
          return primaryResult;
        }
      } catch (error) {
        if (!fallback.transcribeAudioChunk) {
          throw error;
        }
        console.error(
          `[AI Provider] Primary Interview Helper transcription failed; trying fallback provider. ${summarizeError(error)}`,
        );
      }

      return fallback.transcribeAudioChunk?.(input) ?? null;
    },
    createSampleSegments(input) {
      const primarySegments = primary.createSampleSegments(input);
      return primarySegments.length > 0
        ? primarySegments
        : fallback.createSampleSegments(input);
    },
  };
}

export function createDeterministicInterviewCueCardProvider(
  reason = "Deterministic Interview Helper cue provider keeps local validation stable.",
): InterviewCueCardProvider {
  return {
    getStatus() {
      return {
        ready: true,
        label: "Deterministic cue-card provider",
        detail: reason,
      };
    },
    generateCueCard(input) {
      const question = pickQuestion(input);
      const visualContext = input.visualObservations[0]?.summary ?? null;
      return Promise.resolve(
        InterviewCueCardSchema.parse({
          id: `cue_${input.createdAt.replace(/\W/g, "_")}`,
          sessionId: input.sessionId,
          title:
            input.targetContextKind === "general_interview"
              ? "Answer cue"
              : `Answer cue for ${input.targetLabel}`,
          question,
          answerOutline: [
            "Start with the direct trade-off or recommendation.",
            "Anchor the answer in a concrete example from your background.",
            "Close with how you would measure success or reduce risk.",
          ],
          supportingPoints: [
            "Clarify constraints before jumping into implementation details.",
            "Name the highest-impact option first, then mention alternatives.",
            visualContext
              ? `Use the visible context carefully: ${visualContext}`
              : "Keep the response transcript-grounded because no visual context is active.",
          ],
          clarifyingQuestion:
            "Would you like me to optimize for speed of delivery, reliability, or long-term maintainability?",
          avoidSaying:
            "Avoid claiming specific metrics or project outcomes that are not in your confirmed context.",
          expandedContent:
            "Frame the answer as a concise decision process: clarify constraints, choose the approach, explain why alternatives were not chosen, then describe validation.",
          triggerKind: input.triggerKind,
          disclosure: input.disclosure,
          createdAt: input.createdAt,
        }),
      );
    },
  };
}

export function createInterviewHelperProvidersFromEnvironment(
  env: Partial<Record<string, string | undefined>> = process.env,
): InterviewHelperProviderBundle {
  const apiKey =
    env.UNEMPLOYED_INTERVIEW_AI_API_KEY ?? env.UNEMPLOYED_AI_API_KEY;
  const requestTimeoutMs = parseConfiguredTimeoutMs(
    env.UNEMPLOYED_INTERVIEW_AI_TIMEOUT_MS ?? env.UNEMPLOYED_AI_TIMEOUT_MS,
  );
  const screenshotVisionProvider = apiKey
    ? createOpenAiCompatibleInterviewScreenshotVisionProvider({
        apiKey,
        baseUrl:
          env.UNEMPLOYED_INTERVIEW_AI_BASE_URL ??
          env.UNEMPLOYED_AI_VISION_BASE_URL ??
          env.UNEMPLOYED_AI_BASE_URL ??
          DEFAULT_INTERVIEW_BASE_URL,
        model:
          env.UNEMPLOYED_INTERVIEW_VISION_MODEL ??
          env.UNEMPLOYED_AI_VISION_MODEL ??
          env.UNEMPLOYED_RESUME_VISION_MODEL ??
          env.UNEMPLOYED_INTERVIEW_AI_MODEL ??
          env.UNEMPLOYED_AI_MODEL ??
          DEFAULT_INTERVIEW_MODEL,
        label: "AI interview screenshot vision provider",
        requestTimeoutMs,
      })
    : createDeterministicInterviewScreenshotVisionProvider();
  const deterministicTranscriptionProvider =
    createDeterministicInterviewTranscriptionProvider();
  const summaryProvider = createDeterministicInterviewSummaryProvider();
  const localTranscriptionProvider = env.UNEMPLOYED_INTERVIEW_LOCAL_STT_COMMAND
    ? createLocalCommandInterviewTranscriptionProvider({
        command: env.UNEMPLOYED_INTERVIEW_LOCAL_STT_COMMAND,
        label: env.UNEMPLOYED_INTERVIEW_LOCAL_STT_LABEL,
        requestTimeoutMs: parseConfiguredTimeoutMs(
          env.UNEMPLOYED_INTERVIEW_LOCAL_STT_TIMEOUT_MS,
        ),
        workingDirectory: env.UNEMPLOYED_INTERVIEW_LOCAL_STT_CWD,
      })
    : null;

  if (!apiKey) {
    return {
      cueCardProvider: createDeterministicInterviewCueCardProvider(),
      screenshotVisionProvider,
      transcriptionProvider:
        localTranscriptionProvider ?? deterministicTranscriptionProvider,
      summaryProvider,
    };
  }

  const providerOptions = {
    apiKey,
    baseUrl:
      env.UNEMPLOYED_INTERVIEW_AI_BASE_URL ??
      env.UNEMPLOYED_AI_BASE_URL ??
      DEFAULT_INTERVIEW_BASE_URL,
    model:
      env.UNEMPLOYED_INTERVIEW_AI_MODEL ??
      env.UNEMPLOYED_AI_MODEL ??
      DEFAULT_INTERVIEW_MODEL,
    requestTimeoutMs,
  };

  const cloudTranscriptionProvider =
    createOpenAiCompatibleInterviewTranscriptionProvider({
      ...providerOptions,
      label: "AI interview transcription provider",
    });

  return {
    cueCardProvider: createOpenAiCompatibleInterviewCueCardProvider({
      ...providerOptions,
      label: "AI interview cue provider",
    }),
    screenshotVisionProvider,
    transcriptionProvider: localTranscriptionProvider
      ? createFallbackInterviewTranscriptionProvider(
          localTranscriptionProvider,
          cloudTranscriptionProvider,
        )
      : cloudTranscriptionProvider,
    summaryProvider,
  };
}

export function createDeterministicInterviewSummaryProvider(): InterviewSummaryProvider {
  return {
    summarize(input) {
      const latestQuestion = [...input.transcriptSegments]
        .reverse()
        .find((segment) => segment.source === "meeting_audio")?.text;
      const cueCount = input.cueCards.length;
      const summaryParts = [
        input.previousSummary === "No summary yet."
          ? null
          : input.previousSummary,
        latestQuestion ? `Latest interviewer topic: ${latestQuestion}` : null,
        cueCount > 0
          ? `${cueCount} cue card${cueCount === 1 ? "" : "s"} generated.`
          : null,
      ].filter((part): part is string => Boolean(part));

      return Promise.resolve(summaryParts.join(" ") || "No summary yet.");
    },
  };
}

export function createDeterministicInterviewScreenshotVisionProvider(
  detail = "Local deterministic visual observations are used when no live vision provider is configured.",
): InterviewScreenshotVisionProvider {
  return {
    getStatus() {
      return {
        ready: true,
        label: "Deterministic screenshot vision",
        detail,
      };
    },
    describeScreenshotBatch(input) {
      return Promise.resolve([
        {
          id: `visual_${input.batchId}`,
          summary: input.overlayContaminated
            ? "Screenshot includes possible Interview Helper overlay content; ignore overlay UI and focus on the meeting or coding prompt underneath."
            : "Screenshot shows interview context for the next cue.",
          source: "deterministic",
          confidence: "medium",
          createdAt: input.createdAt,
        },
      ]);
    },
  };
}

export function createDeterministicInterviewTranscriptionProvider(): InterviewTranscriptionProvider {
  const engine = {
    kind: "deterministic",
    label: "Deterministic local transcript",
    ready: true,
    privacy: "local",
    cost: "free",
    latency: "low",
    detail:
      "Synthetic transcript engine used for automated validation when live audio hardware is unavailable.",
  } satisfies InterviewTranscriptionEngine;

  return {
    getEngines() {
      return {
        microphone: engine,
        meetingAudio: {
          ...engine,
          label: "Deterministic meeting transcript",
        },
      };
    },
    createSampleSegments(input) {
      return [
        {
          id: `segment_meeting_${input.createdAt.replace(/\W/g, "_")}`,
          sessionId: input.sessionId,
          source: "meeting_audio",
          state: "final",
          text: "Can you walk me through how you would optimize a React application that has slow initial load time?",
          startedAt: input.createdAt,
          endedAt: input.createdAt,
          language: input.language,
          confidence: 0.96,
          engineKind: "deterministic",
          usedInCueIds: [],
        },
        {
          id: `segment_mic_${input.createdAt.replace(/\W/g, "_")}`,
          sessionId: input.sessionId,
          source: "microphone",
          state: "final",
          text: "I would start by measuring bundle size and identifying the largest render-blocking work.",
          startedAt: input.createdAt,
          endedAt: input.createdAt,
          language: input.language,
          confidence: 0.94,
          engineKind: "deterministic",
          usedInCueIds: [],
        },
      ];
    },
  };
}
