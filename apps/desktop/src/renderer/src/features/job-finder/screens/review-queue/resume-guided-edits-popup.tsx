import { MessageSquare, Minimize2, Sparkles } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ResumeAssistantMessage } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { FieldLabel } from '@renderer/components/ui/field'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/cn'
import {
  COPILOT_NAV_SAFE_OFFSET,
  clampCopilotPosition,
  getCopilotPanelDimensions,
} from '../../components/profile/profile-copilot-rail-layout'
import { ThinkingDots } from '../../components/profile/profile-copilot-rail-sections'
import { formatTimestamp } from './resume-workspace-utils'

export function ResumeGuidedEditsPopup(props: {
  assistantMessages: readonly ResumeAssistantMessage[]
  assistantPending: boolean
  isWorkspacePending: boolean
  onSendAssistantMessage: (content: string) => void
}) {
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 20 })
  const composerId = useId()
  const panelId = useId()
  const titleId = useId()
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
  const panelDimensions = getCopilotPanelDimensions(20)

  useEffect(() => {
    if (props.assistantMessages.length > 0 || props.assistantPending) {
      setIsOpen(true)
    }
  }, [props.assistantMessages.length, props.assistantPending])

  useEffect(() => {
    setPosition((current) => clampCopilotPosition({
      x: current.x,
      y: current.y,
      isOpen,
      minBottomOffset: 20,
      containerMinBottomOffset: 20,
    }))
  }, [isOpen])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      setPosition((current) => clampCopilotPosition({
        x: current.x,
        y: current.y,
        isOpen,
        minBottomOffset: 20,
        containerMinBottomOffset: 20,
      }))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen])

  useEffect(() => {
    const transcript = transcriptRef.current

    if (!transcript) {
      return
    }

    transcript.scrollTop = transcript.scrollHeight
  }, [props.assistantMessages.length, props.assistantPending])

  function handleSend() {
    const nextInput = input.trim()

    if (props.isWorkspacePending || props.assistantPending || nextInput.length === 0) {
      return
    }

    props.onSendAssistantMessage(nextInput)
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

  function toggleOpen() {
    setIsOpen((current) => !current)
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
    setPosition(clampCopilotPosition({
      x: dragState.startX + deltaX,
      y: dragState.startY + deltaY,
      isOpen,
      minBottomOffset: 20,
      containerMinBottomOffset: 20,
    }))
  }

  function handleBubblePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    dragStateRef.current = null
    suppressNextBubbleClickRef.current = true

    if (!dragState.moved) {
      toggleOpen()
    }
  }

  function handleBubblePointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    dragStateRef.current = null
    suppressNextBubbleClickRef.current = dragState.moved
  }

  function handleBubbleClick() {
    if (suppressNextBubbleClickRef.current) {
      suppressNextBubbleClickRef.current = false
      return
    }

    toggleOpen()
  }

  function handleBubbleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    suppressNextBubbleClickRef.current = true
    toggleOpen()
  }

  return (
    <div
      className="pointer-events-none fixed z-[60] hidden max-w-[min(30rem,calc(100vw-2rem))] flex-col items-end gap-3 xl:flex"
      style={{ bottom: `${Math.max(position.y, 20)}px`, right: `${position.x}px` }}
    >
      {isOpen ? (
        <aside
          aria-labelledby={titleId}
          aria-modal="true"
          className="pointer-events-auto surface-panel-shell flex min-w-0 flex-col overflow-hidden rounded-(--radius-panel) border border-border/40 bg-card shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur"
          id={panelId}
          role="dialog"
          style={{
            width: `${panelDimensions.expandedWidth}px`,
            height: `${panelDimensions.expandedHeight}px`,
            maxWidth: 'calc(100vw - 2rem)',
            maxHeight: `calc(100vh - ${COPILOT_NAV_SAFE_OFFSET}px)`,
          }}
        >
          <header className="flex items-center justify-between gap-3 border-b border-border/30 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                <MessageSquare className="size-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary" id={titleId}>
                  Guided edits
                </h2>
                <p className="text-sm text-foreground-soft">
                  Ask for grounded resume edits for this job.
                </p>
              </div>
            </div>
            <Button aria-controls={panelId} aria-expanded={isOpen} aria-label="Minimize guided edits" onClick={toggleOpen} size="icon-xs" type="button" variant="ghost">
              <Minimize2 className="size-3.5" />
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <div
                aria-live="polite"
                aria-relevant="additions text"
                className="grid gap-3 px-4 py-4"
                ref={transcriptRef}
                role="log"
              >
                {props.assistantMessages.length ? (
                  props.assistantMessages.map((message) => {
                    const isAssistant = message.role === 'assistant'

                    return (
                      <article
                        className={cn('grid max-w-full gap-2', isAssistant ? 'justify-items-start' : 'justify-items-end')}
                        key={message.id}
                      >
                        <div
                          className={cn(
                            'max-w-full rounded-(--radius-field) border px-3 py-3 text-sm leading-6 shadow-[inset_0_1px_0_var(--surface-inset-highlight)]',
                            isAssistant
                              ? 'border-primary/25 bg-primary/10 text-foreground'
                              : 'surface-card-tint border-(--surface-panel-border) text-foreground-soft',
                          )}
                        >
                          <div className="mb-2 flex items-center gap-2 text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                            {isAssistant ? <Sparkles className="size-3.5" /> : null}
                            <span>{isAssistant ? 'Assistant' : 'You'}</span>
                            <span>{formatTimestamp(message.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                      </article>
                    )
                  })
                ) : (
                  <div className="flex min-h-48 items-center justify-center">
                    <div className="grid max-w-72 gap-3 text-center">
                      <div className="surface-card-tint mx-auto flex size-11 items-center justify-center rounded-full border border-(--surface-panel-border) text-muted-foreground">
                        <MessageSquare className="size-4" />
                      </div>
                      <p className="font-display text-sm text-foreground">No edit requests yet</p>
                      <p className="text-sm leading-6 text-foreground-soft">
                        Ask for a tighter summary, stronger bullets, or clearer job-specific wording.
                      </p>
                    </div>
                  </div>
                )}

                {props.assistantPending ? (
                  <article className="grid justify-items-start gap-2">
                    <div className="max-w-full rounded-(--radius-field) border border-primary/25 bg-primary/10 px-3 py-3 text-sm leading-6 text-foreground shadow-[inset_0_1px_0_var(--surface-inset-highlight)]">
                      <ThinkingDots label="Assistant thinking" className="mb-2" />
                      <p>Working on grounded edits while keeping the resume studio usable.</p>
                    </div>
                  </article>
                ) : null}
              </div>
            </ScrollArea>

            <div className="border-t border-(--surface-panel-border) bg-(--surface-fill-soft) p-4">
              <div className="grid gap-3">
                <div className="grid min-w-0 gap-2">
                  <FieldLabel htmlFor={composerId}>Request a resume edit</FieldLabel>
                  <Textarea
                    className="min-w-0"
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
                      ? 'Assistant is thinking. You can keep typing or move this chat while it works.'
                      : 'Press Enter to send. Shift+Enter adds a new line. Drag the bubble to move it.'}
                  </p>
                  <Button
                    className="min-w-28 px-4"
                    disabled={props.isWorkspacePending || props.assistantPending || input.trim().length === 0}
                    onClick={handleSend}
                    type="button"
                  >
                    {props.assistantPending ? 'Thinking...' : 'Send request'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      <Button
        aria-label="Guided edits"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="pointer-events-auto h-auto min-h-14 rounded-full px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.4)]"
        onClick={handleBubbleClick}
        onKeyDown={handleBubbleKeyDown}
        onPointerCancel={handleBubblePointerCancel}
        onPointerDown={handleBubblePointerDown}
        onPointerMove={handleBubblePointerMove}
        onPointerUp={handleBubblePointerUp}
        type="button"
        variant={props.assistantMessages.length > 0 || props.assistantPending ? 'primary' : 'secondary'}
      >
        <span className="flex size-9 items-center justify-center rounded-full border border-current/15 bg-background/15">
          <MessageSquare className="size-4" />
        </span>
        <span className="grid text-left leading-tight">
          <span className="text-sm font-semibold normal-case tracking-normal">Guided edits</span>
          <span className="text-xs font-medium normal-case tracking-normal text-primary-foreground/80">
            {props.assistantPending
              ? 'Replying now'
              : props.assistantMessages.length > 0
                ? 'Continue this thread'
                : 'Ask for an edit'}
          </span>
        </span>
        {props.assistantPending ? <ThinkingDots className="rounded-full border border-current/15 bg-background/10 px-2 py-1 text-primary-foreground/85" label="Thinking" /> : null}
      </Button>
    </div>
  )
}
