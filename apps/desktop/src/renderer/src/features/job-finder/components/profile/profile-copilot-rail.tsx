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
import { COPILOT_NAV_SAFE_OFFSET, clampCopilotPosition, getCopilotPanelDimensions } from './profile-copilot-rail-layout'
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
  minBottomOffset?: number
  collapsedMinBottomOffset?: number
  title?: string
}) {
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [showRevisionTray, setShowRevisionTray] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 20 })
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
  const suppressNextBubbleClickRef = useRef(false)
  const contextKey = getProfileCopilotContextKey(props.context)
  const isPendingHere = props.pendingContextKey === contextKey
  const minBottomOffset = props.minBottomOffset ?? 20
  const collapsedMinBottomOffset = props.collapsedMinBottomOffset ?? 20
  const panelDimensions = getCopilotPanelDimensions(minBottomOffset)
  const collapsedPreviewTitle = isPendingHere
    ? 'Working on your last request'
    : props.messages.length > 0
      ? 'Continue this thread'
      : props.starterQuestion
        ? 'Top missing detail'
        : 'Ask for a structured edit'
  const recentRevisions = useMemo(() => props.revisions.slice(0, 4), [props.revisions])
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
    if (props.messages.length > 0 || isPendingHere) {
      setIsOpen(true)
    }
  }, [isPendingHere, props.messages.length])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      const currentMinBottomOffset = isOpen ? minBottomOffset : collapsedMinBottomOffset
      setPosition((current) => clampCopilotPosition({
        x: current.x,
        y: current.y,
        isOpen,
        minBottomOffset: currentMinBottomOffset,
      }))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [collapsedMinBottomOffset, isOpen, minBottomOffset])

  useEffect(() => {
    const currentMinBottomOffset = isOpen ? minBottomOffset : collapsedMinBottomOffset
    setPosition((current) => clampCopilotPosition({
      x: current.x,
      y: current.y,
      isOpen,
      minBottomOffset: currentMinBottomOffset,
    }))
  }, [collapsedMinBottomOffset, isOpen, minBottomOffset])

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
    dragStateRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: position.x,
      startY: position.y,
      moved: false,
    }

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleBubblePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    const deltaX = dragState.originX - event.clientX
    const deltaY = dragState.originY - event.clientY

    if (!dragState.moved && Math.abs(deltaX) + Math.abs(deltaY) < 6) {
      return
    }

    dragState.moved = true
    const currentMinBottomOffset = isOpen ? minBottomOffset : collapsedMinBottomOffset
    setPosition(clampCopilotPosition({
      x: dragState.startX + deltaX,
      y: dragState.startY + deltaY,
      isOpen,
      minBottomOffset: currentMinBottomOffset,
    }))
  }

  function handleBubblePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    dragStateRef.current = null

    if (!dragState.moved) {
      suppressNextBubbleClickRef.current = true
      toggleOpenFromBubble()
    }
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
      style={{ bottom: `${Math.max(position.y, isOpen ? minBottomOffset : collapsedMinBottomOffset)}px`, right: `${position.x}px` }}
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
              onClick={toggleOpen}
              size="icon-xs"
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
              onUseStarterQuestion={() => setInput(props.starterQuestion ?? '')}
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
              />
            </div>
          </div>
        </aside>
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
        onPointerUp={handleBubblePointerUp}
        title={props.title}
      />
    </div>
  )
}
