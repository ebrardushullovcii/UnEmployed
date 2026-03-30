import { useEffect, useId, useMemo, useState } from 'react'
import {
  workModeValues,
  type SourceDebugRunDetails,
  type SourceDebugRunRecord,
  type SourceInstructionArtifact
} from '@unemployed/contracts'
import type { Control, UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Button } from '@renderer/components/ui/button'
import { FieldLabel } from '@renderer/components/ui/field'
import { CheckboxField } from '../checkbox-field'
import { FormSelect } from '../form-select'
import type { BooleanSelectValue } from '../../lib/job-finder-types'
import type { ProfileEditorValues, SearchPreferencesEditorValues } from '../../lib/profile-editor'
import { formatStatusLabel, joinListInput, parseListInput } from '../../lib/job-finder-utils'
import { ProfileInput, ProfileTextarea, profileSelectTriggerClassName } from './profile-form-primitives'
import { ProfileListEditor } from './profile-list-editor'
import { ProfileSourceDebugReviewModal } from './profile-source-debug-review-modal'
import { ProfileSectionHeader } from './profile-section-header'

const booleanSelectOptions = [
  { label: 'Not set', value: '' },
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' }
]

function BooleanSelectField(props: {
  control: Control<ProfileEditorValues>
  id?: string
  label: string
  name:
    | 'eligibility.remoteEligible'
    | 'eligibility.requiresVisaSponsorship'
    | 'eligibility.willingToRelocate'
    | 'eligibility.willingToTravel'
}) {
  const generatedId = useId()
  const fieldId = props.id ?? generatedId

  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
          <FieldLabel htmlFor={fieldId}>{props.label}</FieldLabel>
          <FormSelect
            onValueChange={(value) => field.onChange(value as BooleanSelectValue)}
            options={booleanSelectOptions}
            placeholder="Not set"
            triggerClassName={profileSelectTriggerClassName}
            triggerId={fieldId}
            value={field.value}
          />
        </div>
      )}
    />
  )
}

interface ProfilePreferencesTabProps {
  busy: boolean
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onRunSourceDebug: (targetId: string) => void
  onSaveSourceInstructionArtifact: (targetId: string, artifact: SourceInstructionArtifact) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  profileForm: UseFormReturn<ProfileEditorValues>
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  sourceInstructionArtifacts: readonly SourceInstructionArtifact[]
}

type DiscoveryTargetValue = SearchPreferencesEditorValues['discoveryTargets'][number]
type LearnedInstructionField = 'navigationGuidance' | 'searchGuidance' | 'detailGuidance' | 'applyGuidance' | 'warnings'

interface LearnedInstructionSection {
  field: LearnedInstructionField
  label: string
  lines: Array<{
    displayText: string
    normalizedKey: string
    sourceText: string
  }>
}

