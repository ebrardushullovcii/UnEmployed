import { workModeValues } from '@unemployed/contracts'
import type { Control, UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Badge } from '@renderer/components/ui/badge'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { CheckboxField } from '../checkbox-field'
import { FormSelect } from '../form-select'
import type { BooleanSelectValue } from '../../lib/job-finder-types'
import type { ProfileEditorValues, SearchPreferencesEditorValues } from '../../lib/profile-editor'
import { formatStatusLabel, joinListInput, parseListInput } from '../../lib/job-finder-utils'
import { ProfileInput, ProfileTextarea, profileSelectTriggerClassName } from './profile-form-primitives'
import { ProfileListEditor } from './profile-list-editor'

const booleanSelectOptions = [
  { label: 'Not set', value: '' },
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' }
]

function BooleanSelectField(props: {
  control: Control<ProfileEditorValues>
  label: string
  name:
    | 'eligibility.remoteEligible'
    | 'eligibility.requiresVisaSponsorship'
    | 'eligibility.willingToRelocate'
    | 'eligibility.willingToTravel'
}) {
  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <Field>
          <FieldLabel>{props.label}</FieldLabel>
          <FormSelect
            onValueChange={(value) => field.onChange(value as BooleanSelectValue)}
            options={booleanSelectOptions}
            placeholder="Not set"
            triggerClassName={profileSelectTriggerClassName}
            value={field.value}
          />
        </Field>
      )}
    />
  )
}

interface ProfilePreferencesTabProps {
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  profileForm: UseFormReturn<ProfileEditorValues>
}

export function ProfilePreferencesTab({ preferencesForm, profileForm }: ProfilePreferencesTabProps) {
  const { control: preferenceControl, register: registerPreferences, setValue: setPreferenceValue, watch: watchPreferences } = preferencesForm
  const { control: profileControl, register: registerProfile } = profileForm
  const listFieldOptions = { shouldDirty: true, shouldTouch: true, shouldValidate: true } as const

  return (
    <div className="grid gap-6">
      <section className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-6 grid content-start gap-[var(--gap-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Work eligibility and logistics</p>
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">
              Keep screening answers lower in the page after the core resume and profile content is filled out.
            </p>
          </div>
          <Badge variant="section">Eligibility</Badge>
        </div>

        <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
          <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Work authorization</p>
          <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
            <Field><FieldLabel>Authorized work countries</FieldLabel><ProfileTextarea className="min-h-[var(--textarea-tall)] max-h-[var(--textarea-tall)]" rows={4} {...registerProfile('eligibility.authorizedWorkCountries')} /></Field>
            <BooleanSelectField control={profileControl} label="Requires visa sponsorship" name="eligibility.requiresVisaSponsorship" />
            <BooleanSelectField control={profileControl} label="Remote eligible" name="eligibility.remoteEligible" />
            <Field><FieldLabel>Security clearance</FieldLabel><ProfileInput {...registerProfile('eligibility.securityClearance')} /></Field>
          </div>
        </article>

        <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
          <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Relocation and travel</p>
          <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
            <BooleanSelectField control={profileControl} label="Willing to relocate" name="eligibility.willingToRelocate" />
            <BooleanSelectField control={profileControl} label="Willing to travel" name="eligibility.willingToTravel" />
            <Field><FieldLabel>Preferred relocation regions</FieldLabel><ProfileTextarea className="min-h-[var(--textarea-tall)] max-h-[var(--textarea-tall)]" rows={4} {...registerProfile('eligibility.preferredRelocationRegions')} /></Field>
          </div>
        </article>

        <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
          <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Availability</p>
          <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
            <Field><FieldLabel>Notice period (days)</FieldLabel><ProfileInput min="0" step="1" type="number" {...registerProfile('eligibility.noticePeriodDays')} /></Field>
            <Field><FieldLabel>Available start date</FieldLabel><ProfileInput placeholder="YYYY-MM-DD" {...registerProfile('eligibility.availableStartDate')} /></Field>
          </div>
        </article>
      </section>

      <section className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-6 grid content-start gap-[var(--gap-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Discovery preferences</p>
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">
              Job targeting comes after the candidate record so you set search rules only once the profile itself is solid.
            </p>
          </div>
          <Badge variant="section">Targeting</Badge>
        </div>

        <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
          <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Role targeting</p>
          <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
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

        <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
          <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Location preferences</p>
          <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
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

        <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
          <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Company preferences</p>
          <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
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

        <article className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
          <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Work mode and compensation</p>
          <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
            <div className="grid gap-[var(--gap-field)] md:col-span-2">
              <FieldLabel>Work modes</FieldLabel>
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
            </div>

            <Controller
              control={preferenceControl}
              name="tailoringMode"
              render={({ field }) => (
                <Field>
                  <FieldLabel>Tailoring mode</FieldLabel>
                  <FormSelect
                    onValueChange={field.onChange}
                    options={[
                      { label: 'Conservative', value: 'conservative' },
                      { label: 'Balanced', value: 'balanced' },
                      { label: 'Aggressive', value: 'aggressive' }
                    ]}
                    placeholder="Select mode"
                    triggerClassName={profileSelectTriggerClassName}
                    value={field.value}
                  />
                </Field>
              )}
            />

            <Field><FieldLabel>Minimum salary</FieldLabel><ProfileInput min="0" step="1" type="number" {...registerPreferences('minimumSalaryUsd')} /></Field>
            <Field><FieldLabel>Target salary</FieldLabel><ProfileInput min="0" step="1" type="number" {...registerPreferences('targetSalaryUsd')} /></Field>
            <Field><FieldLabel>Salary currency</FieldLabel><ProfileInput {...registerPreferences('salaryCurrency')} /></Field>
          </div>
        </article>
      </section>
    </div>
  )
}
