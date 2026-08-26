import {
  GripHorizontal,
  Maximize2,
  MessageSquare,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeValidationResult,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { FieldLabel } from "@renderer/components/ui/field";
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import { Textarea } from "@renderer/components/ui/textarea";
import { cn } from "@renderer/lib/cn";
import {
  COPILOT_BOTTOM_OFFSET,
  COPILOT_NAV_SAFE_OFFSET,
  clampCopilotPosition,
  getDefaultCopilotPosition,
  getCopilotPanelDimensions,
} from "../../components/profile/profile-copilot-rail-layout";
import { ThinkingDots } from "../../components/profile/profile-copilot-rail-sections";
import { isImeComposingEvent } from "../../lib/job-finder-shortcuts";
import { useJobFinderOverlayOwnership } from "../../lib/job-finder-overlay-ownership";
import { formatTimestamp } from "./resume-workspace-utils";
import { ResumeAssistantProposalCard } from "./resume-assistant-proposal-card";

export function ResumeGuidedEditsPopup(props: {
  assistantMessages: readonly ResumeAssistantMessage[];
  assistantPending: boolean;
  draft?: ResumeDraft | null;
  isWorkspacePending: boolean;
  onSendAssistantMessage: (content: string) => void;
  onResolveProposal?: (
    proposalId: string,
    action: "accept" | "reject",
    patchIds: readonly string[],
  ) => void;
  validation?: ResumeValidationResult | null;
}) {
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  // The floating assistant dialog joins the app-wide LIFO overlay stack so
  // stacked surfaces close one per Escape and shell aliases stay blocked.
  const { isTopmost: isPopupTopmost } = useJobFinderOverlayOwnership({
    active: isOpen,
    close: () => {
      setIsMaximized(false);
      setIsOpen(false);
    },
  });
  const [safeTopOffset, setSafeTopOffset] = useState(COPILOT_NAV_SAFE_OFFSET);
  const [position, setPosition] = useState(() => getDefaultCopilotPosition());
  const [hasCustomPosition, setHasCustomPosition] = useState(false);
  const composerId = useId();
  const panelId = useId();
  const titleId = useId();
  const popupRootRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const transcriptViewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
    moved: boolean;
    suppressClickOnFinish: boolean;
  } | null>(null);
  const suppressNextBubbleClickRef = useRef(false);
  const panelDimensions = getCopilotPanelDimensions(safeTopOffset);

  useLayoutEffect(() => {
    const shellHeader = document.querySelector<HTMLElement>(
      "[data-job-finder-shell-header]",
    );
    const workspaceTopActions = document.querySelector<HTMLElement>(
      "[data-resume-workspace-top-actions]",
    );
    const safeTopSources = [shellHeader, workspaceTopActions].filter(
      (element): element is HTMLElement => element !== null,
    );

    if (safeTopSources.length === 0) {
      return;
    }

    const updateSafeTopOffset = () => {
      setSafeTopOffset(
        Math.max(
          COPILOT_NAV_SAFE_OFFSET,
          ...safeTopSources.map((element) =>
            Math.ceil(element.getBoundingClientRect().bottom + 16),
          ),
        ),
      );
    };
    const observer = new ResizeObserver(updateSafeTopOffset);

    updateSafeTopOffset();
    safeTopSources.forEach((element) => observer.observe(element));
    window.addEventListener("resize", updateSafeTopOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSafeTopOffset);
    };
  }, []);

  useEffect(() => {
    setPosition((current) =>
      clampCopilotPosition({
        x: current.x,
        y: current.y,
        isOpen,
        minBottomOffset: COPILOT_BOTTOM_OFFSET,
        minTopOffset: safeTopOffset,
      }),
    );
  }, [isOpen, safeTopOffset]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setPosition((current) =>
        clampCopilotPosition({
          x: current.x,
          y: current.y,
          isOpen,
          minBottomOffset: COPILOT_BOTTOM_OFFSET,
          minTopOffset: safeTopOffset,
        }),
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, safeTopOffset]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || isImeComposingEvent(event)) {
        return;
      }
      if (event.key !== "Escape" || !isPopupTopmost()) {
        return;
      }

      event.preventDefault();
      setIsMaximized(false);
      setIsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPopupTopmost, isOpen]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      document.getElementById(composerId)?.focus();
      return;
    }

    if (!isOpen && wasOpen) {
      popupRootRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
        ?.focus();
    }
  }, [composerId, isOpen]);

  useEffect(() => {
    const transcriptViewport = transcriptViewportRef.current;

    if (!transcriptViewport) {
      return;
    }

    transcriptViewport.scrollTop = transcriptViewport.scrollHeight;
  }, [props.assistantMessages.length, props.assistantPending]);

  function handleSend() {
    const nextInput = input.trim();

    if (
      props.isWorkspacePending ||
      props.assistantPending ||
      nextInput.length === 0
    ) {
      return;
    }

    props.onSendAssistantMessage(nextInput);
    setInput("");
    setIsOpen(true);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    handleSend();
  }

  function toggleOpen() {
    if (isOpen) {
      setIsMaximized(false);
      setPosition((current) =>
        clampCopilotPosition({
          ...current,
          isOpen: false,
          minBottomOffset: COPILOT_BOTTOM_OFFSET,
          minTopOffset: safeTopOffset,
        }),
      );
      setIsOpen(false);
      return;
    }

    setPosition((current) =>
      clampCopilotPosition({
        ...current,
        isOpen: true,
        minBottomOffset: COPILOT_BOTTOM_OFFSET,
        minTopOffset: safeTopOffset,
      }),
    );
    setIsOpen(true);
  }

  function toggleMaximized() {
    setIsMaximized((current) => !current);
  }

  function beginDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.isPrimary === false || event.button !== 0 || isMaximized) {
      return;
    }

    const target = event.target as HTMLElement;
    const interactiveTarget = target.closest<HTMLElement>(
      "button, textarea, input, a, [role='button']",
    );
    if (interactiveTarget && interactiveTarget !== event.currentTarget) {
      return;
    }

    const renderedBounds = event.currentTarget.getBoundingClientRect();
    const useRenderedAnchor = !isOpen && !hasCustomPosition;

    dragStateRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: useRenderedAnchor ? renderedBounds.left : position.x,
      startY: useRenderedAnchor ? renderedBounds.top : position.y,
      moved: false,
      suppressClickOnFinish: event.currentTarget instanceof HTMLButtonElement,
    };

    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function updateDrag(event: ReactPointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.originX;
    const deltaY = event.clientY - dragState.originY;

    if (!dragState.moved && Math.abs(deltaX) + Math.abs(deltaY) < 6) {
      return;
    }

    dragState.moved = true;
    setHasCustomPosition(true);
    setPosition(
      clampCopilotPosition({
        x: dragState.startX + deltaX,
        y: dragState.startY + deltaY,
        isOpen,
        minBottomOffset: COPILOT_BOTTOM_OFFSET,
        minTopOffset: safeTopOffset,
      }),
    );
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.isPrimary === false || event.button !== 0) {
      return;
    }

    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    if (dragState.suppressClickOnFinish) {
      suppressNextBubbleClickRef.current = dragState.moved;
    }

    if (!dragState.moved) {
      event.preventDefault();
    }
  }

  function cancelDrag(event: ReactPointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    if (dragState.suppressClickOnFinish) {
      suppressNextBubbleClickRef.current = dragState.moved;
    }
  }

  function handleBubbleClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    if (suppressNextBubbleClickRef.current) {
      suppressNextBubbleClickRef.current = false;
      return;
    }

    toggleOpen();
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-60 hidden max-w-[min(30rem,calc(100vw-2rem))] flex-col items-start gap-3 xl:flex"
      data-resume-guided-edits-open={isOpen ? "true" : "false"}
      ref={popupRootRef}
      style={
        isOpen && isMaximized
          ? {
              left: `${COPILOT_BOTTOM_OFFSET}px`,
              top: `${safeTopOffset}px`,
            }
          : !isOpen && !hasCustomPosition
            ? {
                bottom: `${COPILOT_BOTTOM_OFFSET}px`,
                left: `${COPILOT_BOTTOM_OFFSET}px`,
              }
            : {
                top: `${position.y}px`,
                left: `${position.x}px`,
              }
      }
    >
      {isOpen ? (
        <aside
          aria-labelledby={titleId}
          className="pointer-events-auto surface-popover-solid flex min-w-0 flex-col overflow-hidden rounded-(--radius-panel) border border-(--guided-edits-panel-border) bg-(--guided-edits-panel-bg) shadow-(--guided-edits-panel-shadow)"
          data-resume-guided-edits-maximized={isMaximized ? "true" : "false"}
          id={panelId}
          role="dialog"
          style={{
            width: isMaximized
              ? `calc(100vw - ${COPILOT_BOTTOM_OFFSET * 2}px)`
              : `${panelDimensions.expandedWidth}px`,
            height: isMaximized
              ? `calc(100vh - ${safeTopOffset + COPILOT_BOTTOM_OFFSET}px)`
              : `${panelDimensions.expandedHeight}px`,
            maxWidth: "calc(100vw - 2rem)",
            maxHeight: `calc(100vh - ${safeTopOffset + COPILOT_BOTTOM_OFFSET}px)`,
          }}
        >
          <header
            aria-label="Drag guided edits"
            className={cn(
              "flex touch-none select-none items-center justify-between gap-3 border-b border-border/30 px-5 py-4",
              isMaximized
                ? "cursor-default"
                : "cursor-grab active:cursor-grabbing",
            )}
            onPointerCancel={cancelDrag}
            onPointerDown={beginDrag}
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
          >
            <div className="flex min-w-0 items-center gap-3">
              <GripHorizontal
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <div className="flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                <MessageSquare className="size-4" />
              </div>
              <div className="min-w-0">
                <h2
                  className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary"
                  id={titleId}
                >
                  Guided edits
                </h2>
                <p className="text-sm text-foreground-soft">
                  Ask for grounded resume edits for this job.
                </p>
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                aria-label={
                  isMaximized ? "Restore guided edits" : "Maximize guided edits"
                }
                onClick={toggleMaximized}
                size="icon-xs"
                title={
                  isMaximized ? "Restore guided edits" : "Maximize guided edits"
                }
                type="button"
                variant="ghost"
              >
                {isMaximized ? (
                  <Minimize2 className="size-3.5" />
                ) : (
                  <Maximize2 className="size-3.5" />
                )}
              </Button>
              <Button
                aria-controls={panelId}
                aria-expanded={isOpen}
                aria-label="Minimize guided edits"
                onClick={toggleOpen}
                size="icon-xs"
                title="Minimize guided edits"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <ScrollArea
              className="min-h-0 flex-1"
              viewportRef={transcriptViewportRef}
            >
              <div
                aria-live="polite"
                aria-relevant="additions text"
                className="grid gap-3 px-4 py-4"
                role="log"
              >
                {props.assistantMessages.length ? (
                  props.assistantMessages.map((message) => {
                    const isAssistant = message.role === "assistant";

                    return (
                      <article
                        className={cn(
                          "grid max-w-full gap-2",
                          isAssistant
                            ? "justify-items-start"
                            : "justify-items-end",
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
                            {isAssistant ? (
                              <Sparkles className="size-3.5" />
                            ) : null}
                            <span>{isAssistant ? "Assistant" : "You"}</span>
                            <span>{formatTimestamp(message.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap break-words">
                            {message.content}
                          </p>
                          {message.executionAttribution?.fallbackUsed ? (
                            <p className="mt-2 text-(length:--text-tiny) text-muted-foreground">
                              AI was unavailable, so Guided Edits used the
                              built-in safe fallback for this reply.
                            </p>
                          ) : null}
                          {isAssistant &&
                          props.draft &&
                          props.onResolveProposal &&
                          message.proposalStatus !== "none" ? (
                            <ResumeAssistantProposalCard
                              draft={props.draft}
                              isPending={props.isWorkspacePending}
                              message={message}
                              onResolve={props.onResolveProposal}
                              validation={props.validation ?? null}
                            />
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="flex min-h-48 items-center justify-center">
                    <div className="grid max-w-72 gap-3 text-center">
                      <div className="surface-card-tint mx-auto flex size-11 items-center justify-center rounded-full border border-(--surface-panel-border) text-muted-foreground">
                        <MessageSquare className="size-4" />
                      </div>
                      <p className="font-display text-sm text-foreground">
                        No edit requests yet
                      </p>
                      <p className="text-sm leading-6 text-foreground-soft">
                        Ask for a tighter summary, stronger bullets, or clearer
                        job-specific wording.
                      </p>
                    </div>
                  </div>
                )}

                {props.assistantPending ? (
                  <article className="grid justify-items-start gap-2">
                    <div className="max-w-full rounded-(--radius-field) border border-primary/25 bg-primary/10 px-3 py-3 text-sm leading-6 text-foreground shadow-[inset_0_1px_0_var(--surface-inset-highlight)]">
                      <ThinkingDots
                        label="Assistant thinking"
                        className="mb-2"
                      />
                      <p>
                        Working on grounded edits while keeping the resume
                        studio usable.
                      </p>
                    </div>
                  </article>
                ) : null}
              </div>
            </ScrollArea>

            <div className="border-t border-(--surface-panel-border) bg-(--surface-fill-soft) p-4">
              <div className="grid gap-3">
                <div className="grid min-w-0 gap-2">
                  <FieldLabel htmlFor={composerId}>
                    Request a resume edit
                  </FieldLabel>
                  <Textarea
                    className="min-w-0"
                    data-testid="resume-assistant-input"
                    id={composerId}
                    onChange={(event) => setInput(event.currentTarget.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Example: tighten the summary, strengthen one experience bullet, or rewrite a section for this job..."
                    rows={4}
                    value={input}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-(length:--text-tiny) text-muted-foreground">
                    {props.assistantPending
                      ? "Assistant is thinking. You can keep typing or move this chat while it works."
                      : "Press Enter to send. Shift+Enter adds a new line. Drag the panel header to move it."}
                  </p>
                  <Button
                    className="min-w-28 px-4"
                    disabled={
                      props.isWorkspacePending ||
                      props.assistantPending ||
                      input.trim().length === 0
                    }
                    onClick={handleSend}
                    type="button"
                  >
                    {props.assistantPending ? "Thinking..." : "Send request"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {!isOpen ? (
        <Button
          aria-label={
            props.assistantPending
              ? "Open guided edits, reply in progress"
              : props.assistantMessages.length > 0
                ? "Open guided edits, continue thread"
                : "Open guided edits"
          }
          aria-expanded={false}
          aria-haspopup="dialog"
          className="pointer-events-auto relative size-12 shrink-0 rounded-full p-0 shadow-(--guided-edits-bubble-shadow)"
          onClick={handleBubbleClick}
          onPointerCancel={cancelDrag}
          onPointerDown={beginDrag}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          title="Open guided edits"
          type="button"
          variant={
            props.assistantMessages.length > 0 || props.assistantPending
              ? "primary"
              : "secondary"
          }
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-current/15 bg-background/15">
            <MessageSquare className="size-4" />
          </span>
          {props.assistantPending || props.assistantMessages.length > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-0.5 top-0.5 size-2.5 rounded-full border-2 border-background bg-primary"
            />
          ) : null}
        </Button>
      ) : null}
    </div>,
    document.body,
  );
}
