import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Monitor, Radio } from "lucide-react";
import type { InterviewWorkspaceSnapshot } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";

type ProbeStatus = "idle" | "checking" | "available" | "unavailable" | "failed";
type CaptureStatus = "idle" | "starting" | "recording" | "stopping" | "failed";
const MIN_AUDIO_CHUNK_BYTES = 2048;
const AUDIO_SIGNAL_THRESHOLD = 0.015;

interface BrowserSpeechAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): BrowserSpeechAlternative;
}

interface BrowserSpeechRecognitionResultList {
  readonly length: number;
  item(index: number): BrowserSpeechRecognitionResult;
}

interface BrowserSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

function describeStatus(status: ProbeStatus, detail: string) {
  if (status === "idle") {
    return detail;
  }

  return `${status}: ${detail}`;
}

function getBrowserSpeechRecognitionConstructor() {
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return (
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
  );
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

async function measureAudioSignal(stream: MediaStream) {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextConstructor || stream.getAudioTracks().length === 0) {
    return null;
  }

  const audioContext = new AudioContextConstructor();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const samples = new Uint8Array(analyser.fftSize);
  let peak = 0;

  try {
    for (let sampleIndex = 0; sampleIndex < 18; sampleIndex += 1) {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      peak = Math.max(peak, Math.sqrt(sum / samples.length));
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
  } finally {
    source.disconnect();
    await audioContext.close();
  }

  return peak;
}

function toBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
}

function selectSupportedAudioMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];

  return (
    candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ??
    ""
  );
}

