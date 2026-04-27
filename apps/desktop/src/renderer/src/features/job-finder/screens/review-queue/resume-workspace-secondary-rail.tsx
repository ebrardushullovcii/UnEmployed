import { MessageSquare, Sparkles } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ResumeAssistantMessage } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { FieldLabel } from "@renderer/components/ui/field";
import { Textarea } from "@renderer/components/ui/textarea";
import { cn } from "@renderer/lib/cn";
import { formatTimestamp } from "./resume-workspace-utils";

export function ResumeWorkspaceSecondaryRail(props: {
  assistantMessages: readonly ResumeAssistantMessage[];
  assistantPending: boolean;
  compactWhenIdle?: boolean;
  isWorkspacePending: boolean;
  onSendAssistantMessage: (content: string) => void;
}) {
  const [assistantInput, setAssistantInput] = useState("");
  const assistantId = useId();
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const transcript = transcriptScrollRef.current;

    if (!transcript) {
      return;
    }

    transcript.scrollTop = transcript.scrollHeight;
  }, [props.assistantMessages.length]);

  function handleSend() {
    const nextInput = assistantInput.trim();

    if (props.isWorkspacePending || props.assistantPending || nextInput.length === 0) {
      return;
    }

    props.onSendAssistantMessage(nextInput);
    setAssistantInput("");
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    handleSend();
  }

  const showCompactIdleComposer =
    props.compactWhenIdle &&
    props.assistantMessages.length === 0 &&
    !props.assistantPending;

  return (
    <aside className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full">
      <header className="flex items-center gap-3 border-b border-(--surface-panel-border) px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
          <MessageSquare className="size-4" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary">
            Guided edits
          </h2>
          <p className="text-sm text-foreground-soft">
            Ask for grounded edits using the job, your profile, and saved research.
          </p>
        </div>
      </header>

      {showCompactIdleComposer ? (
        <div className="grid gap-3 p-4">
          <p className="text-sm leading-6 text-foreground-soft">
            Keep the editor and preview in view, then pull in grounded rewrite help only when you want a tighter summary, stronger bullets, or more role-specific wording.
          </p>
          <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-fill-soft) p-4">
            <div className="grid min-w-0 gap-2">
              <FieldLabel htmlFor={assistantId}>Request a resume edit</FieldLabel>
              <Textarea
                className="min-w-0"
                id={assistantId}
                disabled={props.isWorkspacePending || props.assistantPending}
                onChange={(event) => setAssistantInput(event.currentTarget.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Example: tighten the summary, strengthen one experience bullet, or rewrite a section for this job..."
                rows={3}
                value={assistantInput}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-(length:--text-tiny) text-muted-foreground">
                Press Enter to send. Shift+Enter adds a new line.
              </p>
              <Button
                className="min-w-28 px-4"
                disabled={props.isWorkspacePending || props.assistantPending || assistantInput.trim().length === 0}
                pending={props.assistantPending}
                onClick={handleSend}
                type="button"
                variant="primary"
              >
                {props.assistantPending ? "Updating..." : "Send request"}
              </Button>
            </div>
          </div>
        </div>
      ) : (

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          aria-live="polite"
          aria-relevant="additions text"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4"
          ref={transcriptScrollRef}
          role="log"
        >
          {props.assistantMessages.length ? (
            <div className="grid content-start gap-3">
              {props.assistantMessages.map((message) => {
                const isAssistant = message.role === "assistant";
                return (
                  <article
                    className={cn(
                      "grid max-w-full gap-2",
                      isAssistant ? "justify-items-start" : "justify-items-end",
                    )}
                    key={message.id}
                  >
                    <div
                      className={cn(
                        "max-w-full rounded-(--radius-field) border px-3 py-3 text-sm leading-6 shadow-[inset_0_1px_0_var(--surface-inset-highlight)]",
                        isAssistant
                          ? "border-primary/25 bg-primary/10 text-foreground"
                          : "surface-card-tint border-(--surface-panel-border) text-foreground-soft",
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2 text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                        {isAssistant ? <Sparkles className="size-3.5" /> : null}
                        <span>{isAssistant ? "Assistant" : "You"}</span>
                        <span>{formatTimestamp(message.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-48 items-center justify-center">
              <div className="grid max-w-52 gap-2 text-center">
                <div className="surface-card-tint mx-auto flex size-11 items-center justify-center rounded-full border border-(--surface-panel-border) text-muted-foreground">
                  <MessageSquare className="size-4" />
                </div>
                <p className="font-display text-sm text-foreground">
                  No edit requests yet
                </p>
                <p className="text-sm leading-6 text-foreground-soft">
                  Ask for a tighter summary, stronger bullets, or clearer job-specific wording.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-(--surface-panel-border) bg-(--surface-fill-soft) p-4">
          <div className="grid gap-3">
            <div className="grid min-w-0 gap-2">
              <FieldLabel htmlFor={assistantId}>Request a resume edit</FieldLabel>
              <Textarea
                className="min-w-0"
                id={assistantId}
                disabled={props.isWorkspacePending || props.assistantPending}
                onChange={(event) => setAssistantInput(event.currentTarget.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Example: tighten the summary, strengthen one experience bullet, or rewrite a section for this job..."
                rows={4}
                value={assistantInput}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-(length:--text-tiny) text-muted-foreground">
                Press Enter to send. Shift+Enter adds a new line.
              </p>
              <Button
                className="min-w-28 px-4"
                disabled={props.isWorkspacePending || props.assistantPending || assistantInput.trim().length === 0}
                pending={props.assistantPending}
                onClick={handleSend}
                type="button"
                variant="primary"
              >
                {props.assistantPending ? "Updating..." : "Send request"}
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}
    </aside>
  );
}
