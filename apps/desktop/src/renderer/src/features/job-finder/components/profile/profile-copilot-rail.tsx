import {
  GripHorizontal,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type {
  JobFinderWorkspaceSnapshot,
  ProfileCopilotContext,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { getProfileCopilotContextKey } from "../../lib/profile-copilot-context";
import { formatStatusLabel } from "../../lib/job-finder-utils";
import {
  getPatchGroupOperationSummary,
  getProfileCopilotContextLabel,
} from "./profile-copilot-rail.shared";
import {
  COPILOT_BOTTOM_OFFSET,
  COPILOT_POSITION_STORAGE_KEY,
  clampCopilotPosition,
  getDefaultCopilotPosition,
  getDraggedCopilotPosition,
  getCopilotPanelDimensions,
  parseCopilotPosition,
} from "./profile-copilot-rail-layout";
import {
  ProfileCopilotCollapsedBubble,
  ProfileCopilotComposer,
  ProfileCopilotRevisionTray,
  ProfileCopilotTranscript,
} from "./profile-copilot-rail-sections";

export function ProfileCopilotRail(props: {
  busy: boolean;
  actionsDisabledReason?: string | null;
  context: ProfileCopilotContext;
  emptyStateDescription: string;
  emptyStateTitle: string;
  messages: readonly JobFinderWorkspaceSnapshot["profileCopilotMessages"][number][];
  onApplyPatchGroup: (patchGroupId: string) => void;
  onRejectPatchGroup: (patchGroupId: string) => void;
  onSendMessage: (content: string, context: ProfileCopilotContext) => void;
  onUndoRevision: (revisionId: string) => void;
  pendingContextKey: string | null;
  placeholder: string;
  revisions: readonly JobFinderWorkspaceSnapshot["profileRevisions"][number][];
  sendDisabledReason?: string | null;
  starterQuestion?: string | null;
  suggestedPrompts?: readonly string[];
  minBottomOffset?: number;
  collapsedMinBottomOffset?: number;
  title?: string;
}) {
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showRevisionTray, setShowRevisionTray] = useState(false);
  const [showProactivePrompt, setShowProactivePrompt] = useState(true);
  const [safeTopOffset, setSafeTopOffset] = useState(240);
  const [position, setPosition] = useState(() => {
    if (typeof window === "undefined") {
      return getDefaultCopilotPosition();
    }

    try {
      return (
        parseCopilotPosition(
          window.localStorage.getItem(COPILOT_POSITION_STORAGE_KEY),
        ) ?? getDefaultCopilotPosition()
      );
    } catch {
      return getDefaultCopilotPosition();
    }
  });
  const [hasCustomCollapsedPosition, setHasCustomCollapsedPosition] = useState(
    () => {
      if (typeof window === "undefined") {
        return false;
      }

      try {
        return (
          parseCopilotPosition(
            window.localStorage.getItem(COPILOT_POSITION_STORAGE_KEY),
          ) !== null
        );
      } catch {
        return false;
      }
    },
  );
  const collapsedPositionRef = useRef(position);
  const composerId = useId();
  const railRootRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const wasPendingHereRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
    moved: boolean;
    isOpen: boolean;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const suppressNextBubbleClickRef = useRef(false);
  const contextKey = getProfileCopilotContextKey(props.context);
  const isPendingHere = props.pendingContextKey === contextKey;
  const minBottomOffset = props.minBottomOffset ?? COPILOT_BOTTOM_OFFSET;
  const collapsedMinBottomOffset =
    props.collapsedMinBottomOffset ?? COPILOT_BOTTOM_OFFSET;
  const panelDimensions = getCopilotPanelDimensions(safeTopOffset);
  const collapsedPreviewTitle = isPendingHere
    ? "Working on your last request"
    : props.messages.length > 0
      ? "Continue this thread"
      : props.starterQuestion
        ? "Top missing detail"
        : "Ask for a structured edit";
  const recentRevisions = useMemo(
    () => props.revisions.slice(0, 4),
    [props.revisions],
  );
  const suggestedPrompts = useMemo(
    () =>
      Array.from(
        new Set([
          ...(props.starterQuestion ? [props.starterQuestion] : []),
          ...(props.suggestedPrompts ?? []),
        ]),
      ).slice(0, 3),
    [props.starterQuestion, props.suggestedPrompts],
  );
  const recentRevisionEntries = useMemo(() => {
    return recentRevisions.map((revision) => {
      const matchingPatchGroup = props.messages
        .flatMap((message) => message.patchGroups)
        .find((patchGroup) => patchGroup.id === revision.patchGroupId);

      return {
        revision,
        summary: matchingPatchGroup
          ? getPatchGroupOperationSummary(matchingPatchGroup)
          : (revision.reason ?? formatStatusLabel(revision.trigger)),
      };
    });
  }, [props.messages, recentRevisions]);

  useLayoutEffect(() => {
    const shellHeader = document.querySelector<HTMLElement>(
      "[data-job-finder-shell-header]",
    );

    if (!shellHeader) {
      return;
    }

    const updateSafeTopOffset = () => {
      setSafeTopOffset(
        Math.ceil(shellHeader.getBoundingClientRect().bottom + 16),
      );
    };
    const observer = new ResizeObserver(updateSafeTopOffset);

    updateSafeTopOffset();
    observer.observe(shellHeader);
    window.addEventListener("resize", updateSafeTopOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSafeTopOffset);
    };
  }, []);

  useEffect(() => {
    const wasPendingHere = wasPendingHereRef.current;
    wasPendingHereRef.current = isPendingHere;

    if (isPendingHere && !wasPendingHere) {
      if (!isOpen) {
        collapsedPositionRef.current = position;
      }
      setIsOpen(true);
    }
  }, [isOpen, isPendingHere, position]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      document.getElementById(composerId)?.focus();
      return;
    }

    if (!isOpen && wasOpen) {
      railRootRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
        ?.focus();
    }
  }, [composerId, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") {
        return;
      }

      dragStateRef.current = null;
      dragCleanupRef.current?.();
      setPosition(
        clampCopilotPosition({
          ...collapsedPositionRef.current,
          isOpen: false,
          minBottomOffset: collapsedMinBottomOffset,
          minTopOffset: safeTopOffset,
        }),
      );
      setIsMaximized(false);
      setIsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [collapsedMinBottomOffset, isOpen, safeTopOffset]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setPosition((current) => {
        const nextPosition = clampCopilotPosition({
          x: current.x,
          y: current.y,
          isOpen,
          minBottomOffset: isOpen ? minBottomOffset : collapsedMinBottomOffset,
          minTopOffset: safeTopOffset,
        });

        if (!isOpen) {
          collapsedPositionRef.current = nextPosition;
        }
        return nextPosition;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [collapsedMinBottomOffset, isOpen, minBottomOffset, safeTopOffset]);

  useEffect(() => {
    setPosition((current) => {
      const nextPosition = clampCopilotPosition({
        x: current.x,
        y: current.y,
        isOpen,
        minBottomOffset: isOpen ? minBottomOffset : collapsedMinBottomOffset,
        minTopOffset: safeTopOffset,
      });

      if (!isOpen) {
        collapsedPositionRef.current = nextPosition;
      }
      return nextPosition;
    });
  }, [collapsedMinBottomOffset, isOpen, minBottomOffset, safeTopOffset]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isOpen) {
      return;
    }

    try {
      if (!hasCustomCollapsedPosition) {
        window.localStorage.removeItem(COPILOT_POSITION_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(
        COPILOT_POSITION_STORAGE_KEY,
        JSON.stringify(position),
      );
    } catch {
      // Local placement persistence is a convenience; storage failures must not block Copilot.
    }
  }, [hasCustomCollapsedPosition, isOpen, position]);

  useEffect(() => {
    const transcript = transcriptRef.current;

    if (!transcript) {
      return;
    }

    transcript.scrollTop = transcript.scrollHeight;
  }, [isPendingHere, props.messages.length]);

  function handleSend() {
    const nextInput = input.trim();

    if (isPendingHere || nextInput.length === 0 || props.sendDisabledReason) {
      return;
    }

    props.onSendMessage(nextInput, props.context);
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

  function handleOpen(prefill?: string) {
    if (prefill && input.trim().length === 0) {
      setInput(prefill);
    }

    if (!isOpen) {
      collapsedPositionRef.current = position;
    }
    setIsMaximized(false);
    setIsOpen(true);
  }

  function toggleOpen() {
    if (isOpen) {
      setPosition(
        clampCopilotPosition({
          ...collapsedPositionRef.current,
          isOpen: false,
          minBottomOffset: collapsedMinBottomOffset,
          minTopOffset: safeTopOffset,
        }),
      );
      setIsMaximized(false);
      setIsOpen(false);
      return;
    }

    collapsedPositionRef.current = position;
    setIsOpen(true);
  }

  function toggleOpenFromBubble() {
    if (isOpen) {
      toggleOpen();
      return;
    }

    handleOpen(
      props.messages.length === 0
        ? (props.starterQuestion ?? undefined)
        : undefined,
    );
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    draggingOpen: boolean,
  ) {
    if (event.button !== 0 || (draggingOpen && isMaximized)) {
      return;
    }

    event.preventDefault();
    const renderedBounds = event.currentTarget.getBoundingClientRect();
    const useRenderedAnchor = !draggingOpen && !hasCustomCollapsedPosition;
    dragStateRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: useRenderedAnchor ? renderedBounds.left : position.x,
      startY: useRenderedAnchor ? renderedBounds.top : position.y,
      moved: false,
      isOpen: draggingOpen,
    };

    dragCleanupRef.current?.();

    const handleWindowPointerMove = (pointerEvent: PointerEvent) => {
      updateDrag(
        pointerEvent.pointerId,
        pointerEvent.clientX,
        pointerEvent.clientY,
      );
    };
    const handleWindowPointerUp = (pointerEvent: PointerEvent) => {
      finishDrag(
        pointerEvent.pointerId,
        pointerEvent.clientX,
        pointerEvent.clientY,
      );
    };
    const handleWindowPointerCancel = (pointerEvent: PointerEvent) => {
      cancelDrag(pointerEvent.pointerId);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener(
        "pointercancel",
        handleWindowPointerCancel,
        true,
      );
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handleWindowPointerMove, true);
    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("pointercancel", handleWindowPointerCancel, true);
  }

  function updateDrag(pointerId: number, clientX: number, clientY: number) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== pointerId) {
      return;
    }

    const dragResult = getDraggedCopilotPosition({
      clientX,
      clientY,
      originX: dragState.originX,
      originY: dragState.originY,
      startX: dragState.startX,
      startY: dragState.startY,
    });

    if (!dragState.moved && !dragResult.moved) {
      return;
    }

    dragState.moved = true;
    if (!dragState.isOpen) {
      setHasCustomCollapsedPosition(true);
    }
    setPosition(
      clampCopilotPosition({
        x: dragResult.position.x,
        y: dragResult.position.y,
        isOpen: dragState.isOpen,
        minBottomOffset: dragState.isOpen
          ? minBottomOffset
          : collapsedMinBottomOffset,
        minTopOffset: safeTopOffset,
      }),
    );
  }

  function finishDrag(pointerId: number, clientX: number, clientY: number) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== pointerId) {
      return;
    }

    const dragResult = getDraggedCopilotPosition({
      clientX,
      clientY,
      originX: dragState.originX,
      originY: dragState.originY,
      startX: dragState.startX,
      startY: dragState.startY,
    });

    if (dragResult.moved) {
      dragState.moved = true;
      if (!dragState.isOpen) {
        setHasCustomCollapsedPosition(true);
      }
      setPosition(
        clampCopilotPosition({
          x: dragResult.position.x,
          y: dragResult.position.y,
          isOpen: dragState.isOpen,
          minBottomOffset: dragState.isOpen
            ? minBottomOffset
            : collapsedMinBottomOffset,
          minTopOffset: safeTopOffset,
        }),
      );
    }

    dragStateRef.current = null;
    dragCleanupRef.current?.();
    suppressBubbleClickAfterDrag(dragState.moved);
  }

  function cancelDrag(pointerId: number) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== pointerId) {
      return;
    }

    dragStateRef.current = null;
    dragCleanupRef.current?.();
    suppressBubbleClickAfterDrag(dragState.moved);
  }

  function suppressBubbleClickAfterDrag(moved: boolean) {
    suppressNextBubbleClickRef.current = moved;

    if (!moved) {
      return;
    }

    window.setTimeout(() => {
      suppressNextBubbleClickRef.current = false;
    }, 0);
  }

  function handleBubblePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    beginDrag(event, false);
  }

  function handlePanelPointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;

    if (target.closest('button, textarea, input, a, [role="button"]')) {
      return;
    }

    beginDrag(event, true);
  }

  function toggleMaximized() {
    setIsMaximized((current) => !current);
  }

  function handleBubblePointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    updateDrag(event.pointerId, event.clientX, event.clientY);
  }

  function handleBubblePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    finishDrag(event.pointerId, event.clientX, event.clientY);
  }

  function handleBubblePointerCancel(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    cancelDrag(event.pointerId);
  }

  function handleBubbleClick() {
    if (suppressNextBubbleClickRef.current) {
      suppressNextBubbleClickRef.current = false;
      return;
    }

    toggleOpenFromBubble();
  }

  function handleBubbleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    suppressNextBubbleClickRef.current = true;
    toggleOpenFromBubble();
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] flex max-w-[min(30rem,calc(100vw-2rem))] flex-col items-start gap-3"
      ref={railRootRef}
      style={
        isOpen && isMaximized
          ? {
              left: `${COPILOT_BOTTOM_OFFSET}px`,
              top: `${safeTopOffset}px`,
            }
          : !isOpen && !hasCustomCollapsedPosition
            ? {
                bottom: `${COPILOT_BOTTOM_OFFSET}px`,
                left: `${COPILOT_BOTTOM_OFFSET}px`,
              }
            : { left: `${position.x}px`, top: `${position.y}px` }
      }
    >
      {isOpen ? (
        <aside
          aria-label={props.title ?? "Profile Copilot"}
          role="dialog"
          className="pointer-events-auto surface-panel-shell flex min-w-0 flex-col overflow-hidden rounded-(--radius-panel) border border-border/40 bg-card shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur"
          data-profile-copilot-maximized={isMaximized ? "true" : "false"}
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
            aria-label="Drag Profile Copilot"
            className={`flex touch-none select-none items-center justify-between gap-3 border-b border-border/30 px-5 py-4 ${isMaximized ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
            onPointerDown={handlePanelPointerDown}
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
                <h2 className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary">
                  {props.title ?? "Profile Copilot"}
                </h2>
                <p className="text-sm text-foreground-soft">
                  {getProfileCopilotContextLabel(props.context)}
                </p>
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                aria-label={
                  isMaximized
                    ? "Restore Profile Copilot"
                    : "Maximize Profile Copilot"
                }
                onClick={toggleMaximized}
                size="icon-xs"
                title={
                  isMaximized
                    ? "Restore Profile Copilot"
                    : "Maximize Profile Copilot"
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
                aria-label="Minimize Profile Copilot"
                onClick={toggleOpen}
                size="icon-xs"
                title="Minimize Profile Copilot"
                type="button"
                variant="ghost"
              >
                <Minus className="size-3.5" />
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <ProfileCopilotTranscript
              busy={props.busy}
              actionsDisabledReason={props.actionsDisabledReason}
              emptyStateDescription={props.emptyStateDescription}
              emptyStateTitle={props.emptyStateTitle}
              isPendingHere={isPendingHere}
              messages={props.messages}
              onApplyPatchGroup={props.onApplyPatchGroup}
              onRejectPatchGroup={props.onRejectPatchGroup}
              onUsePrompt={(prompt) => setInput(prompt)}
              suggestedPrompts={suggestedPrompts}
              starterQuestion={props.starterQuestion}
              transcriptRef={transcriptRef}
            />

            <div className="border-t border-(--surface-panel-border) bg-(--surface-fill-soft) p-4">
              <ProfileCopilotRevisionTray
                busy={props.busy}
                actionsDisabledReason={props.actionsDisabledReason}
                onToggleRevisionTray={() =>
                  setShowRevisionTray((current) => !current)
                }
                onUndoRevision={props.onUndoRevision}
                recentRevisionEntries={recentRevisionEntries}
                revisionCount={props.revisions.length}
                showRevisionTray={showRevisionTray}
              />

              <ProfileCopilotComposer
                busy={props.busy}
                composerId={composerId}
                input={input}
                isPendingHere={isPendingHere}
                onInputChange={setInput}
                onKeyDown={handleComposerKeyDown}
                onSend={handleSend}
                placeholder={props.placeholder}
                sendDisabledReason={props.sendDisabledReason}
                starterQuestion={props.starterQuestion}
                movementHint="Drag the panel header to move Copilot."
              />
            </div>
          </div>
        </aside>
      ) : null}

      {!isOpen &&
      showProactivePrompt &&
      props.messages.length === 0 &&
      props.starterQuestion ? (
        <div className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border border-border/40 bg-card/95 p-1.5 pl-4 shadow-[0_12px_32px_rgba(0,0,0,0.32)] backdrop-blur max-sm:hidden">
          <button
            className="min-w-0 flex-1 truncate text-left text-xs text-foreground-soft hover:text-foreground"
            onClick={() => handleOpen(props.starterQuestion ?? undefined)}
            type="button"
          >
            Suggested: {props.starterQuestion}
          </button>
          <button
            aria-label="Dismiss suggestion"
            className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            onClick={() => setShowProactivePrompt(false)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!isOpen ? (
        <ProfileCopilotCollapsedBubble
          collapsedPreviewTitle={collapsedPreviewTitle}
          isDraggable
          isOpen={isOpen}
          isPendingHere={isPendingHere}
          messageCount={props.messages.length}
          onClick={handleBubbleClick}
          onKeyDown={handleBubbleKeyDown}
          onPointerDown={handleBubblePointerDown}
          onPointerMove={handleBubblePointerMove}
          onPointerCancel={handleBubblePointerCancel}
          onPointerUp={handleBubblePointerUp}
          title={props.title}
        />
      ) : null}
    </div>,
    document.body,
  );
}
