import { MessageSquare, Minimize2 } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  JobFinderWorkspaceSnapshot,
  ProfileCopilotContext,
} from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { getProfileCopilotContextKey } from '../../lib/profile-copilot-context'
import { formatStatusLabel } from '../../lib/job-finder-utils'
import {
  getPatchGroupOperationSummary,
  getProfileCopilotContextLabel,
} from './profile-copilot-rail.shared'
import {
  COPILOT_BOTTOM_OFFSET,
  COPILOT_NAV_SAFE_OFFSET,
  COPILOT_POSITION_STORAGE_KEY,
  clampCopilotPosition,
  getDraggedCopilotPosition,
  getCopilotPanelDimensions,
  parseCopilotPosition,
} from './profile-copilot-rail-layout'
import {
  ProfileCopilotCollapsedBubble,
  ProfileCopilotComposer,
  ProfileCopilotRevisionTray,
  ProfileCopilotTranscript,
} from './profile-copilot-rail-sections'

export function ProfileCopilotRail(props: {
  busy: boolean
  actionsDisabledReason?: string | null
  context: ProfileCopilotContext
  emptyStateDescription: string
  emptyStateTitle: string
  messages: readonly JobFinderWorkspaceSnapshot['profileCopilotMessages'][number][]
  onApplyPatchGroup: (patchGroupId: string) => void
  onRejectPatchGroup: (patchGroupId: string) => void
  onSendMessage: (content: string, context: ProfileCopilotContext) => void
  onUndoRevision: (revisionId: string) => void
  pendingContextKey: string | null
  placeholder: string
  revisions: readonly JobFinderWorkspaceSnapshot['profileRevisions'][number][]
  sendDisabledReason?: string | null
  starterQuestion?: string | null
  suggestedPrompts?: readonly string[]
  minBottomOffset?: number
  collapsedMinBottomOffset?: number
  onOpenChange?: (isOpen: boolean) => void
  reserveContentSpace?: boolean
  title?: string
}) {
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [showRevisionTray, setShowRevisionTray] = useState(false)
  const [showProactivePrompt, setShowProactivePrompt] = useState(true)
  const [position, setPosition] = useState(() => {
    if (typeof window === 'undefined') {
      return { x: COPILOT_BOTTOM_OFFSET, y: COPILOT_BOTTOM_OFFSET }
    }

    try {
      return (
        parseCopilotPosition(window.localStorage.getItem(COPILOT_POSITION_STORAGE_KEY)) ?? {
          x: COPILOT_BOTTOM_OFFSET,
          y: COPILOT_BOTTOM_OFFSET,
        }
      )
    } catch {
      return { x: COPILOT_BOTTOM_OFFSET, y: COPILOT_BOTTOM_OFFSET }
    }
  })
  const composerId = useId()
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    originX: number
    originY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const suppressNextBubbleClickRef = useRef(false)
  const contextKey = getProfileCopilotContextKey(props.context)
  const isPendingHere = props.pendingContextKey === contextKey
  const minBottomOffset = props.minBottomOffset ?? COPILOT_BOTTOM_OFFSET
  const collapsedMinBottomOffset = props.collapsedMinBottomOffset ?? COPILOT_BOTTOM_OFFSET
  const panelDimensions = getCopilotPanelDimensions(minBottomOffset)
  const collapsedPreviewTitle = isPendingHere
    ? 'Working on your last request'
    : props.messages.length > 0
      ? 'Continue this thread'
      : props.starterQuestion
        ? 'Top missing detail'
        : 'Ask for a structured edit'
  const recentRevisions = useMemo(() => props.revisions.slice(0, 4), [props.revisions])
  const suggestedPrompts = useMemo(
    () => Array.from(new Set([
      ...(props.starterQuestion ? [props.starterQuestion] : []),
      ...(props.suggestedPrompts ?? []),
    ])).slice(0, 3),
    [props.starterQuestion, props.suggestedPrompts],
  )
  const recentRevisionEntries = useMemo(() => {
    return recentRevisions
      .map((revision) => {
        const matchingPatchGroup = props.messages
          .flatMap((message) => message.patchGroups)
          .find((patchGroup) => patchGroup.id === revision.patchGroupId)

        return {
          revision,
          summary: matchingPatchGroup ? getPatchGroupOperationSummary(matchingPatchGroup) : (revision.reason ?? formatStatusLabel(revision.trigger)),
        }
      })
  }, [props.messages, recentRevisions])

  useEffect(() => {
    if (isPendingHere) {
      setIsOpen(true)
    }
  }, [isPendingHere])

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
    }
  }, [])

  useEffect(() => {
    props.onOpenChange?.(isOpen)
  }, [isOpen, props.onOpenChange])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      setPosition((current) => clampCopilotPosition({
        x: current.x,
        y: current.y,
        isOpen: false,
        minBottomOffset: collapsedMinBottomOffset,
        containerMinBottomOffset: collapsedMinBottomOffset,
      }))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [collapsedMinBottomOffset])

  useEffect(() => {
    setPosition((current) => clampCopilotPosition({
      x: current.x,
      y: current.y,
      isOpen: false,
      minBottomOffset: collapsedMinBottomOffset,
      containerMinBottomOffset: collapsedMinBottomOffset,
    }))
  }, [collapsedMinBottomOffset])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(COPILOT_POSITION_STORAGE_KEY, JSON.stringify(position))
    } catch {
      // Local placement persistence is a convenience; storage failures must not block Copilot.
    }
  }, [position])

  useEffect(() => {
    const transcript = transcriptRef.current

    if (!transcript) {
      return
    }

    transcript.scrollTop = transcript.scrollHeight
  }, [isPendingHere, props.messages.length])

  function handleSend() {
    const nextInput = input.trim()

    if (isPendingHere || nextInput.length === 0 || props.sendDisabledReason) {
      return
    }

    props.onSendMessage(nextInput, props.context)
    setInput('')
    setIsOpen(true)
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    event.preventDefault()
    handleSend()
  }

  function handleOpen(prefill?: string) {
    if (prefill && input.trim().length === 0) {
      setInput(prefill)
    }

    setIsOpen(true)
  }

  function toggleOpen() {
    setIsOpen((current) => !current)
  }

  function toggleOpenFromBubble() {
    if (isOpen) {
      setIsOpen(false)
      return
    }

    handleOpen(props.messages.length === 0 ? (props.starterQuestion ?? undefined) : undefined)
  }

  function handleBubblePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (isOpen) {
      return
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: position.x,
      startY: position.y,
      moved: false,
    }

    dragCleanupRef.current?.()

    const handleWindowPointerMove = (pointerEvent: PointerEvent) => {
      updateBubbleDrag(pointerEvent.pointerId, pointerEvent.clientX, pointerEvent.clientY)
    }
    const handleWindowPointerUp = (pointerEvent: PointerEvent) => {
      finishBubbleDrag(pointerEvent.pointerId, pointerEvent.clientX, pointerEvent.clientY)
    }
    const handleWindowPointerCancel = (pointerEvent: PointerEvent) => {
      cancelBubbleDrag(pointerEvent.pointerId)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, true)
      window.removeEventListener('pointerup', handleWindowPointerUp, true)
      window.removeEventListener('pointercancel', handleWindowPointerCancel, true)
      dragCleanupRef.current = null
    }

    dragCleanupRef.current = cleanup
    window.addEventListener('pointermove', handleWindowPointerMove, true)
    window.addEventListener('pointerup', handleWindowPointerUp, true)
    window.addEventListener('pointercancel', handleWindowPointerCancel, true)
  }

  function updateBubbleDrag(pointerId: number, clientX: number, clientY: number) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== pointerId) {
      return
    }

    const dragResult = getDraggedCopilotPosition({
      clientX,
      clientY,
      originX: dragState.originX,
      originY: dragState.originY,
      startX: dragState.startX,
      startY: dragState.startY,
    })

    if (!dragState.moved && !dragResult.moved) {
      return
    }

    dragState.moved = true
    setPosition(clampCopilotPosition({
      x: dragResult.position.x,
      y: dragResult.position.y,
      isOpen: false,
      minBottomOffset: collapsedMinBottomOffset,
      containerMinBottomOffset: collapsedMinBottomOffset,
    }))
  }

  function finishBubbleDrag(pointerId: number, clientX: number, clientY: number) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== pointerId) {
      return
    }

    const dragResult = getDraggedCopilotPosition({
      clientX,
      clientY,
      originX: dragState.originX,
      originY: dragState.originY,
      startX: dragState.startX,
      startY: dragState.startY,
    })

    if (dragResult.moved) {
      dragState.moved = true
      setPosition(clampCopilotPosition({
        x: dragResult.position.x,
        y: dragResult.position.y,
        isOpen: false,
        minBottomOffset: collapsedMinBottomOffset,
        containerMinBottomOffset: collapsedMinBottomOffset,
      }))
    }

    dragStateRef.current = null
    dragCleanupRef.current?.()
    suppressBubbleClickAfterDrag(dragState.moved)
  }

  function cancelBubbleDrag(pointerId: number) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== pointerId) {
      return
    }

    dragStateRef.current = null
    dragCleanupRef.current?.()
    suppressBubbleClickAfterDrag(dragState.moved)
  }

  function suppressBubbleClickAfterDrag(moved: boolean) {
    suppressNextBubbleClickRef.current = moved

    if (!moved) {
      return
    }

    window.setTimeout(() => {
      suppressNextBubbleClickRef.current = false
    }, 0)
  }

  function handleBubblePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    updateBubbleDrag(event.pointerId, event.clientX, event.clientY)
  }

  function handleBubblePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    finishBubbleDrag(event.pointerId, event.clientX, event.clientY)
  }

  function handleBubblePointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    cancelBubbleDrag(event.pointerId)
  }

  function handleBubbleClick() {
    if (suppressNextBubbleClickRef.current) {
      suppressNextBubbleClickRef.current = false
      return
    }

    toggleOpenFromBubble()
  }

  function handleBubbleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    suppressNextBubbleClickRef.current = true
    toggleOpenFromBubble()
  }

  return (
    <div
      className="pointer-events-none fixed z-[60] flex max-w-[min(30rem,calc(100vw-2rem))] flex-col items-end gap-3"
      style={{
        bottom: `${isOpen ? minBottomOffset : Math.max(position.y, collapsedMinBottomOffset)}px`,
        right: `${isOpen ? COPILOT_BOTTOM_OFFSET : position.x}px`,
      }}
    >
      {isOpen ? (
        <aside className="pointer-events-auto surface-panel-shell flex min-w-0 flex-col overflow-hidden rounded-(--radius-panel) border border-border/40 bg-card shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur" style={{ width: `${panelDimensions.expandedWidth}px`, height: `${panelDimensions.expandedHeight}px`, maxWidth: 'calc(100vw - 2rem)', maxHeight: `calc(100vh - ${COPILOT_NAV_SAFE_OFFSET}px)` }}>
          <header className="flex items-center justify-between gap-3 border-b border-border/30 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                <MessageSquare className="size-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary">
                  {props.title ?? 'Profile Copilot'}
                </h2>
                <p className="text-sm text-foreground-soft">{getProfileCopilotContextLabel(props.context)}</p>
              </div>
            </div>
            <Button
              aria-label="Minimize Profile Copilot"
              onClick={toggleOpen}
              size="icon-xs"
              title="Minimize Profile Copilot"
              type="button"
              variant="ghost"
            >
              <Minimize2 className="size-3.5" />
            </Button>
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
                onToggleRevisionTray={() => setShowRevisionTray((current) => !current)}
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
                movementHint={props.reserveContentSpace
                  ? 'Minimize the panel to drag its bubble. Opening it again docks the panel beside the form.'
                  : 'Drag the bubble to move it.'}
              />
            </div>
          </div>
        </aside>
      ) : null}

      {!isOpen && showProactivePrompt && props.messages.length === 0 && props.starterQuestion ? (
        <div className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border border-border/40 bg-card/95 p-1.5 pl-4 shadow-[0_12px_32px_rgba(0,0,0,0.32)] backdrop-blur">
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

      <ProfileCopilotCollapsedBubble
        collapsedPreviewTitle={collapsedPreviewTitle}
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
    </div>
  )
}
