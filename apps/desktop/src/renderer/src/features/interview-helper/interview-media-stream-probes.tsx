import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Monitor, Radio } from "lucide-react";
import type {
  InterviewTranscriptSource,
  InterviewWorkspaceSnapshot,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";

type ProbeStatus = "idle" | "checking" | "available" | "unavailable" | "failed";
type RecorderStatus = "idle" | "starting" | "recording" | "stopping" | "failed";

function describeStatus(status: ProbeStatus, detail: string) {
  if (status === "idle") {
    return detail;
  }

  return `${status}: ${detail}`;
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
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
  sessionId: string;
  language: string;
  listening: boolean;
  onWorkspaceChange: (workspace: InterviewWorkspaceSnapshot) => void;
}) {
  const [microphoneStatus, setMicrophoneStatus] = useState<ProbeStatus>("idle");
  const [microphoneDetail, setMicrophoneDetail] = useState(
    "Not checked in this renderer.",
  );
  const [displayStatus, setDisplayStatus] = useState<ProbeStatus>("idle");
  const [displayDetail, setDisplayDetail] = useState(
    "Not checked in this renderer.",
  );
  const [recorderStatus, setRecorderStatus] = useState<RecorderStatus>("idle");
  const [recorderDetail, setRecorderDetail] = useState(
    "Transient audio transcription idle.",
  );
  const [activeRecorder, setActiveRecorder] = useState<{
    recorder: MediaRecorder;
    stream: MediaStream;
    source: Extract<InterviewTranscriptSource, "microphone" | "meeting_audio">;
    startedAt: string;
  } | null>(null);
  const activeRecorderRef = useRef<typeof activeRecorder>(null);

  useEffect(() => {
    activeRecorderRef.current = activeRecorder;
  }, [activeRecorder]);

  useEffect(() => {
    return () => {
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
      setMicrophoneStatus(audioTracks.length > 0 ? "available" : "unavailable");
      setMicrophoneDetail(
        audioTracks.length > 0
          ? `Temporary microphone stream opened with ${audioTracks.length} audio track${audioTracks.length === 1 ? "" : "s"} and was immediately stopped.`
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
      setDisplayStatus(audioTracks.length > 0 ? "available" : "unavailable");
      setDisplayDetail(
        audioTracks.length > 0
          ? `Temporary display stream exposed ${audioTracks.length} audio track${audioTracks.length === 1 ? "" : "s"} and was immediately stopped.`
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

  async function createRecorderStream(
    source: Extract<InterviewTranscriptSource, "microphone" | "meeting_audio">,
  ) {
    if (!navigator.mediaDevices) {
      throw new Error("navigator.mediaDevices is unavailable.");
    }

    if (source === "microphone") {
      if (!navigator.mediaDevices.getUserMedia) {
        throw new Error("navigator.mediaDevices.getUserMedia is unavailable.");
      }
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    if (!navigator.mediaDevices.getDisplayMedia) {
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

  async function startAudioTranscription(
    source: Extract<InterviewTranscriptSource, "microphone" | "meeting_audio">,
  ) {
    if (!props.listening) {
      setRecorderStatus("failed");
      setRecorderDetail(
        "Resume listening before starting transient audio transcription.",
      );
      return;
    }

    if (!("MediaRecorder" in window)) {
      setRecorderStatus("failed");
      setRecorderDetail("MediaRecorder is unavailable in this renderer.");
      return;
    }

    setRecorderStatus("starting");
    setRecorderDetail(
      `Requesting ${source.replaceAll("_", " ")} stream for transient transcription.`,
    );

    try {
      const stream = await createRecorderStream(source);
      const mimeType = selectSupportedAudioMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const startedAt = new Date().toISOString();

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) {
          return;
        }

        void event.data.arrayBuffer().then((buffer) =>
          window.unemployed.interviewHelper
            .transcribeAudioChunk({
              sessionId: props.sessionId,
              source,
              mimeType: event.data.type || mimeType || "audio/webm",
              audioBase64: toBase64(buffer),
              startedAt,
              endedAt: new Date().toISOString(),
              language: props.language,
            })
            .then(props.onWorkspaceChange)
            .catch((error: unknown) => {
              setRecorderStatus("failed");
              setRecorderDetail(
                error instanceof Error
                  ? error.message
                  : "Audio transcription failed.",
              );
            }),
        );
      };
      recorder.onstop = () => {
        stopStream(stream);
        setActiveRecorder(null);
        setRecorderStatus("idle");
        setRecorderDetail("Transient audio transcription stopped.");
      };

      recorder.start(5000);
      setActiveRecorder({ recorder, stream, source, startedAt });
      setRecorderStatus("recording");
      setRecorderDetail(
        `${source.replaceAll("_", " ")} audio is recording in transient 5s chunks.`,
      );
    } catch (error) {
      setActiveRecorder(null);
      setRecorderStatus("failed");
      setRecorderDetail(
        error instanceof Error
          ? error.message
          : "Audio transcription recorder failed.",
      );
    }
  }

  function stopAudioTranscription() {
    if (!activeRecorder) {
      return;
    }

    setRecorderStatus("stopping");
    setRecorderDetail(
      `Stopping ${activeRecorder.source.replaceAll("_", " ")} transcription.`,
    );
    activeRecorder.recorder.stop();
  }

  return (
    <div className="grid gap-2 rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
      <div className="grid gap-1">
        <p className="text-[0.82rem]">Media stream probes</p>
        <p className="text-[0.72rem] leading-5 text-muted-foreground">
          Temporary checks stop their streams immediately and do not retain raw
          audio.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
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
          Check mic
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
          Check system
        </Button>
      </div>
      <div className="grid gap-1 text-[0.72rem] leading-5 text-muted-foreground">
        <p>{describeStatus(microphoneStatus, microphoneDetail)}</p>
        <p>{describeStatus(displayStatus, displayDetail)}</p>
      </div>
      <div className="grid gap-2 border-t border-border-subtle pt-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            disabled={
              !props.listening ||
              recorderStatus === "starting" ||
              recorderStatus === "recording"
            }
            onClick={() => {
              void startAudioTranscription("microphone");
            }}
            pending={recorderStatus === "starting"}
            size="compact"
            variant="secondary"
          >
            <Radio className="size-4" />
            Mic STT
          </Button>
          <Button
            disabled={
              !props.listening ||
              recorderStatus === "starting" ||
              recorderStatus === "recording"
            }
            onClick={() => {
              void startAudioTranscription("meeting_audio");
            }}
            pending={recorderStatus === "starting"}
            size="compact"
            variant="secondary"
          >
            <Monitor className="size-4" />
            System STT
          </Button>
          <Button
            disabled={!activeRecorder || recorderStatus === "stopping"}
            onClick={stopAudioTranscription}
            pending={recorderStatus === "stopping"}
            size="compact"
            variant="outline"
          >
            {activeRecorder ? (
              <MicOff className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
            Stop STT
          </Button>
        </div>
        <p className="text-[0.72rem] leading-5 text-muted-foreground">
          {recorderDetail}
        </p>
      </div>
    </div>
  );
}
