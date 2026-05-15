import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  createInterviewHelperProvidersFromEnvironment,
  createLocalCommandInterviewTranscriptionProvider,
  createOpenAiCompatibleInterviewCueCardProvider,
  createOpenAiCompatibleInterviewScreenshotVisionProvider,
  createOpenAiCompatibleInterviewTranscriptionProvider,
  type InterviewCueCardRequest,
} from "./interview-helper";
import {
  createEnvironment,
  mockCapturingJsonFetch,
  mockJsonFetch,
  mockRejectedFetch,
} from "./test-fixtures";

function createCueRequest(): InterviewCueCardRequest {
  return {
    sessionId: "session_1",
    triggerKind: "automatic_question",
    question: "How would you reduce frontend load time?",
    targetLabel: "Frontend Engineer at Acme",
    targetContextKind: "saved_job",
    transcriptSegments: [
      {
        id: "segment_1",
        sessionId: "session_1",
        source: "meeting_audio",
        state: "final",
        text: "How would you reduce frontend load time?",
        startedAt: "2026-05-13T10:00:00.000Z",
        endedAt: "2026-05-13T10:00:03.000Z",
        language: "en-US",
        confidence: 0.95,
        engineKind: "platform_local",
        usedInCueIds: [],
      },
    ],
    visualObservations: [
      {
        id: "visual_1",
        summary: "A performance dashboard is visible.",
        source: "screenshot",
        confidence: "medium",
        createdAt: "2026-05-13T10:00:01.000Z",
      },
    ],
    disclosure: {
      transcriptWindow: "1 source-labeled segment",
      triggerSource: "meeting_audio",
      targetContextKind: "saved_job",
      screenshotCount: 1,
      overlayContaminated: false,
      degradedCapabilityIds: [],
      usedPartialTranscript: false,
    },
    createdAt: "2026-05-13T10:00:05.000Z",
  };
}

