import { useCallback, useId, useMemo, useState, type ChangeEvent } from 'react'
import type {
  EditableSourceInstructionArtifact,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact
} from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { FieldLabel } from '@renderer/components/ui/field'
import { formatDuration, formatRunStateLabel } from '@renderer/features/job-finder/lib/job-finder-utils'
import type { SearchPreferencesEditorValues } from '../../lib/profile-editor'
import { CheckboxField } from '../checkbox-field'
import { ProfileInput, ProfileTextarea } from './profile-form-primitives'
import { ProfileLearnedInstructionsPanel } from './profile-learned-instructions-panel'
import { ProfileSourceDebugReviewModal } from './profile-source-debug-review-modal'
import {
  buildLearnedInstructionIntelligenceSummaries,
  type LearnedInstructionField,
  type LearnedInstructionSection,
  buildLearnedInstructionSections,
  describeLearnedInstructionUsage,
  hasValidAbsoluteStartingUrl,
  normalizeEditableInstructionInput,
  updateArtifactInstructionSection
} from './profile-source-debug-instruction-utils'
import { useProfileSourceDebugReview } from './use-profile-source-debug-review'

type DiscoveryTargetValue = SearchPreferencesEditorValues['discoveryTargets'][number]

function formatInstructionStatusSummary(target: DiscoveryTargetValue): string {
  switch (target.instructionStatus) {
    case 'validated':
      return target.lastVerifiedAt
        ? `Saved guidance ready - checked ${new Date(target.lastVerifiedAt).toLocaleString()}`
        : 'Saved guidance ready'
    case 'draft':
      return 'Draft guidance saved'
    case 'stale':
      return target.staleReason ? `Guidance needs review - ${target.staleReason}` : 'Guidance needs review'
    case 'unsupported':
      return 'Not supported yet'
    default:
      return 'No saved guidance yet'
  }
}

interface ProfileDiscoveryTargetRowProps {
  busy: boolean
  discoveryTargets: readonly DiscoveryTargetValue[]
  index: number
  instructionArtifact: SourceInstructionArtifact | null
  isSourceDebugPending: (targetId: string) => boolean
  isSourceInstructionPending: (targetId: string) => boolean
  isSourceInstructionVerifyPending: (instructionId: string) => boolean
  isTargetDiscoveryPending: (targetId: string) => boolean
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onRunDiscoveryForTarget?: (targetId: string) => void
  onRunSourceDebug: (targetId: string) => void
  onSaveSourceInstructionArtifact: (targetId: string, artifact: EditableSourceInstructionArtifact) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  target: DiscoveryTargetValue
  updateDiscoveryTargets: (nextTargets: SearchPreferencesEditorValues['discoveryTargets']) => void
}

