import { useId } from 'react'
import { jobSourceAdapterKindValues, workModeValues } from '@unemployed/contracts'
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
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  profileForm: UseFormReturn<ProfileEditorValues>
}

type DiscoveryTargetValue = SearchPreferencesEditorValues['discoveryTargets'][number]

function TargetRow(props: {
  discoveryTargets: readonly DiscoveryTargetValue[]
  index: number
  profileSelectTriggerClassName: string
  target: DiscoveryTargetValue
  updateDiscoveryTargets: (nextTargets: SearchPreferencesEditorValues['discoveryTargets']) => void
}) {
  const baseId = useId()
  const labelId = `${baseId}-label`
  const adapterId = `${baseId}-adapter`
  const startingUrlId = `${baseId}-starting-url`
  const instructionsId = `${baseId}-instructions`
  const genericSiteWarningId = `${baseId}-generic-site-warning`
  const adapterDescribedBy = props.target.adapterKind === 'generic_site' ? genericSiteWarningId : undefined
  const displayName = props.target.label.trim() || `Target ${props.index + 1}`
  const updateTarget = (nextTarget: DiscoveryTargetValue) => {
    const nextTargets = [...props.discoveryTargets]
    nextTargets[props.index] = nextTarget
    props.updateDiscoveryTargets(nextTargets)
  }

  return (
    <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">Target {props.index + 1}</p>
        <div className="flex flex-wrap gap-2">
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
          <FieldLabel htmlFor={adapterId}>Adapter</FieldLabel>
          <FormSelect
            onValueChange={(value) => {
              updateTarget({
                ...props.target,
                adapterKind: value as SearchPreferencesEditorValues['discoveryTargets'][number]['adapterKind']
              })
            }}
            options={jobSourceAdapterKindValues.map((adapterKind) => ({
              label: adapterKind === 'generic_site' ? 'Generic site (experimental)' : formatStatusLabel(adapterKind),
              value: adapterKind
            }))}
            placeholder="Select adapter"
            triggerClassName={props.profileSelectTriggerClassName}
            triggerId={adapterId}
            value={props.target.adapterKind}
            {...(adapterDescribedBy ? { triggerAriaDescribedBy: adapterDescribedBy } : {})}
          />
        </div>
        <div className="grid min-w-0 content-start gap-(--gap-field) h-full md:col-span-2">
          <FieldLabel htmlFor={startingUrlId}>Starting URL</FieldLabel>
          <ProfileInput
            id={startingUrlId}
            onChange={(event) => updateTarget({ ...props.target, startingUrl: event.target.value })}
            placeholder="https://www.linkedin.com/jobs/search/"
            value={props.target.startingUrl}
          />
        </div>
        <div className="grid min-w-0 content-start gap-(--gap-field) h-full md:col-span-2">
          <FieldLabel htmlFor={instructionsId}>Custom navigation instructions</FieldLabel>
          <ProfileTextarea
            className="min-h-(--textarea-tall)"
            id={instructionsId}
            onChange={(event) => updateTarget({ ...props.target, customInstructions: event.target.value })}
            placeholder="Optional: explain how this site exposes jobs, where to click, what sections to trust, or what to avoid."
            rows={4}
            value={props.target.customInstructions}
          />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <CheckboxField
            checked={props.target.enabled}
            label="Enabled for sequential discovery runs"
            onCheckedChange={(checked) => updateTarget({ ...props.target, enabled: checked })}
          />
          {props.target.adapterKind === 'generic_site' ? (
            <p className="text-[0.82rem] leading-6 text-(--warning-text)" id={genericSiteWarningId}>Generic-site discovery stays bounded to this hostname and skips low-confidence jobs without a stable identity.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ProfilePreferencesTab({ preferencesForm, profileForm }: ProfilePreferencesTabProps) {
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
        customInstructions: ''
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
              <p className="text-[0.9rem] leading-6 text-foreground-soft">Configure the ordered site entrypoints the discovery agent should run through. Generic sites stay explicitly experimental.</p>
            </div>
            <Button onClick={addDiscoveryTarget} type="button" variant="secondary">Add target</Button>
          </div>

          <div className="grid gap-3">
            {discoveryTargets.length === 0 ? (
              <p className="text-[0.9rem] leading-6 text-foreground-soft">No discovery targets configured yet. Add a LinkedIn or experimental generic-site entrypoint.</p>
            ) : null}

            {discoveryTargets.map((target, index) => (
              <TargetRow
                discoveryTargets={discoveryTargets}
                index={index}
                key={target.id}
                profileSelectTriggerClassName={profileSelectTriggerClassName}
                target={target}
                updateDiscoveryTargets={updateDiscoveryTargets}
              />
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