describe("Interview Helper AI providers", () => {
  test("uses configured OpenAI-compatible cue-card output when available", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Performance answer",
              answerOutline: [
                "Measure the startup path first.",
                "Split and defer low-priority work.",
              ],
              supportingPoints: ["Track bundle size and render blocking work."],
              clarifyingQuestion:
                "Is the bottleneck network, JS execution, or rendering?",
              avoidSaying: "Do not claim a specific percentage without data.",
              expandedContent:
                "Start with profiling, then optimize the critical path.",
            }),
          },
        },
      ],
    });

    try {
      const provider = createOpenAiCompatibleInterviewCueCardProvider({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      });
      const cue = await provider.generateCueCard(createCueRequest());

      expect(cue).toMatchObject({
        title: "Performance answer",
        question: "How would you reduce frontend load time?",
        triggerKind: "automatic_question",
      });
      expect(cue.answerOutline).toContain("Measure the startup path first.");
    } finally {
      restoreFetch();
    }
  });

  test("normalizes array cue fields returned by the model", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Array-shaped cue",
              answerOutline: "Start with the observed bottleneck.",
              supportingPoints: [
                "Mention measurement first.",
                "Tie the fix to the transcript.",
              ],
              clarifyingQuestion: ["Which path is slowest?"],
              avoidSaying: [
                "Do not invent benchmark numbers.",
                "Do not claim tools not in context.",
              ],
              expandedContent: ["Profile, prioritize, then validate."],
            }),
          },
        },
      ],
    });

    try {
      const provider = createOpenAiCompatibleInterviewCueCardProvider({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      });
      const cue = await provider.generateCueCard(createCueRequest());

      expect(cue.title).toBe("Array-shaped cue");
      expect(cue.answerOutline).toEqual([
        "Start with the observed bottleneck.",
      ]);
      expect(cue.clarifyingQuestion).toBe("Which path is slowest?");
      expect(cue.avoidSaying).toBe(
        "Do not invent benchmark numbers.; Do not claim tools not in context.",
      );
      expect(cue.expandedContent).toBe("Profile, prioritize, then validate.");
    } finally {
      restoreFetch();
    }
  });

  test("retries cue-card generation once before falling back", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("temporary cue outage"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Recovered cue",
                    answerOutline: ["Recover by retrying once."],
                    supportingPoints: ["Keep the live session moving."],
                    clarifyingQuestion: null,
                    avoidSaying: null,
                    expandedContent: null,
                  }),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    globalThis.fetch = fetchMock;

    try {
      const provider = createOpenAiCompatibleInterviewCueCardProvider({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      });
      const cue = await provider.generateCueCard(createCueRequest());

      expect(cue.title).toBe("Recovered cue");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("sends bounded cue context instead of a raw transcript blob", async () => {
    const capture = mockCapturingJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Bounded cue",
              answerOutline: ["Answer directly from the transcript window."],
              supportingPoints: [],
              clarifyingQuestion: null,
              avoidSaying: null,
              expandedContent: null,
            }),
          },
        },
      ],
    });

    try {
      const provider = createOpenAiCompatibleInterviewCueCardProvider({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      });

      await provider.generateCueCard(createCueRequest());

      const body = JSON.parse(capture.getCapturedBody()) as {
        messages?: Array<{ content?: string }>;
      };
      const userPayload = JSON.parse(body.messages?.[1]?.content ?? "{}") as {
        transcriptWindow?: Array<{ text?: string }>;
        rawTranscript?: string;
      };

      expect(userPayload.rawTranscript).toBeUndefined();
      expect(userPayload.transcriptWindow).toEqual([
        expect.objectContaining({
          source: "meeting_audio",
          state: "final",
          text: "How would you reduce frontend load time?",
        }),
      ]);
    } finally {
      capture.restore();
    }
  });

  test("falls back to deterministic cue cards when the configured provider fails", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const restoreFetch = mockRejectedFetch(new Error("upstream cue failure"));

    try {
      const provider = createOpenAiCompatibleInterviewCueCardProvider({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "test-model",
      });
      const cue = await provider.generateCueCard(createCueRequest());

      expect(cue.title).toBe("Answer cue for Frontend Engineer at Acme");
      expect(errorSpy).toHaveBeenCalledWith(
        "[AI Provider] Interview Helper cue generation failed after one retry; falling back to deterministic provider. upstream cue failure",
      );
    } finally {
      restoreFetch();
      errorSpy.mockRestore();
    }
  });

  test("uses shared AI credentials for Interview Helper cue providers without assuming STT", () => {
    const providers =
      createInterviewHelperProvidersFromEnvironment(createEnvironment());

    expect(providers.cueCardProvider.getStatus()).toMatchObject({
      ready: true,
      label: "AI interview cue provider",
    });
    expect(providers.screenshotVisionProvider.getStatus()).toMatchObject({
      ready: true,
      label: "AI interview screenshot vision provider",
    });
    expect(
      providers.transcriptionProvider.getEngines().meetingAudio,
    ).toMatchObject({
      kind: "deterministic",
      ready: true,
    });
  });

  test("uses an explicit Interview Helper STT model for audio transcription", () => {
    const providers = createInterviewHelperProvidersFromEnvironment(
      createEnvironment({
        UNEMPLOYED_INTERVIEW_STT_MODEL: "whisper-test",
      }),
    );

    expect(
      providers.transcriptionProvider.getEngines().meetingAudio,
    ).toMatchObject({
      kind: "cloud_ai",
      ready: true,
      label: "Cloud meeting/system transcription",
    });
  });

  test("uses deterministic Interview Helper providers without an API key", () => {
    const providers = createInterviewHelperProvidersFromEnvironment(
      createEnvironment({ UNEMPLOYED_AI_API_KEY: undefined }),
    );

    expect(providers.cueCardProvider.getStatus()).toMatchObject({
      ready: true,
      label: "Deterministic cue-card provider",
    });
    expect(providers.screenshotVisionProvider.getStatus()).toMatchObject({
      ready: true,
      label: "Deterministic screenshot vision",
    });
  });

  test("sends transient screenshots to the OpenAI-compatible vision endpoint", async () => {
    const capture = mockCapturingJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                summary:
                  "A system-design prompt about event ingestion is visible.",
                confidence: 0.98,
              },
            ]),
          },
        },
      ],
    });

    try {
      const provider = createOpenAiCompatibleInterviewScreenshotVisionProvider({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "vision-test",
      });
      const observations = await provider.describeScreenshotBatch({
        batchId: "batch_1",
        screenshotCount: 1,
        overlayContaminated: true,
        images: [{ mimeType: "image/png", base64: "aW1hZ2U=" }],
        createdAt: "2026-05-13T10:00:05.000Z",
      });

      expect(observations).toEqual([
        {
          id: "visual_batch_1_1",
          summary: "A system-design prompt about event ingestion is visible.",
          source: "screenshot",
          confidence: "high",
          createdAt: "2026-05-13T10:00:05.000Z",
        },
      ]);
      expect(capture.getCapturedBody()).toContain(
        "data:image/png;base64,aW1hZ2U=",
      );
      expect(capture.getCapturedBody()).toContain("vision-test");
    } finally {
      capture.restore();
    }
  });

  test("sends transient audio chunks to the OpenAI-compatible transcription endpoint", async () => {
    const capture = mockCapturingJsonFetch({
      text: "How would you structure a live transcript pipeline?",
      language: "en",
      confidence: 0.88,
    });

    try {
      const provider = createOpenAiCompatibleInterviewTranscriptionProvider({
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        model: "whisper-test",
      });
      const result = await provider.transcribeAudioChunk?.({
        sessionId: "session_1",
        source: "meeting_audio",
        mimeType: "audio/webm",
        audioBase64: "dGVzdCBhdWRpbw==",
        language: "en-US",
      });

      expect(result).toEqual({
        text: "How would you structure a live transcript pipeline?",
        language: "en",
        confidence: 0.88,
        engineKind: "cloud_ai",
      });
      expect(capture.getCapturedBody()).toContain("interview-meeting_audio");
      expect(capture.getCapturedBody()).toContain("whisper-test");
    } finally {
      capture.restore();
    }
  });

  test("uses a configured local command transcription provider without retaining audio", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "interview-local-stt-provider-"),
    );

    try {
      const scriptPath = path.join(tempDirectory, "transcribe.mjs");
      const markerPath = path.join(tempDirectory, "audio-path.txt");
      await writeFile(
        scriptPath,
        [
          "import { existsSync, writeFileSync } from 'node:fs';",
          "const [, , audioPath, outputPath, language, markerPath] = process.argv;",
          "writeFileSync(markerPath, audioPath);",
          "writeFileSync(outputPath, JSON.stringify({",
          "  text: existsSync(audioPath) ? 'Local command transcript' : '',",
          "  language,",
          "  confidence: 0.77",
          "}));",
        ].join("\n"),
        "utf8",
      );

      const provider = createLocalCommandInterviewTranscriptionProvider({
        command: `"${process.execPath}" "${scriptPath}" {audio} {output} {language} "${markerPath}"`,
        label: "Whisper local",
      });
      const result = await provider.transcribeAudioChunk?.({
        sessionId: "session_1",
        source: "microphone",
        mimeType: "audio/webm",
        audioBase64: "dGVzdCBhdWRpbw==",
        language: "en-US",
      });
      const audioPath = await readFile(markerPath, "utf8");

      expect(provider.getEngines().microphone).toMatchObject({
        kind: "local_model",
        ready: true,
        privacy: "local",
        cost: "free",
      });
      expect(result).toEqual({
        text: "Local command transcript",
        language: "en-US",
        confidence: 0.77,
        engineKind: "local_model",
      });
      expect(existsSync(audioPath)).toBe(false);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  test("prefers configured local transcription before cloud fallback", () => {
    const providers = createInterviewHelperProvidersFromEnvironment(
      createEnvironment({
        UNEMPLOYED_INTERVIEW_LOCAL_STT_COMMAND: `${process.execPath} --version`,
      }),
    );

    expect(
      providers.transcriptionProvider.getEngines().meetingAudio,
    ).toMatchObject({
      kind: "local_model",
      ready: true,
    });
  });
});
