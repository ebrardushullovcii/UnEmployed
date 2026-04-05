import { useCallback, useId, useMemo, useState, type ChangeEvent } from 'react'
import type {
  EditableSourceInstructionArtifact,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact
} from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { FieldLabel } from '@renderer/components/ui/field'
import { formatDuration, formatStatusLabel } from '../../lib/job-finder-utils'
import type { SearchPreferencesEditorValues } from '../../lib/profile-editor'
import { CheckboxField } from '../checkbox-field'
import { ProfileInput, ProfileTextarea } from './profile-form-primitives'
import { ProfileLearnedInstructionsPanel } from './profile-learned-instructions-panel'
import { ProfileSourceDebugReviewModal } from './profile-source-debug-review-modal'
import {
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

interface ProfileDiscoveryTargetRowProps {
  busy: boolean
  discoveryTargets: readonly DiscoveryTargetValue[]
  index: number
  instructionArtifact: SourceInstructionArtifact | null
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
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
  const displayName = props.target.label.trim() || `Target ${props.index + 1}`
  const learnedInstructionSections = useMemo(
    () => buildLearnedInstructionSections(props.instructionArtifact),
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
    ? `${formatStatusLabel(latestDebugRun.state)}${latestDebugRun.completedAt ? ` • ${new Date(latestDebugRun.completedAt).toLocaleString()}` : ''}`
    : null
  const [editingInstruction, setEditingInstruction] = useState<{
    field: LearnedInstructionField
    normalizedKey: string
  } | null>(null)
  const [editingInstructionValue, setEditingInstructionValue] = useState('')

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
        <h3 className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">Target {props.index + 1}</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            aria-label={`Debug source for ${displayName} (target ${props.index + 1})`}
            disabled={props.busy || !hasValidAbsoluteStartingUrl(props.target.startingUrl)}
            onClick={handleRunSourceDebug}
            type="button"
            variant="secondary"
          >
            Debug source
          </Button>
          <Button
            aria-label={`Move ${displayName} up`}
            disabled={props.index === 0}
            onClick={handleMoveTargetUp}
            type="button"
            variant="ghost"
          >
            Move up
          </Button>
          <Button
            aria-label={`Move ${displayName} down`}
            disabled={props.index === props.discoveryTargets.length - 1}
            onClick={handleMoveTargetDown}
            type="button"
            variant="ghost"
          >
            Move down
          </Button>
          <Button
            aria-label={`Remove ${displayName}`}
            onClick={handleRemoveTarget}
            type="button"
            variant="ghost"
          >
            Remove
          </Button>
        </div>
      </header>

      <div className="grid gap-(--gap-content) md:grid-cols-2">
        <div className="grid h-full min-w-0 content-start gap-(--gap-field)">
          <FieldLabel htmlFor={labelId}>Site label</FieldLabel>
          <ProfileInput id={labelId} onChange={handleLabelChange} value={props.target.label} />
        </div>
        <div className="grid h-full min-w-0 content-start gap-(--gap-field)">
          <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">Target handling</p>
          <p className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-3 py-3 text-[0.92rem] leading-6 text-foreground-soft">
            Resolved automatically from the starting URL and the learned source guidance for this target.
          </p>
        </div>
        <div className="grid h-full min-w-0 content-start gap-(--gap-field) md:col-span-2">
          <FieldLabel htmlFor={startingUrlId}>Starting URL</FieldLabel>
          <ProfileInput
            id={startingUrlId}
            onChange={handleStartingUrlChange}
            placeholder="https://jobs.example.com/search"
            value={props.target.startingUrl}
          />
        </div>
        <div className="grid h-full min-w-0 content-start gap-(--gap-field) md:col-span-2">
          <FieldLabel htmlFor={instructionsId}>Custom override instructions</FieldLabel>
          <ProfileTextarea
            className="min-h-(--textarea-tall)"
            id={instructionsId}
            onChange={handleCustomInstructionsChange}
            placeholder="Optional: add your own override notes. Learned source instructions are stored separately and used automatically."
            rows={4}
            value={props.target.customInstructions}
          />
          <p className="text-[0.82rem] leading-6 text-foreground-soft">
            This field is only for your manual overrides. Debug-source guidance is stored separately so it does not overwrite your notes.
          </p>
        </div>
        {latestDebugRun ? (
          <div className="surface-card-tint grid h-full min-w-0 content-start gap-1 rounded-(--radius-field) border border-(--surface-panel-border) p-3 md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
                Last source-debug run
              </p>
              <Button
                aria-label={`Review the latest source-debug run for ${displayName} (target ${props.index + 1})`}
                disabled={props.busy}
                onClick={handleReviewLatestRun}
                type="button"
                variant="ghost"
              >
                Review run
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
          busy={props.busy}
          editingInstruction={editingInstruction}
          editingInstructionValue={editingInstructionValue}
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
            label="Enabled for sequential discovery runs"
            onCheckedChange={handleToggleEnabled}
          />
          <p aria-live="polite" aria-atomic="true" className="text-[0.82rem] leading-6 text-foreground-soft" role="status">
            Instruction status: <strong>{formatStatusLabel(props.target.instructionStatus)}</strong>
            {props.target.lastVerifiedAt ? ` • Verified ${new Date(props.target.lastVerifiedAt).toLocaleString()}` : ''}
            {props.target.staleReason ? ` • ${props.target.staleReason}` : ''}
          </p>
        </div>
      </div>
      <ProfileSourceDebugReviewModal
        busy={props.busy}
        details={reviewDetails}
        errorMessage={reviewError}
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
