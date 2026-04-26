import {
  workModeValues,
  type EditableSourceInstructionArtifact,
  type SourceAccessPrompt,
  type SourceDebugRunDetails,
  type SourceDebugRunRecord,
  type SourceInstructionArtifact
} from '@unemployed/contracts'
import { useId } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Button } from '@renderer/components/ui/button'
import { FieldLabel } from '@renderer/components/ui/field'
import { CheckboxField } from '../checkbox-field'
import { FormSelect } from '../form-select'
import type { SearchPreferencesEditorValues } from '../../lib/profile-editor'
import { formatStatusLabel, joinListInput, parseListInput } from '../../lib/job-finder-utils'
import { ProfileInput, profileSelectTriggerClassName } from './profile-form-primitives'
import { ProfileDiscoveryTargetRow } from './profile-discovery-target-row'
import { ProfileListEditor } from './profile-list-editor'
import { ProfileOptionalSection } from './profile-optional-section'
import { ProfileSectionHeader } from './profile-section-header'

export function ProfilePreferencesTargetingSection(props: {
  addDiscoveryTarget: () => void
  busy: boolean
  discoveryTargets: SearchPreferencesEditorValues['discoveryTargets']
  isBrowserSessionPending: boolean
  isSourceDebugPending: (targetId: string) => boolean
  isSourceInstructionPending: (targetId: string) => boolean
  isSourceInstructionVerifyPending: (instructionId: string) => boolean
  isTargetDiscoveryPending: (targetId: string) => boolean
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onOpenBrowserSessionForTarget: (targetId: string) => void
  onRunDiscoveryForTarget?: (targetId: string) => void
  onRunSourceDebug: (targetId: string) => void
  onSaveSourceInstructionArtifact: (targetId: string, artifact: EditableSourceInstructionArtifact) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  sourceAccessPrompts: readonly SourceAccessPrompt[]
  sourceInstructionArtifacts: readonly SourceInstructionArtifact[]
  updateDiscoveryTargets: (nextTargets: SearchPreferencesEditorValues['discoveryTargets']) => void
}) {
  const { control, register, setValue, watch } = props.preferencesForm
  const tailoringModeId = useId()
  const minimumSalaryId = useId()
  const targetSalaryId = useId()
  const salaryCurrencyId = useId()
  const listFieldOptions = { shouldDirty: true, shouldTouch: true, shouldValidate: true } as const

  return (
    <section className="grid content-start gap-(--gap-card)">
      <ProfileSectionHeader
        eyebrow="Targeting"
        title="Job preferences"
        description="Use this section to specify the roles, locations, and companies to focus on."
      />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Target roles</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <ProfileListEditor inputId="profile-setup-field-search-preferences-target-roles" label="Target roles" onChange={(values) => setValue('targetRoles', joinListInput(values), listFieldOptions)} placeholder="Add a target role" values={parseListInput(watch('targetRoles'))} />
          <ProfileListEditor label="Related role areas" onChange={(values) => setValue('jobFamilies', joinListInput(values), listFieldOptions)} placeholder="Add a related role area" values={parseListInput(watch('jobFamilies'))} />
          <ProfileListEditor label="Seniority levels" onChange={(values) => setValue('seniorityLevels', joinListInput(values), listFieldOptions)} placeholder="Add a seniority level" values={parseListInput(watch('seniorityLevels'))} />
          <ProfileListEditor label="Employment types" onChange={(values) => setValue('employmentTypes', joinListInput(values), listFieldOptions)} placeholder="Add an employment type" values={parseListInput(watch('employmentTypes'))} />
        </div>
      </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Location preferences</h3>
          <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <ProfileListEditor inputId="profile-setup-field-search-preferences-locations" label="Preferred locations" onChange={(values) => setValue('locations', joinListInput(values), listFieldOptions)} placeholder="Add a preferred location" values={parseListInput(watch('locations'))} />
          <ProfileListEditor label="Excluded locations" onChange={(values) => setValue('excludedLocations', joinListInput(values), listFieldOptions)} placeholder="Add an excluded location" values={parseListInput(watch('excludedLocations'))} />
        </div>
      </article>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Company preferences</h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <ProfileListEditor label="Industries" onChange={(values) => setValue('targetIndustries', joinListInput(values), listFieldOptions)} placeholder="Add an industry" values={parseListInput(watch('targetIndustries'))} />
          <ProfileListEditor label="Company stages or sizes" onChange={(values) => setValue('targetCompanyStages', joinListInput(values), listFieldOptions)} placeholder="Add a company stage or size" values={parseListInput(watch('targetCompanyStages'))} />
          <ProfileListEditor label="Preferred companies" onChange={(values) => setValue('companyWhitelist', joinListInput(values), listFieldOptions)} placeholder="Add a preferred company" values={parseListInput(watch('companyWhitelist'))} />
          <ProfileListEditor label="Companies to exclude" onChange={(values) => setValue('companyBlacklist', joinListInput(values), listFieldOptions)} placeholder="Add a company to exclude" values={parseListInput(watch('companyBlacklist'))} />
        </div>
      </article>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Work mode and compensation</h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <fieldset className="grid gap-(--gap-field) md:col-span-2" id="profile-setup-field-search-preferences-work-modes">
            <legend className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">Work modes</legend>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {workModeValues.map((workMode) => (
                <Controller
                  key={workMode}
                  control={control}
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
            control={control}
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

          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={minimumSalaryId}>Minimum salary (USD)</FieldLabel><ProfileInput id={minimumSalaryId} min="0" step="1" type="number" {...register('minimumSalaryUsd')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={targetSalaryId}>Target salary (USD)</FieldLabel><ProfileInput id={targetSalaryId} min="0" step="1" type="number" {...register('targetSalaryUsd')} /></div>
        </div>
      </article>

      <ProfileOptionalSection
        defaultOpen={Boolean(watch('salaryCurrency'))}
        description="Leave this closed unless you are tracking compensation in something other than the default USD view."
        title="International salary details"
      >
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
            <FieldLabel htmlFor={salaryCurrencyId}>Salary currency</FieldLabel>
            <ProfileInput id={salaryCurrencyId} placeholder="Defaults to USD" {...register('salaryCurrency')} />
          </div>
        </div>
      </ProfileOptionalSection>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Job sources</h3>
            <p className="text-[0.9rem] leading-6 text-foreground-soft">Add the job boards or company career pages to search. Each source can save reusable guidance after a quick source check.</p>
          </div>
          <Button onClick={props.addDiscoveryTarget} type="button" variant="secondary">Add source</Button>
        </div>

        <div className="grid gap-3">
          {props.discoveryTargets.length === 0 ? (
            <p className="text-[0.9rem] leading-6 text-foreground-soft">No job sources yet. Add the first source to search.</p>
          ) : null}

          {props.discoveryTargets.map((target, index) => {
            const instructionArtifactId = target.draftInstructionId ?? target.validatedInstructionId
            const instructionArtifact = instructionArtifactId
              ? props.sourceInstructionArtifacts.find((artifact) => artifact.id === instructionArtifactId) ?? null
              : null

            return (
              <ProfileDiscoveryTargetRow
                busy={props.busy}
                discoveryTargets={props.discoveryTargets}
                index={index}
                instructionArtifact={instructionArtifact}
                isBrowserSessionPending={props.isBrowserSessionPending}
                isSourceDebugPending={props.isSourceDebugPending}
                isSourceInstructionPending={props.isSourceInstructionPending}
                isSourceInstructionVerifyPending={props.isSourceInstructionVerifyPending}
                isTargetDiscoveryPending={props.isTargetDiscoveryPending}
                key={target.id}
                onGetSourceDebugRunDetails={props.onGetSourceDebugRunDetails}
                onOpenBrowserSessionForTarget={props.onOpenBrowserSessionForTarget}
                {...(props.onRunDiscoveryForTarget ? { onRunDiscoveryForTarget: props.onRunDiscoveryForTarget } : {})}
                onRunSourceDebug={props.onRunSourceDebug}
                onSaveSourceInstructionArtifact={props.onSaveSourceInstructionArtifact}
                onVerifySourceInstructions={props.onVerifySourceInstructions}
                recentSourceDebugRuns={props.recentSourceDebugRuns}
                sourceAccessPrompt={props.sourceAccessPrompts.find((prompt) => prompt.targetId === target.id) ?? null}
                target={target}
                updateDiscoveryTargets={props.updateDiscoveryTargets}
              />
            )
          })}
        </div>
      </article>
    </section>
  )
}
