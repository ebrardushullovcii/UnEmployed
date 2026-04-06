import { useId } from 'react'
import {
  workModeValues,
  type EditableSourceInstructionArtifact,
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
import { ProfileDiscoveryTargetRow } from './profile-discovery-target-row'
import { ProfileListEditor } from './profile-list-editor'
import { ProfileOptionalSection } from './profile-optional-section'
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
  onSaveSourceInstructionArtifact: (targetId: string, artifact: EditableSourceInstructionArtifact) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  profileForm: UseFormReturn<ProfileEditorValues>
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  sourceInstructionArtifacts: readonly SourceInstructionArtifact[]
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
          description="Keep screening answers separate from resume facts so they are easy to review when an application asks for them."
        />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Authorization</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={authorizedWorkCountriesId}>Authorized work countries</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" id={authorizedWorkCountriesId} placeholder="List countries where you can work without extra sponsorship" rows={4} {...registerProfile('eligibility.authorizedWorkCountries')} />
            </div>
            <BooleanSelectField control={profileControl} id={requiresVisaSponsorshipId} label="Requires visa sponsorship" name="eligibility.requiresVisaSponsorship" />
            <BooleanSelectField control={profileControl} id={remoteEligibleId} label="Can work remotely" name="eligibility.remoteEligible" />
          </div>
        </article>

        <ProfileOptionalSection
          description="Only keep the screening details here that actually come up in your target roles."
          title="Extra screening details"
        >
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={securityClearanceId}>Security clearance</FieldLabel>
              <ProfileInput id={securityClearanceId} {...registerProfile('eligibility.securityClearance')} />
            </div>
          </div>
        </ProfileOptionalSection>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Relocation and travel</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <BooleanSelectField control={profileControl} id={willingToRelocateId} label="Willing to relocate" name="eligibility.willingToRelocate" />
            <BooleanSelectField control={profileControl} id={willingToTravelId} label="Willing to travel" name="eligibility.willingToTravel" />
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={preferredRelocationRegionsId}>Preferred relocation locations</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" id={preferredRelocationRegionsId} rows={4} {...registerProfile('eligibility.preferredRelocationRegions')} />
            </div>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Availability</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={noticePeriodId}>Notice period (days)</FieldLabel>
              <ProfileInput id={noticePeriodId} min="0" step="1" type="number" {...registerProfile('eligibility.noticePeriodDays')} />
            </div>
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={availableStartDateId}>Available start date</FieldLabel>
              <ProfileInput id={availableStartDateId} placeholder="Leave blank if flexible" {...registerProfile('eligibility.availableStartDate')} />
            </div>
          </div>
        </article>
      </section>

      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Targeting"
          title="Job preferences"
          description="Use this section to specify the roles, locations, and companies to focus on."
        />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Target roles</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <ProfileListEditor
              label="Target roles"
              onChange={(values) => setPreferenceValue('targetRoles', joinListInput(values), listFieldOptions)}
              placeholder="Add a target role"
              values={parseListInput(watchPreferences('targetRoles'))}
            />
            <ProfileListEditor
              label="Related role areas"
              onChange={(values) => setPreferenceValue('jobFamilies', joinListInput(values), listFieldOptions)}
              placeholder="Add a related role area"
              values={parseListInput(watchPreferences('jobFamilies'))}
            />
            <ProfileListEditor
              label="Seniority levels"
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

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
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

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Company preferences</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <ProfileListEditor
              label="Industries"
              onChange={(values) => setPreferenceValue('targetIndustries', joinListInput(values), listFieldOptions)}
              placeholder="Add an industry"
              values={parseListInput(watchPreferences('targetIndustries'))}
            />
            <ProfileListEditor
              label="Company stages or sizes"
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
              label="Companies to exclude"
              onChange={(values) => setPreferenceValue('companyBlacklist', joinListInput(values), listFieldOptions)}
              placeholder="Add a company to exclude"
              values={parseListInput(watchPreferences('companyBlacklist'))}
            />
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
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
                  <FieldLabel htmlFor={tailoringModeId}>Default resume tailoring style</FieldLabel>
                  <FormSelect
                    onValueChange={field.onChange}
                    options={[
                      { label: 'Light touch', value: 'conservative' },
                      { label: 'Balanced', value: 'balanced' },
                      { label: 'Strong rewrite', value: 'aggressive' }
                    ]}
                    placeholder="Select a style"
                    triggerClassName={profileSelectTriggerClassName}
                    triggerId={tailoringModeId}
                    value={field.value}
                  />
                </div>
              )}
            />

            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={minimumSalaryId}>Minimum salary (USD)</FieldLabel>
              <ProfileInput id={minimumSalaryId} min="0" step="1" type="number" {...registerPreferences('minimumSalaryUsd')} />
            </div>
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={targetSalaryId}>Target salary (USD)</FieldLabel>
              <ProfileInput id={targetSalaryId} min="0" step="1" type="number" {...registerPreferences('targetSalaryUsd')} />
            </div>
          </div>
        </article>

        <ProfileOptionalSection
          description="Leave this closed unless you are tracking compensation in something other than the default USD view."
          title="International salary details"
        >
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
            <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
              <FieldLabel htmlFor={salaryCurrencyId}>Salary currency</FieldLabel>
              <ProfileInput id={salaryCurrencyId} placeholder="Defaults to USD" {...registerPreferences('salaryCurrency')} />
            </div>
          </div>
        </ProfileOptionalSection>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Job sources</h3>
              <p className="text-[0.9rem] leading-6 text-foreground-soft">Add the job boards or company career pages to use here. Each source can save reusable guidance after a quick source check.</p>
            </div>
            <Button onClick={addDiscoveryTarget} type="button" variant="secondary">Add source</Button>
          </div>

          <div className="grid gap-3">
            {discoveryTargets.length === 0 ? (
              <p className="text-[0.9rem] leading-6 text-foreground-soft">No job sources yet. Add the first source to use here.</p>
            ) : null}

            {discoveryTargets.map((target, index) => {
              const instructionArtifactId = target.draftInstructionId ?? target.validatedInstructionId
              const instructionArtifact = instructionArtifactId
                ? sourceInstructionArtifacts.find((artifact) => artifact.id === instructionArtifactId) ?? null
                : null

              return (
                <ProfileDiscoveryTargetRow
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
