import { AlertCircle, CheckCircle2, Circle, Compass, FileSearch, Sparkles, Target, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ProfileSetupState, ProfileSetupStep } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { formatProfileSetupStepLabel, profileSetupStepDefinitions } from './profile-setup-steps'
import {
  badgeVariantForSeverity,
  canClearReviewItem,
  canConfirmReviewItem,
  formatReviewSeverity,
  formatReviewStatus,
  getReviewItemEditHint,
  type ProfileSetupReviewItemDisplay,
} from './profile-setup-screen-helpers'

const stepIconById = {
  import: FileSearch,
  essentials: UserRound,
  background: CheckCircle2,
  targeting: Target,
  narrative: Sparkles,
  answers: Compass,
  ready_check: CheckCircle2,
} satisfies Record<ProfileSetupStep, typeof UserRound>

export function ProfileSetupSummaryCards(props: {
  actionMessage: string | null
  importDisabledReason?: string | null
  isImportResumePending: boolean
  isProfileSetupPending: boolean
  onImportResume: () => void
  onOpenProfile: () => void
  onResumeCurrentStep: () => void
  profileSetupState: ProfileSetupState
  readinessCards: ReadonlyArray<{ label: string; value: string }>
  reviewItemCount: number
}) {
  const hasPendingReviewItems = props.reviewItemCount > 0

  return (
    <>
      <Card className="overflow-hidden rounded-(--radius-panel) border-border/40 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--surface-panel)_88%,transparent),color-mix(in_srgb,var(--surface-panel-raised)_88%,transparent))]">
        <CardHeader className="gap-3 border-b border-border/30 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={props.profileSetupState.status === 'completed' ? 'default' : 'outline'}>
              {props.profileSetupState.status.replace('_', ' ')}
            </Badge>
            {props.reviewItemCount > 0 ? <Badge variant="status">{props.reviewItemCount} review item{props.reviewItemCount === 1 ? '' : 's'} waiting</Badge> : null}
          </div>
          <CardTitle>Finish the key profile details before you move on.</CardTitle>
          <CardDescription>
            Review imported suggestions, fill the missing details, and keep every edit in sync with your full profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 pt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {props.readinessCards.map((card) => (
              <div key={card.label} className="rounded-(--radius-field) border border-border/30 bg-background/50 p-4">
                <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">{card.label}</p>
                <p className="mt-2 text-sm font-medium text-foreground">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={props.onImportResume} disabled={Boolean(props.importDisabledReason)} pending={props.isImportResumePending}>Import or refresh resume</Button>
            <Button variant="secondary" onClick={props.onResumeCurrentStep} pending={props.isProfileSetupPending}>
              {hasPendingReviewItems ? 'Review current step' : 'Open current step'}
            </Button>
            <Button variant="ghost" onClick={props.onOpenProfile} pending={props.isProfileSetupPending}>Open full Profile</Button>
          </div>
          {props.importDisabledReason ? (
            <p className="text-sm leading-6 text-foreground-soft">{props.importDisabledReason}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-(--radius-panel) border-border/40">
        <CardHeader className="gap-2 border-b border-border/30 pb-5">
          <CardTitle>What to do now</CardTitle>
          <CardDescription>
            Pick up where you left off, or reopen the current step to resolve anything the import still needs from you.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6">
          <div>
            <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">Current setup step</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{formatProfileSetupStepLabel(props.profileSetupState.currentStep)}</p>
          </div>
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4 text-sm text-foreground-soft">
            {hasPendingReviewItems
              ? `${props.reviewItemCount} review item${props.reviewItemCount === 1 ? '' : 's'} still ${props.reviewItemCount === 1 ? 'needs' : 'need'} attention in this step before the setup feels trustworthy.`
              : 'This step is in good shape right now. Save any edits here, then continue when you are ready.'}
          </div>
          {props.actionMessage ? (
            <div className="rounded-(--radius-field) border border-border/25 bg-background/70 p-4 text-sm text-foreground-soft" role="status">
              {props.actionMessage}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  )
}

export function ProfileSetupPathCard(props: {
  currentStep: ProfileSetupStep
  onGoToStep: (step: ProfileSetupStep) => void
  profileSetupState: ProfileSetupState
}) {
  return (
      <Card className="rounded-(--radius-panel) border-border/40">
        <CardHeader className="gap-2 border-b border-border/30 pb-5">
          <CardTitle>Setup path</CardTitle>
          <CardDescription>
            Move between stages when needed. Review items persist across stages so nothing gets lost.
          </CardDescription>
        </CardHeader>
      <CardContent className="grid gap-3 pt-6">
        {profileSetupStepDefinitions.map((step, index) => {
          const StepIcon = stepIconById[step.id]
          const isActive = props.currentStep === step.id
          const isComplete =
            props.profileSetupState.status === 'completed' ||
            profileSetupStepDefinitions.findIndex((entry) => entry.id === props.currentStep) > index

          return (
            <button
              key={step.id}
              className="group flex w-full items-start gap-4 rounded-(--radius-field) border border-border/30 bg-background/50 p-4 text-left transition-colors hover:border-border hover:bg-secondary/35"
              onClick={() => props.onGoToStep(step.id)}
              type="button"
            >
              <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/40 bg-secondary/50 text-foreground">
                {isComplete ? <CheckCircle2 className="size-4" /> : isActive ? <StepIcon className="size-4" /> : <Circle className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{step.label}</span>
                  {isActive ? <Badge variant="default">Current</Badge> : null}
                  {props.profileSetupState.reviewItems.some((item) => item.step === step.id && item.status === 'pending') ? (
                    <Badge variant="status">Needs review</Badge>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm leading-6 text-foreground-soft">{step.summary}</span>
              </span>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function ProfileSetupReviewQueueCard(props: {
  actionsDisabledReason?: string | null
  isReviewItemPending: (reviewItemId: string) => boolean
  items: readonly ProfileSetupReviewItemDisplay[]
  onApplyReviewAction: (reviewItemId: string, action: 'confirm' | 'dismiss' | 'clear_value') => void
  onEditReviewItem: (item: ProfileSetupReviewItemDisplay) => void
}) {
  const [pendingReviewAction, setPendingReviewAction] = useState<{
    action: 'confirm' | 'dismiss' | 'clear_value'
    reviewItemId: string
  } | null>(null)
  const pendingCount = props.items.filter((item) => item.status === 'pending').length

  useEffect(() => {
    if (!pendingReviewAction || props.isReviewItemPending(pendingReviewAction.reviewItemId)) {
      return
    }

    setPendingReviewAction(null)
  }, [pendingReviewAction, props.isReviewItemPending])

  const isReviewActionPending = (
    reviewItemId: string,
    action: 'confirm' | 'dismiss' | 'clear_value',
  ) =>
    props.isReviewItemPending(reviewItemId) &&
    pendingReviewAction?.reviewItemId === reviewItemId &&
    pendingReviewAction.action === action

  const applyReviewAction = (
    reviewItemId: string,
    action: 'confirm' | 'dismiss' | 'clear_value',
  ) => {
    setPendingReviewAction({ action, reviewItemId })
    props.onApplyReviewAction(reviewItemId, action)
  }

  return (
    <Card className="min-h-0 flex-1 overflow-hidden rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Step review queue</CardTitle>
        <CardDescription>
          Imported suggestions and missing fields stay here until you confirm, dismiss, or clear them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
        <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4 text-sm leading-6 text-foreground-soft">
          {pendingCount > 0
            ? `${pendingCount} item${pendingCount === 1 ? '' : 's'} still ${pendingCount === 1 ? 'needs' : 'need'} confirmation or an edit in this step.`
            : 'Everything mapped to this step is already resolved in the saved workspace state.'}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-3 pr-4">
            {props.items.length > 0 ? (
              props.items.map((item) => (
                <div key={item.id} className="rounded-(--radius-field) border border-border/30 bg-background/50 p-4">
                  {getReviewItemEditHint(item) ? (
                    <div className="mb-3 rounded-(--radius-field) border border-dashed border-border/40 bg-background/70 p-3 text-sm leading-6 text-foreground-soft">
                      {getReviewItemEditHint(item)}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <Badge variant={badgeVariantForSeverity(item.severity)}>{formatReviewSeverity(item.severity)}</Badge>
                        <Badge variant={item.status === 'pending' ? 'outline' : 'default'}>{formatReviewStatus(item.status)}</Badge>
                        {item.statusSource === 'draft' ? <Badge variant="status">Unsaved draft</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground-soft">{item.reason}</p>
                      {item.statusSource === 'draft' ? (
                        <p className="mt-2 text-sm leading-6 text-foreground-soft">
                          This item is already resolved in your current draft. Save this step to keep that resolution.
                        </p>
                      ) : null}
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox checked={item.status !== 'pending'} disabled />
                      {item.statusSource === 'draft' ? 'Resolved in draft' : 'Resolved'}
                    </label>
                  </div>
                  {item.proposedValue ? (
                    <div className="mt-3 rounded-(--radius-field) border border-dashed border-border/40 bg-background/70 p-3">
                      <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">Suggested value</p>
                      <p className="mt-2 text-sm text-foreground">{item.proposedValue}</p>
                    </div>
                  ) : null}
                  {item.sourceSnippet ? (
                    <div className="mt-3 flex gap-2 rounded-(--radius-field) bg-secondary/30 p-3 text-sm text-foreground-soft">
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <p>{item.sourceSnippet}</p>
                    </div>
                  ) : null}
                  {item.status === 'pending' ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button aria-label={`Edit ${item.label}`} disabled={Boolean(props.actionsDisabledReason)} onClick={() => props.onEditReviewItem(item)} size="sm" type="button" variant="secondary">Edit this</Button>
                      {canConfirmReviewItem(item) ? (
                        <Button disabled={Boolean(props.actionsDisabledReason)} pending={isReviewActionPending(item.id, 'confirm')} onClick={() => applyReviewAction(item.id, 'confirm')} size="sm" type="button">Confirm</Button>
                      ) : null}
                      {canClearReviewItem(item) ? (
                        <Button disabled={Boolean(props.actionsDisabledReason)} pending={isReviewActionPending(item.id, 'clear_value')} onClick={() => applyReviewAction(item.id, 'clear_value')} size="sm" type="button" variant="secondary">Clear current value</Button>
                      ) : null}
                      <Button disabled={Boolean(props.actionsDisabledReason)} pending={isReviewActionPending(item.id, 'dismiss')} onClick={() => applyReviewAction(item.id, 'dismiss')} size="sm" type="button" variant="ghost">Dismiss for now</Button>
                    </div>
                  ) : null}
                  {item.status === 'pending' && props.actionsDisabledReason ? (
                    <p className="mt-2 text-(length:--text-tiny) text-muted-foreground">{props.actionsDisabledReason}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-(--radius-field) border border-dashed border-border/40 bg-background/50 p-4 text-sm leading-6 text-foreground-soft">
                No review items for this step right now. Save any edits and continue when ready.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
