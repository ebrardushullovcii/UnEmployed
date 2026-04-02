import { useEffect, useId, useMemo, useState } from 'react'
import type {
  EditableSourceInstructionArtifact,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact
} from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { FieldLabel } from '@renderer/components/ui/field'
import { formatStatusLabel } from '../../lib/job-finder-utils'
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
  const learnedInstructionSections = buildLearnedInstructionSections(props.instructionArtifact)
  const targetRuns = useMemo(
    () =>
      props.recentSourceDebugRuns
        .filter((run) => run.targetId === props.target.id)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [props.recentSourceDebugRuns, props.target.id]
  )
  const latestDebugRun = props.target.lastDebugRunId
    ? targetRuns.find((run) => run.id === props.target.lastDebugRunId) ?? null
    : null
  const latestDebugRunLabel = latestDebugRun
    ? `${formatStatusLabel(latestDebugRun.state)}${latestDebugRun.completedAt ? ` • ${new Date(latestDebugRun.completedAt).toLocaleString()}` : ''}`
    : null
  const [reviewOpen, setReviewOpen] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(latestDebugRun?.id ?? targetRuns[0]?.id ?? null)
  const [reviewDetails, setReviewDetails] = useState<SourceDebugRunDetails | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [editingInstruction, setEditingInstruction] = useState<{
    field: LearnedInstructionField
    normalizedKey: string
  } | null>(null)
  const [editingInstructionValue, setEditingInstructionValue] = useState('')

  const updateTarget = (nextTarget: DiscoveryTargetValue) => {
    const nextTargets = [...props.discoveryTargets]
    nextTargets[props.index] = {
      ...nextTarget,
      adapterKind: 'auto'
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

  useEffect(() => {
    if (selectedRunId) {
      return
    }

    setSelectedRunId(latestDebugRun?.id ?? targetRuns[0]?.id ?? null)
  }, [latestDebugRun?.id, selectedRunId, targetRuns])

  useEffect(() => {
    if (!reviewOpen) {
      return
    }

    const nextRunId = selectedRunId ?? latestDebugRun?.id ?? targetRuns[0]?.id ?? null
    if (!nextRunId) {
      setReviewDetails(null)
      return
    }

    let cancelled = false
    setReviewLoading(true)
    setReviewError(null)

    void props.onGetSourceDebugRunDetails(nextRunId)
      .then((details) => {
        if (cancelled) {
          return
        }

        setReviewDetails(details)
        setReviewLoading(false)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setReviewError(error instanceof Error ? error.message : 'Unable to load source-debug run details.')
        setReviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [latestDebugRun?.id, props.onGetSourceDebugRunDetails, reviewOpen, selectedRunId, targetRuns])

  const moveTarget = (direction: -1 | 1) => {
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
  }

  return (
    <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">Target {props.index + 1}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            aria-label={`Debug source for ${displayName} (target ${props.index + 1})`}
            disabled={props.busy || !hasValidAbsoluteStartingUrl(props.target.startingUrl)}
            onClick={() => props.onRunSourceDebug(props.target.id)}
            type="button"
            variant="secondary"
          >
            Debug source
          </Button>
          <Button
            aria-label={`Move ${displayName} up`}
            disabled={props.index === 0}
            onClick={() => moveTarget(-1)}
            type="button"
            variant="ghost"
          >
            Move up
          </Button>
          <Button
            aria-label={`Move ${displayName} down`}
            disabled={props.index === props.discoveryTargets.length - 1}
            onClick={() => moveTarget(1)}
            type="button"
            variant="ghost"
          >
            Move down
          </Button>
          <Button
            aria-label={`Remove ${displayName}`}
            onClick={() => props.updateDiscoveryTargets(props.discoveryTargets.filter((entry) => entry.id !== props.target.id))}
            type="button"
            variant="ghost"
          >
            Remove
          </Button>
        </div>
      </div>

      <div className="grid gap-(--gap-content) md:grid-cols-2">
        <div className="grid h-full min-w-0 content-start gap-(--gap-field)">
          <FieldLabel htmlFor={labelId}>Site label</FieldLabel>
          <ProfileInput id={labelId} onChange={(event) => updateTarget({ ...props.target, label: event.target.value })} value={props.target.label} />
        </div>
        <div className="grid h-full min-w-0 content-start gap-(--gap-field)">
          <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">Target handling</p>
          <p className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-3 py-3 text-[0.92rem] leading-6 text-foreground-soft">
            Resolved automatically from the starting URL and the learned source guidance for this target.
          </p>
        </div>
        <div className="grid h-full min-w-0 content-start gap-(--gap-field) md:col-span-2">
          <FieldLabel htmlFor={startingUrlId}>Starting URL</FieldLabel>
          <ProfileInput
            id={startingUrlId}
            onChange={(event) => updateTarget({ ...props.target, startingUrl: event.target.value })}
            placeholder="https://jobs.example.com/search"
            value={props.target.startingUrl}
          />
        </div>
        <div className="grid h-full min-w-0 content-start gap-(--gap-field) md:col-span-2">
          <FieldLabel htmlFor={instructionsId}>Custom override instructions</FieldLabel>
          <ProfileTextarea
            className="min-h-(--textarea-tall)"
            id={instructionsId}
            onChange={(event) => updateTarget({ ...props.target, customInstructions: event.target.value })}
            placeholder="Optional: add your own override notes. Learned source instructions are stored separately and used automatically."
            rows={4}
            value={props.target.customInstructions}
          />
          <p className="text-[0.82rem] leading-6 text-foreground-soft">
            This field is only for your manual overrides. Debug-source guidance is stored separately so it does not overwrite your notes.
          </p>
        </div>
        {latestDebugRun ? (
          <div className="grid h-full min-w-0 content-start gap-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-3 md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
                Last source-debug run
              </p>
              <Button
                aria-label={`Review the latest source-debug run for ${displayName} (target ${props.index + 1})`}
                disabled={props.busy}
                onClick={() => {
                  setSelectedRunId(latestDebugRun.id)
                  setReviewOpen(true)
                }}
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
            onCheckedChange={(checked) => updateTarget({ ...props.target, enabled: checked })}
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
        onClose={() => setReviewOpen(false)}
        onLoadRun={(runId) => setSelectedRunId(runId)}
        onRerun={() => {
          setReviewOpen(false)
          props.onRunSourceDebug(props.target.id)
        }}
        onVerify={(instructionId) => props.onVerifySourceInstructions(props.target.id, instructionId)}
        open={reviewOpen}
        recentRuns={targetRuns}
        selectedRunId={selectedRunId}
        targetLabel={displayName}
      />
    </div>
  )
}