export function InterviewMediaStreamProbes(props: {
  sessionId?: string;
  language: string;
  listening: boolean;
  systemTranscriptionAvailable: boolean;
  onWorkspaceChange?: (workspace: InterviewWorkspaceSnapshot) => void;
}) {
  const [microphoneStatus, setMicrophoneStatus] = useState<ProbeStatus>("idle");
  const [microphoneDetail, setMicrophoneDetail] = useState(
    "Not checked in this renderer.",
  );
  const [displayStatus, setDisplayStatus] = useState<ProbeStatus>("idle");
  const [displayDetail, setDisplayDetail] = useState(
    "Not checked in this renderer.",
  );
  const [captionEnabled, setCaptionEnabled] = useState(false);
  const [captionStatus, setCaptionStatus] = useState<CaptureStatus>("idle");
  const [captionDetail, setCaptionDetail] = useState("Mic captions are off.");
  const [captionPreview, setCaptionPreview] = useState("");
  const [recorderStatus, setRecorderStatus] = useState<CaptureStatus>("idle");
  const [recorderDetail, setRecorderDetail] = useState(
    props.systemTranscriptionAvailable
      ? "System audio transcription is off."
      : "System audio transcription needs a configured STT engine.",
  );
  const [activeRecorder, setActiveRecorder] = useState<{
    recorder: MediaRecorder;
    stream: MediaStream;
    startedAt: string;
  } | null>(null);
  const activeRecorderRef = useRef<typeof activeRecorder>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const sessionIdRef = useRef(props.sessionId ?? null);
  const workspaceChangeRef = useRef(props.onWorkspaceChange);
  const languageRef = useRef(props.language);
  const listeningRef = useRef(props.listening);
  const captionEnabledRef = useRef(captionEnabled);
  const recognitionRunIdRef = useRef("");
  const uploadInFlightRef = useRef(false);

  useEffect(() => {
    activeRecorderRef.current = activeRecorder;
  }, [activeRecorder]);

  useEffect(() => {
    sessionIdRef.current = props.sessionId ?? null;
  }, [props.sessionId]);

  useEffect(() => {
    workspaceChangeRef.current = props.onWorkspaceChange;
  }, [props.onWorkspaceChange]);

  useEffect(() => {
    languageRef.current = props.language;
  }, [props.language]);

  useEffect(() => {
    listeningRef.current = props.listening;
  }, [props.listening]);

  useEffect(() => {
    captionEnabledRef.current = captionEnabled;
  }, [captionEnabled]);

  useEffect(() => {
    if (!props.systemTranscriptionAvailable && !activeRecorder) {
      setRecorderDetail(
        "System audio transcription needs UNEMPLOYED_INTERVIEW_STT_MODEL or UNEMPLOYED_INTERVIEW_LOCAL_STT_COMMAND.",
      );
    }
  }, [activeRecorder, props.systemTranscriptionAvailable]);

  useEffect(() => {
    if (!props.listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setCaptionStatus(captionEnabled ? "idle" : "stopping");
      setCaptionDetail(captionEnabled ? "Mic captions paused." : "Stopping mic captions.");
    }
  }, [captionEnabled, props.listening]);

  useEffect(() => {
    if (props.listening && captionEnabled && !recognitionRef.current) {
      const restart = window.setTimeout(() => {
        startMicCaptions();
      }, 0);
      return () => window.clearTimeout(restart);
    }

    return undefined;
  }, [captionEnabled, props.listening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;

      const recorderState = activeRecorderRef.current;
      if (!recorderState) {
        return;
      }
      if (recorderState.recorder.state !== "inactive") {
        recorderState.recorder.stop();
      } else {
        stopStream(recorderState.stream);
      }
    };
  }, []);

  async function checkMicrophoneStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneStatus("unavailable");
      setMicrophoneDetail(
        "navigator.mediaDevices.getUserMedia is unavailable.",
      );
      return;
    }

    setMicrophoneStatus("checking");
    setMicrophoneDetail("Requesting a temporary microphone stream.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const audioTracks = stream.getAudioTracks();
      const signalLevel = await measureAudioSignal(stream);
      const signalText =
        signalLevel === null
          ? "Audio level could not be measured."
          : signalLevel >= AUDIO_SIGNAL_THRESHOLD
            ? `Input signal detected (${signalLevel.toFixed(3)} peak).`
            : `No input signal detected (${signalLevel.toFixed(3)} peak); speak while testing.`;
      setMicrophoneStatus(audioTracks.length > 0 ? "available" : "unavailable");
      setMicrophoneDetail(
        audioTracks.length > 0
          ? `Temporary microphone stream opened with ${audioTracks.length} audio track${audioTracks.length === 1 ? "" : "s"} and was immediately stopped. ${signalText}`
          : "Temporary microphone stream opened without audio tracks.",
      );
      stopStream(stream);
    } catch (error) {
      setMicrophoneStatus("failed");
      setMicrophoneDetail(
        error instanceof Error
          ? error.message
          : "Microphone stream check failed.",
      );
    }
  }

  async function checkDisplayAudioStream() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setDisplayStatus("unavailable");
      setDisplayDetail(
        "navigator.mediaDevices.getDisplayMedia is unavailable.",
      );
      return;
    }

    setDisplayStatus("checking");
    setDisplayDetail("Requesting a temporary screen/system audio stream.");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });
      const audioTracks = stream.getAudioTracks();
      const signalLevel = await measureAudioSignal(stream);
      const signalText =
        signalLevel === null
          ? "Audio level could not be measured."
          : signalLevel >= AUDIO_SIGNAL_THRESHOLD
            ? `System audio signal detected (${signalLevel.toFixed(3)} peak).`
            : `No system audio signal detected (${signalLevel.toFixed(3)} peak); play audio while testing.`;
      setDisplayStatus(audioTracks.length > 0 ? "available" : "unavailable");
      setDisplayDetail(
        audioTracks.length > 0
          ? `Temporary display stream exposed ${audioTracks.length} audio track${audioTracks.length === 1 ? "" : "s"} and was immediately stopped. ${signalText}`
          : "Display capture completed, but no system audio track was exposed.",
      );
      stopStream(stream);
    } catch (error) {
      setDisplayStatus("failed");
      setDisplayDetail(
        error instanceof Error
          ? error.message
          : "Display/system audio stream check failed.",
      );
    }
  }

  function stopMicCaptions() {
    setCaptionEnabled(false);
    setCaptionStatus("stopping");
    setCaptionDetail("Stopping mic captions.");
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }

  function startMicCaptions() {
    if (!props.listening) {
      setCaptionStatus("failed");
      setCaptionDetail("Resume listening before starting mic captions.");
      return;
    }

    const SpeechRecognitionConstructor =
      getBrowserSpeechRecognitionConstructor();
    if (!SpeechRecognitionConstructor) {
      setCaptionStatus("failed");
      setCaptionDetail("Mic captions are unavailable in this renderer.");
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    recognitionRunIdRef.current = runId;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageRef.current;
    recognition.onresult = (event) => {
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results.item(index);
        const alternative = result.item(0);
        const text = alternative.transcript.trim();
        if (text.length === 0) {
          continue;
        }

        setCaptionPreview(text);

        if (!sessionIdRef.current || !workspaceChangeRef.current) {
          setCaptionDetail("Mic captions heard you. Preview is not saved until a session is running.");
          continue;
        }

        void window.unemployed.interviewHelper
          .addTranscriptSegment({
            sessionId: sessionIdRef.current,
            transcriptSegmentId: `browser_speech_${sessionIdRef.current}_${recognitionRunIdRef.current}_${index}`,
            source: "microphone",
            state: result.isFinal ? "final" : "stable_partial",
            text,
            language: languageRef.current,
            confidence: Number.isFinite(alternative.confidence)
              ? alternative.confidence
              : null,
            engineKind: "browser_speech",
          })
          .then(workspaceChangeRef.current);
      }
    };
    recognition.onerror = (event) => {
      setCaptionStatus("failed");
      setCaptionDetail(event.message || `Mic captions ${event.error}.`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (captionEnabledRef.current && listeningRef.current) {
        startMicCaptions();
      } else {
        setCaptionStatus("idle");
        setCaptionDetail(
          captionEnabledRef.current ? "Mic captions paused." : "Mic captions are off.",
        );
      }
    };

    recognitionRef.current = recognition;
    setCaptionEnabled(true);
    setCaptionStatus("recording");
    setCaptionPreview("");
    setCaptionDetail(
      props.sessionId
        ? "Mic captions listening. Speak and watch the transcript overlay."
        : "Mic captions listening. Speak and watch the preview here.",
    );

    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setCaptionEnabled(false);
      setCaptionStatus("failed");
      setCaptionDetail(
        error instanceof Error ? error.message : "Mic captions failed to start.",
      );
    }
  }

  async function createSystemAudioRecorderStream() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("navigator.mediaDevices.getDisplayMedia is unavailable.");
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });
    const audioTracks = displayStream.getAudioTracks();
    for (const track of displayStream.getVideoTracks()) {
      track.stop();
    }

    if (audioTracks.length === 0) {
      stopStream(displayStream);
      throw new Error("Display capture did not expose a system audio track.");
    }

    return new MediaStream(audioTracks);
  }

  async function startSystemAudioTranscription() {
    if (!props.listening) {
      setRecorderStatus("failed");
      setRecorderDetail("Resume listening before starting system audio.");
      return;
    }

    if (!props.systemTranscriptionAvailable) {
      setRecorderStatus("failed");
      setRecorderDetail(
        "System audio transcription needs UNEMPLOYED_INTERVIEW_STT_MODEL or UNEMPLOYED_INTERVIEW_LOCAL_STT_COMMAND.",
      );
      return;
    }

    if (!props.sessionId || !props.onWorkspaceChange) {
      setRecorderStatus("failed");
      setRecorderDetail("Start a session before recording system audio transcription.");
      return;
    }

    const sessionId = props.sessionId;
    const onWorkspaceChange = props.onWorkspaceChange;

    if (!("MediaRecorder" in window)) {
      setRecorderStatus("failed");
      setRecorderDetail("MediaRecorder is unavailable in this renderer.");
      return;
    }

    setRecorderStatus("starting");
    setRecorderDetail("Requesting system audio for transient transcription.");

    try {
      const stream = await createSystemAudioRecorderStream();
      const mimeType = selectSupportedAudioMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const startedAt = new Date().toISOString();
      let stoppedByFailure = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size < MIN_AUDIO_CHUNK_BYTES) {
          setRecorderDetail(
            "System audio is recording; waiting for a usable audio chunk.",
          );
          return;
        }

        if (uploadInFlightRef.current) {
          return;
        }

        uploadInFlightRef.current = true;
        void event.data
          .arrayBuffer()
          .then((buffer) =>
            window.unemployed.interviewHelper
              .transcribeAudioChunk({
                sessionId,
                source: "meeting_audio",
                mimeType: event.data.type || mimeType || "audio/webm",
                audioBase64: toBase64(buffer),
                startedAt,
                endedAt: new Date().toISOString(),
                language: props.language,
              })
              .then((workspace) => {
                onWorkspaceChange(workspace);
                const latestDiagnostic =
                  workspace.activeSession?.diagnostics.at(-1);
                if (
                  latestDiagnostic?.label === "Audio transcription failed" ||
                  latestDiagnostic?.label ===
                    "Audio transcription provider unavailable"
                ) {
                  throw new Error(
                    latestDiagnostic.detail ?? latestDiagnostic.label,
                  );
                }
              })
              .catch((error: unknown) => {
                stoppedByFailure = true;
                setRecorderStatus("failed");
                setRecorderDetail(
                  error instanceof Error
                    ? error.message
                    : "System audio transcription failed.",
                );
                if (recorder.state !== "inactive") {
                  recorder.stop();
                } else {
                  stopStream(stream);
                }
              })
              .finally(() => {
                uploadInFlightRef.current = false;
              }),
          )
          .catch((error: unknown) => {
            uploadInFlightRef.current = false;
            stoppedByFailure = true;
            setRecorderStatus("failed");
            setRecorderDetail(
              error instanceof Error
                ? error.message
                : "System audio chunk could not be read.",
            );
            if (recorder.state !== "inactive") {
              recorder.stop();
            } else {
              stopStream(stream);
            }
          });
      };
      recorder.onstop = () => {
        uploadInFlightRef.current = false;
        stopStream(stream);
        setActiveRecorder(null);
        if (!stoppedByFailure) {
          setRecorderStatus("idle");
          setRecorderDetail("System audio transcription stopped.");
        }
      };

      recorder.start(5000);
      setActiveRecorder({ recorder, stream, startedAt });
      setRecorderStatus("recording");
      setRecorderDetail("System audio is recording in transient 5s chunks.");
    } catch (error) {
      setActiveRecorder(null);
      setRecorderStatus("failed");
      setRecorderDetail(
        error instanceof Error
          ? error.message
          : "System audio recorder failed.",
      );
    }
  }

  function stopSystemAudioTranscription() {
    if (!activeRecorder) {
      return;
    }

    setRecorderStatus("stopping");
    setRecorderDetail("Stopping system audio transcription.");
    activeRecorder.recorder.stop();
  }

  function stopLiveAudio() {
    if (captionEnabled || recognitionRef.current) {
      stopMicCaptions();
    }
    if (activeRecorder) {
      stopSystemAudioTranscription();
    }
  }

  return (
    <div className="grid gap-2 rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
      <div className="grid gap-1">
        <p className="text-[0.82rem]">
          {props.sessionId ? "Live audio" : "Audio test"}
        </p>
        <p className="text-[0.72rem] leading-5 text-muted-foreground">
          {props.sessionId
            ? "Start mic captions to save your spoken words into the transcript overlay."
            : "Test mic captions before the interview. Preview text stays local here."}{" "}
          System audio needs a configured STT engine.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <Button
          disabled={microphoneStatus === "checking"}
          onClick={() => {
            void checkMicrophoneStream();
          }}
          pending={microphoneStatus === "checking"}
          size="compact"
          variant="secondary"
        >
          <Mic className="size-4" />
          Test mic
        </Button>
        <Button
          disabled={displayStatus === "checking"}
          onClick={() => {
            void checkDisplayAudioStream();
          }}
          pending={displayStatus === "checking"}
          size="compact"
          variant="secondary"
        >
          <Monitor className="size-4" />
          Test system
        </Button>
      </div>
      <div className="grid gap-1 text-[0.72rem] leading-5 text-muted-foreground">
        <p>{describeStatus(microphoneStatus, microphoneDetail)}</p>
        <p>{describeStatus(displayStatus, displayDetail)}</p>
      </div>
      <div className="grid gap-2 border-t border-border-subtle pt-2">
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <Button
            disabled={
              !props.listening ||
              captionStatus === "starting" ||
              captionStatus === "recording"
            }
            onClick={startMicCaptions}
            pending={captionStatus === "starting"}
            size="compact"
            variant="secondary"
          >
            <Radio className="size-4" />
            {props.sessionId ? "Start mic captions" : "Test mic captions"}
          </Button>
          <Button
            disabled={
              !props.listening ||
              !props.sessionId ||
              !props.systemTranscriptionAvailable ||
              recorderStatus === "starting" ||
              recorderStatus === "recording"
            }
            onClick={() => {
              void startSystemAudioTranscription();
            }}
            pending={recorderStatus === "starting"}
            size="compact"
            variant="secondary"
          >
            <Monitor className="size-4" />
            Start system audio
          </Button>
          <Button
            disabled={
              (!captionEnabled && !activeRecorder) ||
              captionStatus === "stopping" ||
              recorderStatus === "stopping"
            }
            onClick={stopLiveAudio}
            pending={
              captionStatus === "stopping" || recorderStatus === "stopping"
            }
            size="compact"
            variant="outline"
          >
            {captionEnabled || activeRecorder ? (
              <MicOff className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
            Stop audio
          </Button>
        </div>
        <div className="grid gap-1 text-[0.72rem] leading-5 text-muted-foreground">
          <p>{captionDetail}</p>
          {captionPreview ? (
            <p className="rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) p-2 text-(--info-text)">
              {captionPreview}
            </p>
          ) : null}
          <p>{recorderDetail}</p>
        </div>
      </div>
    </div>
  );
}