export function ProfileDiscoveryTargetRow(props: ProfileDiscoveryTargetRowProps) {
  const baseId = useId()
  const labelId = `${baseId}-label`
  const startingUrlId = `${baseId}-starting-url`
  const instructionsId = `${baseId}-instructions`
  const targetLabel = props.target.label.trim()
  const displayName = targetLabel || 'New source'
  const accessibleLabel = targetLabel || `New source ${props.index + 1}`
  const learnedInstructionSections = useMemo(
    () => buildLearnedInstructionSections(props.instructionArtifact),
    [props.instructionArtifact]
  )
  const learnedInstructionIntelligenceSummaries = useMemo(
    () => buildLearnedInstructionIntelligenceSummaries(props.instructionArtifact),
    [props.instructionArtifact]
  )
  const {
    latestDebugRun,
    reviewDetails,
    reviewError,
    reviewLoading,
    reviewOpen,
    selectedRunId,
    targetRuns,
    handleCloseReview,
    handleLoadRun,
    handleReviewLatestRun,
    handleRerun,
    handleVerify
  } = useProfileSourceDebugReview({
    getRunDetails: props.onGetSourceDebugRunDetails,
    onRunSourceDebug: props.onRunSourceDebug,
    onVerifySourceInstructions: props.onVerifySourceInstructions,
    recentSourceDebugRuns: props.recentSourceDebugRuns,
    targetId: props.target.id,
    targetLastDebugRunId: props.target.lastDebugRunId
  })
  const latestDebugRunLabel = latestDebugRun
    ? `${formatRunStateLabel(latestDebugRun.state)}${latestDebugRun.completedAt ? ` • ${new Date(latestDebugRun.completedAt).toLocaleString()}` : ''}`
    : null
  const [editingInstruction, setEditingInstruction] = useState<{
    field: LearnedInstructionField
    normalizedKey: string
  } | null>(null)
  const [editingInstructionValue, setEditingInstructionValue] = useState('')
  const isTargetDiscoveryPending = props.isTargetDiscoveryPending(props.target.id)
  const isTargetSourceDebugPending = props.isSourceDebugPending(props.target.id)
  const isInstructionSavePending = props.isSourceInstructionPending(props.target.id)

  const updateTarget = (nextTarget: DiscoveryTargetValue) => {
    const existingTarget = props.discoveryTargets[props.index]
    const nextTargets = [...props.discoveryTargets]
    nextTargets[props.index] = {
      ...nextTarget,
      adapterKind: nextTarget.adapterKind ?? existingTarget?.adapterKind ?? 'auto'
    }
    props.updateDiscoveryTargets(nextTargets)
  }

  const saveInstructionArtifact = (artifact: EditableSourceInstructionArtifact) => {
    props.onSaveSourceInstructionArtifact(props.target.id, artifact)
  }

  const beginEditingInstruction = (
    section: LearnedInstructionSection,
    line: LearnedInstructionSection['lines'][number]
  ) => {
    setEditingInstruction({
      field: section.field,
      normalizedKey: line.normalizedKey
    })
    setEditingInstructionValue(line.sourceText)
  }

  const cancelEditingInstruction = () => {
    setEditingInstruction(null)
    setEditingInstructionValue('')
  }

  const persistEditedInstruction = () => {
    if (!props.instructionArtifact || !editingInstruction) {
      return
    }

    const nextValue = normalizeEditableInstructionInput(editingInstruction.field, editingInstructionValue)
    if (!nextValue) {
      return
    }

    saveInstructionArtifact(
      updateArtifactInstructionSection(
        props.instructionArtifact,
        editingInstruction.field,
        editingInstruction.normalizedKey,
        nextValue
      )
    )
    cancelEditingInstruction()
  }

  const removeInstructionLine = (
    section: LearnedInstructionSection,
    line: LearnedInstructionSection['lines'][number]
  ) => {
    if (!props.instructionArtifact) {
      return
    }

    saveInstructionArtifact(
      updateArtifactInstructionSection(props.instructionArtifact, section.field, line.normalizedKey, null)
    )

    if (editingInstruction?.field === section.field && editingInstruction.normalizedKey === line.normalizedKey) {
      cancelEditingInstruction()
    }
  }

  const moveTarget = useCallback((direction: -1 | 1) => {
    const nextIndex = props.index + direction
    const nextTargets = [...props.discoveryTargets]
    const currentTarget = nextTargets[props.index]
    const adjacentTarget = nextTargets[nextIndex]

    if (!currentTarget || !adjacentTarget) {
      return
    }

    nextTargets[props.index] = adjacentTarget
    nextTargets[nextIndex] = currentTarget
    props.updateDiscoveryTargets(nextTargets)
  }, [props.discoveryTargets, props.index, props.updateDiscoveryTargets])

  const handleRunSourceDebug = useCallback(() => {
    props.onRunSourceDebug(props.target.id)
  }, [props.onRunSourceDebug, props.target.id])

  const handleRunDiscoveryForTarget = useCallback(() => {
    props.onRunDiscoveryForTarget?.(props.target.id)
  }, [props.onRunDiscoveryForTarget, props.target.id])

  const handleMoveTargetUp = useCallback(() => {
    moveTarget(-1)
  }, [moveTarget])

  const handleMoveTargetDown = useCallback(() => {
    moveTarget(1)
  }, [moveTarget])

  const handleRemoveTarget = useCallback(() => {
    props.updateDiscoveryTargets(props.discoveryTargets.filter((entry) => entry.id !== props.target.id))
  }, [props.discoveryTargets, props.target.id, props.updateDiscoveryTargets])

  const handleToggleEnabled = useCallback((checked: boolean) => {
    updateTarget({ ...props.target, enabled: checked })
  }, [props.discoveryTargets, props.index, props.target, props.updateDiscoveryTargets])

  const handleLabelChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    updateTarget({ ...props.target, label: event.target.value })
  }, [props.discoveryTargets, props.index, props.target, props.updateDiscoveryTargets])

  const handleStartingUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    updateTarget({ ...props.target, startingUrl: event.target.value })
  }, [props.discoveryTargets, props.index, props.target, props.updateDiscoveryTargets])

  const handleCustomInstructionsChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    updateTarget({ ...props.target, customInstructions: event.target.value })
  }, [props.discoveryTargets, props.index, props.target, props.updateDiscoveryTargets])

  return (
    <article className="surface-card-tint grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">{displayName}</h3>
          <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">Source {props.index + 1}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.onRunDiscoveryForTarget ? (
            <Button
              aria-label={`Run search now for ${accessibleLabel}`}
              disabled={!props.target.enabled || !hasValidAbsoluteStartingUrl(props.target.startingUrl)}
              pending={isTargetDiscoveryPending}
              onClick={handleRunDiscoveryForTarget}
              type="button"
              variant="primary"
            >
              Search now
            </Button>
          ) : null}
          <Button
            aria-label={`Check this source for ${accessibleLabel}`}
            disabled={!hasValidAbsoluteStartingUrl(props.target.startingUrl)}
            pending={isTargetSourceDebugPending}
            onClick={handleRunSourceDebug}
            type="button"
            variant="secondary"
          >
            Check source
          </Button>
          <Button
            aria-label={`Move ${accessibleLabel} up`}
            disabled={props.index === 0}
            onClick={handleMoveTargetUp}
            type="button"
            variant="ghost"
          >
            Move up
          </Button>
          <Button
            aria-label={`Move ${accessibleLabel} down`}
            disabled={props.index === props.discoveryTargets.length - 1}
            onClick={handleMoveTargetDown}
            type="button"
            variant="ghost"
          >
            Move down
          </Button>
          <Button
            aria-label={`Remove ${accessibleLabel}`}
            onClick={handleRemoveTarget}
            type="button"
            variant="ghost"
          >
            Remove
          </Button>
        </div>
      </header>

      <div className="grid gap-(--gap-content) md:grid-cols-2">
        <div className="grid h-full min-w-0 content-start gap-(--gap-field) md:col-span-2">
          <FieldLabel htmlFor={labelId}>Source name</FieldLabel>
          <ProfileInput id={labelId} onChange={handleLabelChange} placeholder="LinkedIn or Stripe Careers" value={props.target.label} />
        </div>
        <div className="grid h-full min-w-0 content-start gap-(--gap-field) md:col-span-2">
          <FieldLabel htmlFor={startingUrlId}>Starting page URL</FieldLabel>
          <ProfileInput
            id={startingUrlId}
            onChange={handleStartingUrlChange}
            placeholder="https://jobs.example.com/search"
            value={props.target.startingUrl}
          />
        </div>
        <div className="grid h-full min-w-0 content-start gap-(--gap-field) md:col-span-2">
          <FieldLabel htmlFor={instructionsId}>Source notes</FieldLabel>
          <ProfileTextarea
            className="min-h-(--textarea-tall)"
            id={instructionsId}
            onChange={handleCustomInstructionsChange}
            placeholder="Optional: add notes like 'skip contract roles' or 'focus on remote jobs'."
            rows={4}
            value={props.target.customInstructions}
          />
        </div>
        {latestDebugRun ? (
          <div className="surface-card-tint grid h-full min-w-0 content-start gap-1 rounded-(--radius-field) border border-(--surface-panel-border) p-3 md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
                Last source check
              </p>
              <Button
                aria-label={`Review the latest source check for ${accessibleLabel}`}
                pending={isTargetSourceDebugPending}
                onClick={handleReviewLatestRun}
                type="button"
                variant="ghost"
              >
                Review check
              </Button>
            </div>
            <div aria-live="polite" className="grid gap-1" role="status">
              <p className="text-[0.88rem] leading-6 text-foreground">{latestDebugRunLabel}</p>
              {latestDebugRun.manualPrerequisiteSummary || latestDebugRun.finalSummary ? (
                <p className="text-[0.82rem] leading-6 text-foreground-soft">
                  {latestDebugRun.manualPrerequisiteSummary ?? latestDebugRun.finalSummary}
                </p>
              ) : null}
              {latestDebugRun.timing ? (
                <p className="text-[0.78rem] leading-6 text-foreground-muted">
                  {`Duration: ${formatDuration(latestDebugRun.timing.totalDurationMs)}`}
                  {latestDebugRun.timing.longestGapMs > 10000 ? ` · Longest quiet gap: ${formatDuration(latestDebugRun.timing.longestGapMs)}` : ''}
                  {latestDebugRun.timing.finalReviewMs != null ? ` · AI review: ${formatDuration(latestDebugRun.timing.finalReviewMs)}` : ''}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <ProfileLearnedInstructionsPanel
          editingInstruction={editingInstruction}
          editingInstructionValue={editingInstructionValue}
          intelligenceSummaries={learnedInstructionIntelligenceSummaries}
          isInstructionSavePending={isInstructionSavePending}
          instructionArtifactDescription={describeLearnedInstructionUsage(props.instructionArtifact)}
          onBeginEditingInstruction={beginEditingInstruction}
          onCancelEditingInstruction={cancelEditingInstruction}
          onChangeEditingInstructionValue={setEditingInstructionValue}
          onPersistEditedInstruction={persistEditedInstruction}
          onRemoveInstructionLine={removeInstructionLine}
          sections={learnedInstructionSections}
          targetId={props.target.id}
        />
        <div className="grid gap-2 md:col-span-2">
          <CheckboxField
            checked={props.target.enabled}
            label="Include this source in searches"
            onCheckedChange={handleToggleEnabled}
          />
          <p aria-live="polite" aria-atomic="true" className="text-[0.82rem] leading-6 text-foreground-soft" role="status">
            <strong>{formatInstructionStatusSummary(props.target)}</strong>
          </p>
        </div>
      </div>
      <ProfileSourceDebugReviewModal
        details={reviewDetails}
        errorMessage={reviewError}
        isSourceDebugPending={isTargetSourceDebugPending}
        isVerifyPending={props.isSourceInstructionVerifyPending}
        loading={reviewLoading}
        onClose={handleCloseReview}
        onLoadRun={handleLoadRun}
        onRerun={handleRerun}
        onVerify={handleVerify}
        open={reviewOpen}
        recentRuns={targetRuns}
        selectedRunId={selectedRunId}
        targetLabel={displayName}
      />
    </article>
  )
}
