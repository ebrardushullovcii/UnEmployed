import type {
  InterviewOverlaySnapshot,
  InterviewTranscriptSegment,
} from "@unemployed/contracts";
import { Check, Copy, Mic, Shield, Sparkles, X } from "lucide-react";
import { cn } from "@renderer/lib/cn";

function formatSource(source: InterviewTranscriptSegment["source"]) {
  switch (source) {
    case "meeting_audio":
      return "Interviewer";
    case "microphone":
      return "You";
    case "meeting_native_transcript":
      return "Meeting";
  }
}

function ProtectionBadge({
  state,
}: {
  state: InterviewOverlaySnapshot["protectionState"];
}) {
  const protectedState = state === "verified_protected";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-(--tracking-badge)",
        protectedState
          ? "border-(--success-border) bg-(--success-surface) text-(--success-text)"
          : "border-(--warning-border) bg-(--warning-surface) text-(--warning-text)",
      )}
    >
      <Shield className="size-3" />
      {protectedState ? "Protected" : "Best effort"}
    </span>
  );
}

export function AnswerCueOverlay(props: {
  snapshot: InterviewOverlaySnapshot;
  framed?: boolean;
}) {
  const cue = props.snapshot.currentCue;
  const compact = props.snapshot.mode === "compact";

  return (
    <section
      className={cn(
        "overflow-hidden border border-(--surface-panel-border-warm) bg-[rgba(8,8,9,0.82)] text-foreground shadow-[0_24px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl",
        props.framed ? "rounded-(--radius-panel)" : "h-screen",
      )}
      style={{ opacity: props.snapshot.opacity }}
    >
      <header className="flex items-center justify-between border-b border-border-subtle bg-white/[0.025] px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-(--warning-text)" />
          <div className="grid gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-(--tracking-badge)">
              Answer cues
            </span>
            <span className="text-[0.68rem] text-muted-foreground">
              {props.snapshot.statusLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-sm border border-border-subtle bg-black/20 px-2 py-1 text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">
            {compact ? "Compact" : "Expanded"}
          </span>
          <ProtectionBadge state={props.snapshot.protectionState} />
          <X className="size-3.5 text-muted-foreground" />
        </div>
      </header>

      <div
        className={cn(
          "grid gap-4 p-4",
          compact && !props.framed
            ? "max-h-[calc(100vh-3.5rem)] overflow-hidden"
            : "",
        )}
      >
        {cue ? (
          <>
            <div className="grid gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-(--tracking-badge) text-muted-foreground">
                Question detected
              </span>
              <p className="text-[0.96rem] leading-6 text-foreground">
                {cue.question}
              </p>
            </div>

            <div className="grid gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-(--tracking-badge) text-muted-foreground">
                Answer outline
              </span>
              <ul className="grid gap-2 text-[0.88rem] leading-5 text-foreground-soft">
                {cue.answerOutline.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 text-(--success-text)" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {cue.supportingPoints.length > 0 && !compact ? (
              <div className="rounded-(--radius-small) border border-border-subtle bg-white/[0.025] p-3">
                <span className="text-[10px] font-semibold uppercase tracking-(--tracking-badge) text-muted-foreground">
                  Key points
                </span>
                <ul className="mt-2 grid gap-1.5 text-[0.8rem] leading-5 text-muted-foreground">
                  {cue.supportingPoints.map((point) => (
                    <li key={point}>- {point}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {cue.clarifyingQuestion ? (
              <p className="border-t border-border-subtle pt-3 text-[0.82rem] leading-5 text-(--warning-text)">
                {cue.clarifyingQuestion}
              </p>
            ) : null}

            <footer className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3 text-[0.72rem] text-muted-foreground">
              <span>{cue.disclosure.transcriptWindow}</span>
              <span>{cue.disclosure.screenshotCount} screenshots</span>
              {cue.disclosure.overlayContaminated ? (
                <span>visual degraded</span>
              ) : null}
            </footer>
          </>
        ) : (
          <div className="grid min-h-56 place-items-center text-center">
            <div className="grid gap-2">
              <Sparkles className="mx-auto size-6 text-(--warning-text)" />
              <p className="text-[0.9rem] text-muted-foreground">
                No cue card yet.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function TranscriptOverlay(props: {
  snapshot: InterviewOverlaySnapshot;
  framed?: boolean;
}) {
  const compact = props.snapshot.mode === "compact";

  return (
    <section
      className={cn(
        "overflow-hidden border border-(--info-border) bg-[rgba(8,8,9,0.84)] text-foreground shadow-[0_24px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl",
        props.framed ? "rounded-(--radius-panel)" : "h-screen",
      )}
      style={{ opacity: props.snapshot.opacity }}
    >
      <header className="flex items-center justify-between border-b border-border-subtle bg-white/[0.025] px-4 py-3">
        <div className="flex items-center gap-2">
          <Mic className="size-4 text-(--info-text)" />
          <div className="grid gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-(--tracking-badge)">
              Live transcript
            </span>
            <span className="text-[0.68rem] text-muted-foreground">
              {props.snapshot.queuedScreenshotCount} queued screenshots
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-sm border border-border-subtle bg-black/20 px-2 py-1 text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">
            {compact ? "Compact" : "Expanded"}
          </span>
          <ProtectionBadge state={props.snapshot.protectionState} />
          <X className="size-3.5 text-muted-foreground" />
        </div>
      </header>

      <div
        className={cn(
          "grid gap-4 overflow-y-auto p-4",
          compact ? "max-h-[18rem]" : "max-h-[28rem]",
        )}
      >
        {props.snapshot.transcriptSegments.length > 0 ? (
          props.snapshot.transcriptSegments.map((segment) => (
            <article
              key={segment.id}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3"
            >
              <time className="text-[0.72rem] text-muted-foreground">
                {new Date(segment.startedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <div className="grid gap-1">
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-(--tracking-badge)",
                    segment.source === "meeting_audio"
                      ? "text-(--warning-text)"
                      : "text-(--info-text)",
                  )}
                >
                  {formatSource(segment.source)}
                </span>
                <p className="text-[0.86rem] leading-5 text-foreground-soft">
                  {segment.text}
                </p>
              </div>
            </article>
          ))
        ) : (
          <div className="grid min-h-32 place-items-center text-center">
            <div className="grid gap-2">
              <Mic className="mx-auto size-5 text-(--info-text)" />
              <p className="text-[0.86rem] text-muted-foreground">
                No transcript segments yet.
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-border-subtle px-4 py-3 text-[0.72rem] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-(--success-text)" />
          {props.snapshot.statusLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          {props.snapshot.confidenceLabel}
          <Copy className="size-3.5" />
        </span>
      </footer>
    </section>
  );
}
