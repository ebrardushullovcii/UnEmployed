import { ChevronDown, MessageSquare, PanelBottomClose, PanelBottomOpen, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { JobFinderWorkspaceSnapshot } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { FieldLabel } from '@renderer/components/ui/field'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/cn'
import { formatTimestamp } from '../../lib/job-finder-utils'
import { ProfileCopilotMessageContent } from './profile-copilot-message-content'
import { describePatchOperation, getPatchGroupBadgeVariant } from './profile-copilot-rail.shared'

type ProfileCopilotMessage = JobFinderWorkspaceSnapshot['profileCopilotMessages'][number]
type ProfileRevision = JobFinderWorkspaceSnapshot['profileRevisions'][number]

export interface ProfileCopilotRevisionEntry {
  revision: ProfileRevision
  summary: string
}

export function ThinkingDots(props: {
  label: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-(length:--text-tiny) uppercase tracking-[0.18em] text-muted-foreground', props.className)}>
      <Sparkles className="size-3.5 animate-pulse" />
      <span>{props.label}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1 text-current/80">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 rounded-full bg-current animate-bounce"
            style={{ animationDelay: `${index * 120}ms`, animationDuration: '900ms' }}
          />
        ))}
      </span>
    </span>
  )
}

export function ProfileCopilotTranscript(props: {
  busy: boolean
  actionsDisabledReason?: string | null | undefined
  emptyStateDescription: string
  emptyStateTitle: string
  isPendingHere: boolean
  messages: readonly ProfileCopilotMessage[]
  onApplyPatchGroup: (patchGroupId: string) => void
  onRejectPatchGroup: (patchGroupId: string) => void
  onUseStarterQuestion: () => void
  starterQuestion?: string | null | undefined
  transcriptRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div
        aria-live="polite"
        aria-relevant="additions text"
        className="grid gap-3 px-4 py-4"
        ref={props.transcriptRef}
        role="log"
      >
        {props.messages.length > 0 ? (
          props.messages.map((message) => {
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
                    <span>{isAssistant ? 'Copilot' : 'You'}</span>
                    <span>{formatTimestamp(message.createdAt)}</span>
                  </div>
                  {isAssistant ? <ProfileCopilotMessageContent content={message.content} /> : <p className="whitespace-pre-wrap break-words">{message.content}</p>}

                  {message.patchGroups.length > 0 ? (
                    <div className="mt-3 grid gap-2 border-t border-border/25 pt-3">
                      {message.patchGroups.map((patchGroup) => (
                        <div
                          className="grid gap-2 rounded-(--radius-field) border border-border/35 bg-background/70 p-3"
                          key={patchGroup.id}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">{patchGroup.summary}</p>
                              <p className="text-(length:--text-tiny) uppercase tracking-[0.18em] text-muted-foreground">
                                {patchGroup.operations.length} structured change{patchGroup.operations.length === 1 ? '' : 's'}
                              </p>
                            </div>
                            <Badge variant={getPatchGroupBadgeVariant(patchGroup.applyMode)}>{patchGroup.applyMode}</Badge>
                          </div>

                          <ul className="grid gap-1 text-sm text-foreground-soft">
                            {patchGroup.operations.map((operation, index) => (
                              <li key={`${patchGroup.id}_${index}`}>• {describePatchOperation(operation)}</li>
                            ))}
                          </ul>

                          {patchGroup.applyMode === 'needs_review' ? (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button
                                disabled={props.busy || Boolean(props.actionsDisabledReason)}
                                onClick={() => props.onApplyPatchGroup(patchGroup.id)}
                                size="sm"
                                type="button"
                              >
                                Apply changes
                              </Button>
                              <Button
                                disabled={props.busy || Boolean(props.actionsDisabledReason)}
                                onClick={() => props.onRejectPatchGroup(patchGroup.id)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : null}
                          {props.actionsDisabledReason ? (
                            <p className="text-(length:--text-tiny) text-muted-foreground">
                              {props.actionsDisabledReason}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })
        ) : (
          <div className="flex min-h-48 items-center justify-center">
            <div className="grid max-w-72 gap-3 text-center">
              <div className="surface-card-tint mx-auto flex size-11 items-center justify-center rounded-full border border-(--surface-panel-border) text-muted-foreground">
                <Wand2 className="size-4" />
              </div>
              <p className="font-display text-sm text-foreground">{props.emptyStateTitle}</p>
              <p className="text-sm leading-6 text-foreground-soft">{props.emptyStateDescription}</p>
              {props.starterQuestion ? (
                <Button className="justify-self-center" onClick={props.onUseStarterQuestion} size="sm" type="button" variant="secondary">
                  Use starter question
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {props.isPendingHere ? (
          <article className="grid justify-items-start gap-2">
            <div className="max-w-full rounded-(--radius-field) border border-primary/25 bg-primary/10 px-3 py-3 text-sm leading-6 text-foreground shadow-[inset_0_1px_0_var(--surface-inset-highlight)]">
              <ThinkingDots label="Copilot thinking" className="mb-2" />
              <p>Thinking through the safest edit while keeping the rest of the panel usable.</p>
            </div>
          </article>
        ) : null}
      </div>
    </ScrollArea>
  )
}

export function ProfileCopilotRevisionTray(props: {
  busy: boolean
  actionsDisabledReason?: string | null | undefined
  recentRevisionEntries: readonly ProfileCopilotRevisionEntry[]
  revisionCount: number
  showRevisionTray: boolean
  onToggleRevisionTray: () => void
  onUndoRevision: (revisionId: string) => void
}) {
  return (
    <>
      {props.recentRevisionEntries.length > 0 ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-(--radius-field) border border-border/30 bg-background/70 px-3 py-2">
          <div className="min-w-0">
            <p className="text-(length:--text-tiny) uppercase tracking-[0.18em] text-muted-foreground">Recent assistant changes</p>
            <p className="truncate text-sm text-foreground-soft">{props.recentRevisionEntries[0]?.summary}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="status">{props.revisionCount}</Badge>
              <Button disabled={props.busy} onClick={props.onToggleRevisionTray} size="compact" type="button" variant="ghost">
                {props.showRevisionTray ? <PanelBottomClose className="size-3.5" /> : <PanelBottomOpen className="size-3.5" />}
                {props.showRevisionTray ? 'Hide' : 'Show'}
              </Button>
          </div>
        </div>
      ) : null}

      {props.showRevisionTray && props.recentRevisionEntries.length > 0 ? (
        <div className="mb-4 grid max-h-48 gap-2 overflow-y-auto rounded-(--radius-field) border border-border/35 bg-background/70 p-3">
          {props.recentRevisionEntries.map(({ revision, summary }) => (
            <div
              className="flex items-start justify-between gap-3 rounded-(--radius-chip) border border-border/25 bg-background/80 px-3 py-2"
              key={revision.id}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{summary}</p>
                <p className="text-(length:--text-tiny) text-muted-foreground">{formatTimestamp(revision.createdAt)}</p>
              </div>
              <Button disabled={props.busy || Boolean(props.actionsDisabledReason)} onClick={() => props.onUndoRevision(revision.id)} size="compact" type="button" variant="ghost">
                <RotateCcw className="size-3.5" />
                Undo
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {props.showRevisionTray && props.actionsDisabledReason ? (
        <p className="text-(length:--text-tiny) text-muted-foreground">{props.actionsDisabledReason}</p>
      ) : null}
    </>
  )
}

export function ProfileCopilotComposer(props: {
  busy: boolean
  composerId: string
  input: string
  isPendingHere: boolean
  onInputChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  placeholder: string
  sendDisabledReason?: string | null | undefined
  starterQuestion?: string | null | undefined
}) {
  return (
    <div className="grid gap-3">
      <div className="grid min-w-0 gap-2">
        <FieldLabel htmlFor={props.composerId}>Ask for a structured profile edit</FieldLabel>
        <Textarea
          className="min-w-0"
          id={props.composerId}
          onChange={(event) => props.onInputChange(event.currentTarget.value)}
          onKeyDown={props.onKeyDown}
          placeholder={props.starterQuestion ?? props.placeholder}
          rows={4}
          value={props.input}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-(length:--text-tiny) text-muted-foreground">
          {props.sendDisabledReason
            ? props.sendDisabledReason
            : props.isPendingHere
            ? 'Copilot is thinking. You can keep typing or drag the bubble while it works.'
            : 'Press Enter to send. Shift+Enter adds a new line. Drag the bubble to move it.'}
        </p>
        <Button
          className="min-w-28 px-4"
          disabled={props.busy || props.isPendingHere || props.input.trim().length === 0 || Boolean(props.sendDisabledReason)}
          onClick={props.onSend}
          type="button"
        >
          {props.isPendingHere ? 'Thinking...' : 'Send request'}
        </Button>
      </div>
    </div>
  )
}

export function ProfileCopilotCollapsedBubble(props: {
  onClick: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  collapsedPreviewTitle: string
  isOpen: boolean
  isPendingHere: boolean
  messageCount: number
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  title?: string | undefined
}) {
  return (
    <Button
      aria-expanded={props.isOpen}
      aria-haspopup="dialog"
      className="pointer-events-auto h-auto min-h-14 rounded-full px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.4)]"
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerCancel={props.onPointerCancel}
      onPointerUp={props.onPointerUp}
      type="button"
      variant={props.messageCount > 0 || props.isPendingHere ? 'primary' : 'secondary'}
    >
      <span className="flex size-9 items-center justify-center rounded-full border border-current/15 bg-background/15">
        <MessageSquare className="size-4" />
      </span>
      <span className="grid text-left leading-tight">
        <span className="text-sm font-semibold normal-case tracking-normal">{props.title ?? 'Profile Copilot'}</span>
        <span className="text-xs font-medium normal-case tracking-normal text-primary-foreground/80">
          {props.isPendingHere ? 'Replying now' : props.messageCount > 0 ? props.collapsedPreviewTitle : 'Ask for an edit'}
        </span>
      </span>
      {props.isPendingHere ? <ThinkingDots className="rounded-full border border-current/15 bg-background/10 px-2 py-1 text-primary-foreground/85" label="Thinking" /> : null}
      <span className="rounded-full border border-current/15 bg-background/10 p-1">
        <ChevronDown className={cn('size-3 transition-transform', props.isOpen ? 'rotate-180' : 'rotate-0')} />
      </span>
    </Button>
  )
}
