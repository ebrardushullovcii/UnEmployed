import type {
  InterviewCueCard,
  InterviewCueInputDisclosure,
  InterviewCueTriggerKind,
  InterviewTranscriptionEngine,
  InterviewTranscriptSegment,
  InterviewVisualObservation,
} from "@unemployed/contracts";
import { InterviewCueCardSchema } from "@unemployed/contracts";

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
    createdAt: string;
  }): Promise<readonly InterviewVisualObservation[]>;
}

export interface InterviewTranscriptionProvider {
  getEngines(): {
    microphone: InterviewTranscriptionEngine;
    meetingAudio: InterviewTranscriptionEngine;
  };
  createSampleSegments(input: {
    sessionId: string;
    createdAt: string;
  }): readonly InterviewTranscriptSegment[];
}

function pickQuestion(input: InterviewCueCardRequest): string {
  const latestMeetingQuestion = [...input.transcriptSegments]
    .reverse()
    .find((segment) => segment.source === "meeting_audio");

  return latestMeetingQuestion?.text ?? input.question;
}

export function createDeterministicInterviewCueCardProvider(
  reason =
    "Deterministic Interview Helper cue provider keeps local validation stable.",
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
      return Promise.resolve(InterviewCueCardSchema.parse({
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
      }));
    },
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
        input.previousSummary === "No summary yet." ? null : input.previousSummary,
        latestQuestion ? `Latest interviewer topic: ${latestQuestion}` : null,
        cueCount > 0 ? `${cueCount} cue card${cueCount === 1 ? "" : "s"} generated.` : null,
      ].filter((part): part is string => Boolean(part));

      return Promise.resolve(summaryParts.join(" ") || "No summary yet.");
    },
  };
}

export function createDeterministicInterviewScreenshotVisionProvider(): InterviewScreenshotVisionProvider {
  return {
    getStatus() {
      return {
        ready: true,
        label: "Deterministic screenshot vision",
        detail:
          "Local deterministic visual observations are used when no live vision provider is configured.",
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
          language: "en-US",
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
          language: "en-US",
          confidence: 0.94,
          engineKind: "deterministic",
          usedInCueIds: [],
        },
      ];
    },
  };
}
