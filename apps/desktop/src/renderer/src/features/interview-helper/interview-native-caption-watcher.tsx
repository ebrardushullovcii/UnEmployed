import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff } from "lucide-react";
import type { InterviewWorkspaceSnapshot } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";

export function InterviewNativeCaptionWatcher(props: {
  sessionId: string;
  listening: boolean;
  onWorkspaceChange: (workspace: InterviewWorkspaceSnapshot) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [statusLabel, setStatusLabel] = useState("Native caption watcher idle");
  const lastTextRef = useRef("");
  const sessionIdRef = useRef(props.sessionId);
  const listeningRef = useRef(props.listening);

  useEffect(() => {
    sessionIdRef.current = props.sessionId;
  }, [props.sessionId]);

  useEffect(() => {
    listeningRef.current = props.listening;
  }, [props.listening]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;
    const intervalId = window.setInterval(() => {
      if (disposed || !listeningRef.current) {
        return;
      }

      void window.unemployed.interviewHelper
        .readClipboardText()
        .then((result) => {
          const text = result.text.trim();
          if (text.length === 0 || text === lastTextRef.current) {
            return;
          }

          lastTextRef.current = text;
          setStatusLabel("Native caption copied into transcript");
          return window.unemployed.interviewHelper
            .addTranscriptSegment({
              sessionId: sessionIdRef.current,
              source: "meeting_native_transcript",
              state: "final",
              text,
              engineKind: "platform_local",
            })
            .then(props.onWorkspaceChange);
        })
        .catch((error: unknown) => {
          setStatusLabel(
            error instanceof Error ? error.message : "Native caption watcher failed",
          );
        });
    }, 2000);

    setStatusLabel("Watching clipboard for copied native captions");

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, props.onWorkspaceChange]);

  return (
    <div className="grid gap-2 rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.82rem]">Native captions</p>
          <p className="text-[0.72rem] text-muted-foreground">{statusLabel}</p>
        </div>
        <Button
          disabled={!props.listening}
          onClick={() => {
            setEnabled((current) => !current);
          }}
          size="compact"
          variant={enabled ? "outline" : "secondary"}
        >
          {enabled ? <CaptionsOff className="size-4" /> : <Captions className="size-4" />}
          {enabled ? "Stop captions" : "Watch captions"}
        </Button>
      </div>
    </div>
  );
}
