import { describe, expect, test, vi } from "vitest";
import {
  createInterviewHelperProvidersFromEnvironment,
  createOpenAiCompatibleInterviewCueCardProvider,
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
        "[AI Provider] Interview Helper cue generation failed; falling back to deterministic provider. upstream cue failure",
      );
    } finally {
      restoreFetch();
      errorSpy.mockRestore();
    }
  });

  test("uses shared AI credentials for Interview Helper cue providers", () => {
    const providers =
      createInterviewHelperProvidersFromEnvironment(createEnvironment());

    expect(providers.cueCardProvider.getStatus()).toMatchObject({
      ready: true,
      label: "AI interview cue provider",
    });
    expect(
      providers.transcriptionProvider.getEngines().meetingAudio,
    ).toMatchObject({
      kind: "cloud_ai",
      ready: true,
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
});