function normalizeLearnedInstructionLine(value: string): string {
  return value
    .replace(/^(Reliable control|Filter note|Navigation note|Apply note|Validated behavior|Validated navigation|Verification):\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isRenderableLearnedInstructionLine(line: string): boolean {
  const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim()
  const isUrlLiteral = normalized.includes('http://') || normalized.includes('https://')
  const isOnlyStartingUrlRestatement =
    (normalized.startsWith('start from ') || normalized.startsWith('started from ')) &&
    (isUrlLiteral || normalized.includes('the starting url'))

  return !(
    /^(clicked|filled|selected|link|button|searchbox|textbox|combobox)\b/.test(normalized) ||
    normalized.startsWith('click failed ') ||
    normalized.includes('locator click') ||
    normalized.includes('call log') ||
    normalized.includes('waiting for getbyrole') ||
    normalized.includes('element is not visible') ||
    normalized.includes('retrying click action') ||
    isOnlyStartingUrlRestatement ||
    normalized.startsWith('stay within ') ||
    normalized.startsWith('verify whether the site is reachable') ||
    normalized.startsWith('find search controls or filters') ||
    normalized.startsWith('open multiple job details') ||
    normalized.startsWith('check whether discovered jobs expose') ||
    normalized.startsWith('inspected discovered jobs for apply entry points') ||
    normalized.startsWith('observed canonical job detail url ') ||
    normalized.startsWith('no reliable apply path was confirmed for ') ||
    normalized.startsWith('replay verification reached ') ||
    normalized.startsWith('reliable control: no login or consent wall detected') ||
    normalized.includes('fully accessible without login or consent walls') ||
    normalized.includes('fully accessible without login or consent barriers') ||
    normalized.includes('no authentication required') ||
    normalized.includes('without auth required') ||
    normalized.includes('loads without auth') ||
    normalized.includes('loads without login') ||
    normalized.includes('without login or consent barriers') ||
    normalized.includes('accessible without login barriers') ||
    normalized.includes('no auth or consent blockers detected') ||
    normalized.includes('no auth consent blockers detected') ||
    normalized.includes('no auth consent popups') ||
    normalized.includes('no login auth or consent blockers detected') ||
    normalized.includes('page is scrollable with substantial content') ||
    normalized.includes('job extraction tool confirmed') ||
    normalized.includes('extract jobs tool') ||
    normalized.includes('extract_jobs tool') ||
    normalized.includes('extract_jobs returned') ||
    normalized.includes('get interactive elements') ||
    normalized.includes('get_interactive_elements') ||
    normalized.includes('interactive elements detection was unreliable') ||
    normalized.includes('interactive elements were unreliable') ||
    normalized.includes('site title is in albanian') ||
    normalized.includes('site is a job board') ||
    normalized.includes('page language is ') ||
    normalized.includes('job listings appear to be in ') ||
    normalized.includes('means find jobs') ||
    normalized.includes('interactive elements not detected') ||
    normalized.includes('interaction timed out') ||
    normalized.includes('multiple timeouts observed') ||
    normalized.includes('requires longer timeout') ||
    normalized.includes('different extraction timing') ||
    normalized.includes('different extraction approach') ||
    normalized.includes('different interaction method') ||
    normalized.includes('manual dom inspection') ||
    normalized.includes('pointer events') ||
    normalized.includes('pointer event interception') ||
    normalized.includes('javascript enabled interaction') ||
    normalized.includes('current extraction') ||
    normalized.includes('no jobs matching target roles') ||
    normalized.includes('apply process not yet verified') ||
    normalized.includes('apply mechanism not yet verified') ||
    normalized.includes('job details not extracted') ||
    normalized.includes('job details and apply flow not fully verified') ||
    normalized.includes('llm call failed') ||
    normalized.includes('discovery encountered an error') ||
    normalized.includes('unknown error') ||
    isUrlLiteral ||
    normalized.startsWith('verification: ') ||
    normalized.includes('produced no candidate jobs') ||
    /produced \d+ candidate job result/.test(normalized)
  )
}

function describeLearnedInstructionUsage(artifact: SourceInstructionArtifact | null): string {
  if (!artifact) {
    return 'Generated by the source-debug run.'
  }

  if (artifact.status === 'validated') {
    return 'Generated by the source-debug run and used automatically during discovery and supported apply flows for this target.'
  }

  if (artifact.status === 'draft') {
    return 'This draft is used automatically for this target during discovery and supported apply flows while it remains the latest learned guidance.'
  }

  return 'Generated by the source-debug run.'
}

function buildLearnedInstructionSections(artifact: SourceInstructionArtifact | null): LearnedInstructionSection[] {
  if (!artifact) {
    return []
  }

  const seen = new Set<string>()
  const buildSection = (
    field: LearnedInstructionField,
    label: string,
    values: readonly string[],
    formatValue: (value: string) => string = (value) => value
  ): LearnedInstructionSection | null => {
    const lines = values
      .map((sourceText) => ({
        sourceText,
        displayText: normalizeLearnedInstructionLine(formatValue(sourceText))
      }))
      .filter((line) => line.displayText.length > 0)
      .filter((line) => isRenderableLearnedInstructionLine(line.displayText))
      .filter((line) => {
        const key = line.displayText.toLowerCase()

        if (seen.has(key)) {
          return false
        }

        seen.add(key)
        return true
      })
      .map((line) => ({
        ...line,
        normalizedKey: line.displayText.toLowerCase()
      }))

    return lines.length > 0 ? { field, label, lines } : null
  }

  return [
    buildSection('navigationGuidance', 'Best entry paths', artifact.navigationGuidance),
    buildSection('searchGuidance', 'Search and filters', artifact.searchGuidance),
    buildSection('detailGuidance', 'Job detail behavior', artifact.detailGuidance),
    buildSection('applyGuidance', 'Apply behavior', artifact.applyGuidance),
    buildSection('warnings', 'Warnings', artifact.warnings, (warning) => `Warning: ${warning}`)
  ].filter((section): section is LearnedInstructionSection => section !== null)
}

function normalizeEditableInstructionInput(field: LearnedInstructionField, value: string): string {
  const trimmed = value.trim()

  if (field === 'warnings') {
    return trimmed.replace(/^warning:\s*/i, '').trim()
  }

  return trimmed
}

function updateArtifactInstructionSection(
  artifact: SourceInstructionArtifact,
  field: LearnedInstructionField,
  normalizedKey: string,
  nextValue: string | null
): SourceInstructionArtifact {
  const currentValues = [...artifact[field]]
  const replacement = nextValue === null ? null : normalizeEditableInstructionInput(field, nextValue)
  const nextValues = currentValues.flatMap((value) => {
    const valueKey = normalizeLearnedInstructionLine(field === 'warnings' ? `Warning: ${value}` : value).toLowerCase()

    if (valueKey !== normalizedKey) {
      return [value]
    }

    return replacement ? [replacement] : []
  })

  return {
    ...artifact,
    [field]: nextValues
  }
}

function TargetRow(props: {
  busy: boolean
  discoveryTargets: readonly DiscoveryTargetValue[]
  index: number
  instructionArtifact: SourceInstructionArtifact | null
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onRunSourceDebug: (targetId: string) => void
  onSaveSourceInstructionArtifact: (targetId: string, artifact: SourceInstructionArtifact) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  target: DiscoveryTargetValue
  updateDiscoveryTargets: (nextTargets: SearchPreferencesEditorValues['discoveryTargets']) => void
}) {
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

  const saveInstructionArtifact = (artifact: SourceInstructionArtifact) => {
    props.onSaveSourceInstructionArtifact(props.target.id, artifact)
  }

  const beginEditingInstruction = (section: LearnedInstructionSection, line: LearnedInstructionSection['lines'][number]) => {
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

  const removeInstructionLine = (section: LearnedInstructionSection, line: LearnedInstructionSection['lines'][number]) => {
    if (!props.instructionArtifact) {
      return
    }

    saveInstructionArtifact(
      updateArtifactInstructionSection(props.instructionArtifact, section.field, line.normalizedKey, null)
    )

    if (
      editingInstruction?.field === section.field &&
      editingInstruction.normalizedKey === line.normalizedKey
    ) {
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

  return (
    <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">Target {props.index + 1}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={props.busy || !props.target.startingUrl.trim()}
            onClick={() => props.onRunSourceDebug(props.target.id)}
            type="button"
            variant="secondary"
          >
            Debug source
          </Button>
          <Button
            aria-label={`Move ${displayName} up`}
            disabled={props.index === 0}
            onClick={() => {
              const nextTargets = [...props.discoveryTargets]
              const currentTarget = nextTargets[props.index]
              const previousTarget = nextTargets[props.index - 1]
              if (!currentTarget || !previousTarget) {
                return
              }
              nextTargets[props.index - 1] = currentTarget
              nextTargets[props.index] = previousTarget
              props.updateDiscoveryTargets(nextTargets)
            }}
            type="button"
            variant="ghost"
          >
            Move up
          </Button>
          <Button
            aria-label={`Move ${displayName} down`}
            disabled={props.index === props.discoveryTargets.length - 1}
            onClick={() => {
              const nextTargets = [...props.discoveryTargets]
              const currentTarget = nextTargets[props.index]
              const followingTarget = nextTargets[props.index + 1]
              if (!currentTarget || !followingTarget) {
                return
              }
              nextTargets[props.index] = followingTarget
              nextTargets[props.index + 1] = currentTarget
              props.updateDiscoveryTargets(nextTargets)
            }}
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
        <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
          <FieldLabel htmlFor={labelId}>Site label</FieldLabel>
          <ProfileInput
            id={labelId}
            onChange={(event) => updateTarget({ ...props.target, label: event.target.value })}
            value={props.target.label}
          />
        </div>
        <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
          <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">Target handling</p>
          <p className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-3 py-3 text-[0.92rem] leading-6 text-foreground-soft">
            Resolved automatically from the starting URL and the learned source guidance for this target.
          </p>
        </div>
        <div className="grid min-w-0 content-start gap-(--gap-field) h-full md:col-span-2">
          <FieldLabel htmlFor={startingUrlId}>Starting URL</FieldLabel>
          <ProfileInput
            id={startingUrlId}
            onChange={(event) => updateTarget({ ...props.target, startingUrl: event.target.value })}
            placeholder="https://jobs.example.com/search"
            value={props.target.startingUrl}
          />
        </div>
        <div className="grid min-w-0 content-start gap-(--gap-field) h-full md:col-span-2">
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
          <div className="grid min-w-0 content-start gap-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-3 h-full md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
                Last source-debug run
              </p>
              <Button
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
            <p className="text-[0.88rem] leading-6 text-foreground">
              {latestDebugRunLabel}
            </p>
            {latestDebugRun.manualPrerequisiteSummary || latestDebugRun.finalSummary ? (
              <p className="text-[0.82rem] leading-6 text-foreground-soft">
                {latestDebugRun.manualPrerequisiteSummary ?? latestDebugRun.finalSummary}
              </p>
            ) : null}
          </div>
        ) : null}
        {learnedInstructionSections.length > 0 ? (
          <div className="grid min-w-0 content-start gap-(--gap-field) rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-3 h-full md:col-span-2">
            <div className="grid gap-1">
              <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
                Learned source instructions
              </p>
              <p className="text-[0.82rem] leading-6 text-foreground-soft">
                {describeLearnedInstructionUsage(props.instructionArtifact)}
              </p>
            </div>
            <div className="grid gap-3">
              {learnedInstructionSections.map((section) => (
                <div key={`${props.target.id}_${section.label}`} className="grid gap-2">
                  <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">
                    {section.label}
                  </p>
                  <ul className="grid gap-2 text-[0.88rem] leading-6 text-foreground">
                    {section.lines.map((line, lineIndex) => {
                      const isEditing =
                        editingInstruction?.field === section.field &&
                        editingInstruction.normalizedKey === line.normalizedKey

                      return (
                      <li
                        key={`${props.target.id}_${section.label}_${lineIndex}`}
                        className="grid gap-3 rounded-(--radius-small) border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2"
                      >
                        {isEditing ? (
                          <div className="grid gap-2">
                            <ProfileTextarea
                              className="min-h-[7rem]"
                              onChange={(event) => setEditingInstructionValue(event.target.value)}
                              rows={4}
                              value={editingInstructionValue}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={props.busy || normalizeEditableInstructionInput(section.field, editingInstructionValue).length === 0}
                                onClick={persistEditedInstruction}
                                type="button"
                                variant="secondary"
                              >
                                Save
                              </Button>
                              <Button disabled={props.busy} onClick={cancelEditingInstruction} type="button" variant="ghost">
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <span className="min-w-0 flex-1">{line.displayText}</span>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Button
                                disabled={props.busy}
                                onClick={() => beginEditingInstruction(section, line)}
                                type="button"
                                variant="ghost"
                              >
                                Edit
                              </Button>
                              <Button
                                disabled={props.busy}
                                onClick={() => removeInstructionLine(section, line)}
                                type="button"
                                variant="ghost"
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-2 md:col-span-2">
          <CheckboxField
            checked={props.target.enabled}
            label="Enabled for sequential discovery runs"
            onCheckedChange={(checked) => updateTarget({ ...props.target, enabled: checked })}
          />
          <p className="text-[0.82rem] leading-6 text-foreground-soft">
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

export function ProfilePreferencesTab({
  busy,
  onGetSourceDebugRunDetails,
  onRunSourceDebug,
  onSaveSourceInstructionArtifact,
  onVerifySourceInstructions,
  preferencesForm,
  profileForm,
  recentSourceDebugRuns,
  sourceInstructionArtifacts
}: ProfilePreferencesTabProps) {
  const { control: preferenceControl, register: registerPreferences, setValue: setPreferenceValue, watch: watchPreferences } = preferencesForm
  const { control: profileControl, register: registerProfile } = profileForm
  const authorizedWorkCountriesId = useId()
  const preferredRelocationRegionsId = useId()
  const requiresVisaSponsorshipId = useId()
  const remoteEligibleId = useId()
  const securityClearanceId = useId()
  const willingToRelocateId = useId()
  const willingToTravelId = useId()
  const noticePeriodId = useId()
  const availableStartDateId = useId()
  const tailoringModeId = useId()
  const minimumSalaryId = useId()
  const targetSalaryId = useId()
  const salaryCurrencyId = useId()
  const listFieldOptions = { shouldDirty: true, shouldTouch: true, shouldValidate: true } as const
  const discoveryTargets = watchPreferences('discoveryTargets')

  const updateDiscoveryTargets = (nextTargets: SearchPreferencesEditorValues['discoveryTargets']) => {
    setPreferenceValue('discoveryTargets', nextTargets, listFieldOptions)
  }

  const createDiscoveryTargetId = () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return `target_${globalThis.crypto.randomUUID()}`
    }

    return `target_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }

  const addDiscoveryTarget = () => {
    updateDiscoveryTargets([
      ...discoveryTargets,
      {
        id: createDiscoveryTargetId(),
        label: '',
        startingUrl: '',
        enabled: true,
        adapterKind: 'auto',
        customInstructions: '',
        instructionStatus: 'missing',
        validatedInstructionId: null,
        draftInstructionId: null,
        lastDebugRunId: null,
        lastVerifiedAt: null,
        staleReason: null
      }
    ])
  }

  return (
    <div className="grid gap-6">
      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Preferences"
          title="Work eligibility"
          description="Keep the screening-style answers separate from your resume facts so they are easy to review when a form asks for them."
        />

        <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Authorization</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={authorizedWorkCountriesId}>Authorized work countries</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" id={authorizedWorkCountriesId} rows={4} {...registerProfile('eligibility.authorizedWorkCountries')} />
            </div>
            <BooleanSelectField control={profileControl} id={requiresVisaSponsorshipId} label="Requires visa sponsorship" name="eligibility.requiresVisaSponsorship" />
            <BooleanSelectField control={profileControl} id={remoteEligibleId} label="Remote eligible" name="eligibility.remoteEligible" />
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={securityClearanceId}>Security clearance</FieldLabel>
              <ProfileInput id={securityClearanceId} {...registerProfile('eligibility.securityClearance')} />
            </div>
          </div>
        </article>

        <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Relocation and travel</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <BooleanSelectField control={profileControl} id={willingToRelocateId} label="Willing to relocate" name="eligibility.willingToRelocate" />
            <BooleanSelectField control={profileControl} id={willingToTravelId} label="Willing to travel" name="eligibility.willingToTravel" />
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={preferredRelocationRegionsId}>Preferred relocation regions</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" id={preferredRelocationRegionsId} rows={4} {...registerProfile('eligibility.preferredRelocationRegions')} />
            </div>
          </div>
        </article>

        <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Availability</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={noticePeriodId}>Notice period (days)</FieldLabel>
              <ProfileInput id={noticePeriodId} min="0" step="1" type="number" {...registerProfile('eligibility.noticePeriodDays')} />
            </div>
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={availableStartDateId}>Available start date</FieldLabel>
              <ProfileInput id={availableStartDateId} placeholder="YYYY-MM-DD" {...registerProfile('eligibility.availableStartDate')} />
            </div>
          </div>
        </article>
      </section>

      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Targeting"
          title="Job preferences"
          description="Use this section for search rules and job targeting once the core profile looks right."
        />

        <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Target roles</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <ProfileListEditor
              label="Target roles"
              onChange={(values) => setPreferenceValue('targetRoles', joinListInput(values), listFieldOptions)}
              placeholder="Add a target role"
              values={parseListInput(watchPreferences('targetRoles'))}
            />
            <ProfileListEditor
              label="Job families"
              onChange={(values) => setPreferenceValue('jobFamilies', joinListInput(values), listFieldOptions)}
              placeholder="Add a job family"
              values={parseListInput(watchPreferences('jobFamilies'))}
            />
            <ProfileListEditor
              label="Seniority"
              onChange={(values) => setPreferenceValue('seniorityLevels', joinListInput(values), listFieldOptions)}
              placeholder="Add a seniority level"
              values={parseListInput(watchPreferences('seniorityLevels'))}
            />
            <ProfileListEditor
              label="Employment types"
              onChange={(values) => setPreferenceValue('employmentTypes', joinListInput(values), listFieldOptions)}
              placeholder="Add an employment type"
              values={parseListInput(watchPreferences('employmentTypes'))}
            />
          </div>
        </article>

        <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Location preferences</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <ProfileListEditor
              label="Preferred locations"
              onChange={(values) => setPreferenceValue('locations', joinListInput(values), listFieldOptions)}
              placeholder="Add a preferred location"
              values={parseListInput(watchPreferences('locations'))}
            />
            <ProfileListEditor
              label="Excluded locations"
              onChange={(values) => setPreferenceValue('excludedLocations', joinListInput(values), listFieldOptions)}
              placeholder="Add an excluded location"
              values={parseListInput(watchPreferences('excludedLocations'))}
            />
          </div>
        </article>

        <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Company preferences</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <ProfileListEditor
              label="Industries"
              onChange={(values) => setPreferenceValue('targetIndustries', joinListInput(values), listFieldOptions)}
              placeholder="Add an industry"
              values={parseListInput(watchPreferences('targetIndustries'))}
            />
            <ProfileListEditor
              label="Company stages / sizes"
              onChange={(values) => setPreferenceValue('targetCompanyStages', joinListInput(values), listFieldOptions)}
              placeholder="Add a company stage or size"
              values={parseListInput(watchPreferences('targetCompanyStages'))}
            />
            <ProfileListEditor
              label="Preferred companies"
              onChange={(values) => setPreferenceValue('companyWhitelist', joinListInput(values), listFieldOptions)}
              placeholder="Add a preferred company"
              values={parseListInput(watchPreferences('companyWhitelist'))}
            />
            <ProfileListEditor
              label="Blocked companies"
              onChange={(values) => setPreferenceValue('companyBlacklist', joinListInput(values), listFieldOptions)}
              placeholder="Add a blocked company"
              values={parseListInput(watchPreferences('companyBlacklist'))}
            />
          </div>
        </article>

        <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Work mode and compensation</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <fieldset className="grid gap-(--gap-field) md:col-span-2">
              <legend className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">Work modes</legend>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {workModeValues.map((workMode) => (
                  <Controller
                    key={workMode}
                    control={preferenceControl}
                    name="workModes"
                    render={({ field }) => (
                      <CheckboxField
                        checked={field.value.includes(workMode)}
                        label={formatStatusLabel(workMode)}
                        onCheckedChange={(checked) =>
                          field.onChange(
                            checked
                              ? [...field.value, workMode]
                              : field.value.filter((value) => value !== workMode)
                          )
                        }
                      />
                    )}
                  />
                ))}
              </div>
            </fieldset>

            <Controller
              control={preferenceControl}
              name="tailoringMode"
              render={({ field }) => (
                <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
                  <FieldLabel htmlFor={tailoringModeId}>Tailoring mode</FieldLabel>
                  <FormSelect
                    onValueChange={field.onChange}
                    options={[
                      { label: 'Conservative', value: 'conservative' },
                      { label: 'Balanced', value: 'balanced' },
                      { label: 'Aggressive', value: 'aggressive' }
                    ]}
                    placeholder="Select mode"
                    triggerClassName={profileSelectTriggerClassName}
                    triggerId={tailoringModeId}
                    value={field.value}
                  />
                </div>
              )}
            />

            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={minimumSalaryId}>Minimum salary</FieldLabel>
              <ProfileInput id={minimumSalaryId} min="0" step="1" type="number" {...registerPreferences('minimumSalaryUsd')} />
            </div>
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={targetSalaryId}>Target salary</FieldLabel>
              <ProfileInput id={targetSalaryId} min="0" step="1" type="number" {...registerPreferences('targetSalaryUsd')} />
            </div>
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={salaryCurrencyId}>Salary currency</FieldLabel>
              <ProfileInput id={salaryCurrencyId} {...registerPreferences('salaryCurrency')} />
            </div>
          </div>
        </article>

        <article className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Discovery targets</h3>
              <p className="text-[0.9rem] leading-6 text-foreground-soft">Configure the ordered entrypoints the discovery agent should run through. Each target is treated as a site-specific flow learned from its own starting URL and debug evidence.</p>
            </div>
            <Button onClick={addDiscoveryTarget} type="button" variant="secondary">Add target</Button>
          </div>

          <div className="grid gap-3">
            {discoveryTargets.length === 0 ? (
              <p className="text-[0.9rem] leading-6 text-foreground-soft">No discovery targets configured yet. Add the first site entrypoint you want the debugger to learn and reuse.</p>
            ) : null}

            {discoveryTargets.map((target, index) => {
              const instructionArtifactId = target.draftInstructionId ?? target.validatedInstructionId
              const instructionArtifact = instructionArtifactId
                ? sourceInstructionArtifacts.find((artifact) => artifact.id === instructionArtifactId) ?? null
                : null

              return (
              <TargetRow
                busy={busy}
                discoveryTargets={discoveryTargets}
                index={index}
                instructionArtifact={instructionArtifact}
                key={target.id}
                onGetSourceDebugRunDetails={onGetSourceDebugRunDetails}
                onRunSourceDebug={onRunSourceDebug}
                onSaveSourceInstructionArtifact={onSaveSourceInstructionArtifact}
                onVerifySourceInstructions={onVerifySourceInstructions}
                recentSourceDebugRuns={recentSourceDebugRuns}
                target={target}
                updateDiscoveryTargets={updateDiscoveryTargets}
              />
              )
            })}
          </div>
        </article>
      </section>
    </div>
  )
}
