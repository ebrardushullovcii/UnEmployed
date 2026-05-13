import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import type { InterviewWorkspaceSnapshot } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";

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

function getBrowserSpeechRecognitionConstructor() {
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

export function InterviewBrowserSpeechBridge(props: {
  sessionId: string;
  language: string;
  listening: boolean;
  onWorkspaceChange: (workspace: InterviewWorkspaceSnapshot) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [statusLabel, setStatusLabel] = useState("Browser speech idle");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const sessionIdRef = useRef(props.sessionId);
  const languageRef = useRef(props.language);
  const listeningRef = useRef(props.listening);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    sessionIdRef.current = props.sessionId;
  }, [props.sessionId]);

  useEffect(() => {
    languageRef.current = props.language;
  }, [props.language]);

  useEffect(() => {
    listeningRef.current = props.listening;
  }, [props.listening]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!props.listening) {
      recognitionRef.current?.stop();
      setStatusLabel(enabled ? "Browser speech paused" : "Browser speech idle");
    }
  }, [enabled, props.listening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  function stopRecognition() {
    setEnabled(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setStatusLabel("Browser speech stopped");
  }

  function startRecognition() {
    const SpeechRecognitionConstructor =
      getBrowserSpeechRecognitionConstructor();
    if (!SpeechRecognitionConstructor) {
      setStatusLabel("Browser speech unavailable");
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
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

        void window.unemployed.interviewHelper
          .addTranscriptSegment({
            sessionId: sessionIdRef.current,
            transcriptSegmentId: `browser_speech_${sessionIdRef.current}_${index}`,
            source: "microphone",
            state: result.isFinal ? "final" : "stable_partial",
            text,
            language: languageRef.current,
            confidence: Number.isFinite(alternative.confidence)
              ? alternative.confidence
              : null,
            engineKind: "browser_speech",
          })
          .then(props.onWorkspaceChange);
      }
    };
    recognition.onerror = (event) => {
      setStatusLabel(event.message || `Browser speech ${event.error}`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (enabledRef.current && listeningRef.current) {
        startRecognition();
      } else {
        setStatusLabel(
          enabledRef.current ? "Browser speech paused" : "Browser speech idle",
        );
      }
    };

    recognitionRef.current = recognition;
    setEnabled(true);
    setStatusLabel("Browser speech listening");

    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setEnabled(false);
      setStatusLabel(
        error instanceof Error
          ? error.message
          : "Browser speech failed to start",
      );
    }
  }

  return (
    <div className="grid gap-2 rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-[0.82rem]">Browser speech</p>
          <p className="text-[0.72rem] text-muted-foreground">{statusLabel}</p>
        </div>
        <Button
          className="justify-self-stretch"
          disabled={!props.listening}
          onClick={() => {
            if (enabled) {
              stopRecognition();
            } else {
              startRecognition();
            }
          }}
          size="compact"
          variant={enabled ? "outline" : "secondary"}
        >
          {enabled ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          {enabled ? "Stop mic" : "Start mic"}
        </Button>
      </div>
    </div>
  );
}
